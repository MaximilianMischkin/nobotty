/* Nobotty content script. Local only: reads the page and public account info, shows hints. */
(function () {
  'use strict';
  var DAY = 86400000, TTL = 7 * DAY;
  var DEFAULTS = { enabled: true, collapseHigh: true, showMedium: true, trusted: [], dmFilter: true, dmBlockBots: true, dmBlockSellers: true, showStatus: true };
  var cfg = Object.assign({}, DEFAULTS);
  var cache = {};              // name -> {t, created, karma, err}
  var queue = [], queued = {}; // fetch queue (1 request per ~1.1 s)
  var running = false, backoffUntil = 0;
  /* Account lookup. In an extension the background script does the request (works around page CSP and Firefox
     cross-compartment errors). As a userscript, or in tests, it falls back to a same-origin fetch. */
  var rt = (typeof browser !== 'undefined' && browser.runtime && browser.runtime.id) ? browser.runtime
         : (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ? chrome.runtime : null;
  function lookup(name) {
    if (rt && !window.__NOBOTTY_FETCH) {
      return Promise.resolve(rt.sendMessage({ type: 'nobotty-about', name: name })).then(function (r) {
        if (!r) throw new Error('no answer from background');
        if (r.error && !r.status) throw new Error(r.error);
        return r;
      });
    }
    var f = window.__NOBOTTY_FETCH || window.fetch.bind(window);
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
    return f(location.origin + '/user/' + encodeURIComponent(name) + '/about.json?raw_json=1', { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(timer); if (!r.ok) return { ok: false, status: r.status }; return r.json().then(function (data) { return { ok: true, status: r.status, data: data }; }); },
            function (e) { clearTimeout(timer); throw e; });
  }


  /* ---- storage with a tiny fallback so it can be tested outside an extension ---- */
  var hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  function sGet(keys, cb) {
    if (hasChrome) return chrome.storage.local.get(keys, cb);
    var out = {}; keys.forEach(function (k) { try { out[k] = JSON.parse(localStorage.getItem('nobotty:' + k)); } catch (e) {} }); cb(out);
  }
  function sSet(obj) {
    if (hasChrome) return chrome.storage.local.set(obj);
    Object.keys(obj).forEach(function (k) { localStorage.setItem('nobotty:' + k, JSON.stringify(obj[k])); });
  }

  /* ---- finding comments (new Reddit: shreddit-comment, old Reddit: .thing.comment) ---- */
  var SEL = 'shreddit-comment, div.thing.comment, div.comment[data-author]';
  function authorOf(el) {
    var a = el.getAttribute('author') || el.getAttribute('data-author');
    if (!a) { var link = el.querySelector('a[href*="/user/"]'); if (link) a = (link.textContent || '').replace(/^\/?u\//, '').trim(); }
    return a && a !== '[deleted]' ? a : null;
  }
  function textOf(el) {
    var t = el.querySelector(':scope > [slot="comment"]') || el.querySelector('[slot="comment"]') || el.querySelector(':scope > .entry .usertext-body .md') || el.querySelector('.usertext-body .md');
    return ((t && (t.innerText || t.textContent)) || '').trim();
  }

  /* ---- scoring: every point has a plain-language reason ---- */
  var LLM_PHRASES = ['great question', "i'd be happy to", 'i would be happy to', 'delve', "in today's fast-paced", "it's worth noting", 'it is worth noting', 'as an ai', 'game-changer', 'game changer', 'unlock the', 'navigate the complexities', 'rich tapestry', 'in conclusion,', 'i hope this helps'];
  function textSignals(text) {
    var pts = 0, why = [], low = text.toLowerCase();
    var dashes = (text.match(/—/g) || []).length;
    if (dashes >= 3) { pts += 1; why.push(dashes + ' em dashes'); }
    var hits = LLM_PHRASES.filter(function (p) { return low.indexOf(p) !== -1; });
    if (hits.length >= 1) { pts += 1; why.push('stock phrase "' + hits[0] + '"'); }
    if (pts > 2) pts = 2;
    return { pts: pts, why: why };
  }
  function accountSignals(info, name) {
    var pts = 0, why = [];
    if (info && !info.err) {
      var days = Math.floor((Date.now() - info.created * 1000) / DAY);
      if (days < 7) { pts += 3; why.push('account ' + days + ' days old'); }
      else if (days < 30) { pts += 2; why.push('account ' + days + ' days old'); }
      else if (days < 90) { pts += 1; why.push('account ' + days + ' days old'); }
      if (info.karma < 50) { pts += 2; why.push(info.karma + ' karma'); }
      else if (info.karma < 200) { pts += 1; why.push(info.karma + ' karma'); }
    }
    if (/^[A-Z][a-z]+[-_][A-Za-z]+[-_]?\d{2,4}$/.test(name)) { pts += 1; why.push('auto-style username'); }
    return { pts: pts, why: why };
  }
  function level(pts) { return pts >= 5 ? 'high' : pts >= 3 ? 'medium' : 'none'; }

  /* ---- duplicate text across different authors in this thread ---- */
  function normalize(t) { return t.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim(); }
  function duplicateMap() {
    var seen = {}, map = {};
    document.querySelectorAll(SEL).forEach(function (el) {
      var a = authorOf(el), t = normalize(textOf(el)); if (!a || t.length < 40) return;
      (seen[t] = seen[t] || {})[a] = 1;
    });
    Object.keys(seen).forEach(function (t) { if (Object.keys(seen[t]).length >= 2) map[t] = true; });
    return map;
  }

  /* ---- account info fetch (public about.json, cached, rate limited) ---- */
  function loadCache(done) { sGet(['acct'], function (r) { cache = (r && r.acct) || {}; done(); }); }
  var saveTimer = null;
  function saveCache() { clearTimeout(saveTimer); saveTimer = setTimeout(function () {
    var now = Date.now(); Object.keys(cache).forEach(function (k) { if (now - cache[k].t > TTL) delete cache[k]; });
    sSet({ acct: cache }); }, 1500); }
  function want(name) {
    var c = cache[name]; if (c && Date.now() - c.t < (c.err ? 60000 : TTL)) return;
    if (queued[name]) return; queued[name] = 1; queue.push(name); pump();
  }
  function pump() {
    if (running || !queue.length) return; running = true;
    var wait = Math.max(0, backoffUntil - Date.now());
    setTimeout(function () {
      var name = queue.shift(); delete queued[name];
      lookup(name)
        .then(function (r) {
          if (r.status === 429) { backoffUntil = Date.now() + 60000; queue.unshift(name); queued[name] = 1; throw new Error('rate'); }
          if (!r.ok) { cache[name] = { t: Date.now(), err: r.status || r.error || 'failed' }; return null; }
          return r.data;
        })
        .then(function (j) {
          if (j && j.data) cache[name] = { t: Date.now(), created: j.data.created_utc, karma: (j.data.total_karma != null ? j.data.total_karma : (j.data.link_karma || 0) + (j.data.comment_karma || 0)) };
          saveCache(); evaluate();
        })
        .catch(function (e) {
          if (e && e.message === 'rate') return;
          var msg = e && e.name === 'AbortError' ? 'timeout' : String((e && e.message) || e).slice(0, 60);
          cache[name] = { t: Date.now(), err: msg };
          try { console.warn('[Nobotty] lookup failed for ' + name + ':', e); } catch (x) {}
          evaluate();
        })
        .then(function () { running = false; setTimeout(pump, 1100); });
    }, wait);
  }


  /* ---- direct messages: hide scam/bot messages and (optionally) sales pitches ---- */
  /* Old inbox: div.thing.message. New chat markup changes often, so the selectors live in one place. */
  var DM_SEL = 'div.thing.message, .thing.message, rs-room-item, rs-message-item, [data-testid*="room-item"], [data-testid*="message-request"]';
  var SELLER = [
    /\b(i|we)\s+(can|will|could)\b.{0,70}\b(build|design|create|grow|boost|rank|promote|market|improve|redesign)\b.{0,70}\b(website|site|seo|traffic|brand|business|followers|leads|sales)\b/i,
    /\b(guest post|backlinks?|link building|seo services?|web design(?:er)?|web development|lead generation|marketing (?:services?|agency)|affiliate|sponsorship|sponsored post|paid promotion|promote your)\b/i,
    /\b(free (?:audit|trial|consultation|demo|mockup)|limited[- ]time offer|special offer|\d+% off|discount code)\b/i,
    /\b(?:came across|saw|noticed|stumbled upon)\b.{0,40}\b(?:your (?:post|profile|comment|website|account|startup|app|project))\b.{0,120}\b(?:help|offer|service|interested|collaborat|partner)/i,
    /\bcheck out (?:my|our)\b|\bour (?:services|agency|team|platform)\b/i
  ];
  var SCAM = [
    /\b(crypto|bitcoin|usdt|forex|nft|airdrop|passive income|get rich|investment (?:opportunity|plan)|trading signals?)\b/i,
    /\b(whatsapp|telegram|signal|snapchat|kik|wickr)\b.{0,40}(?:\+?\d{5,}|@\w+|add me|contact me|message me)/i,
    /\b(?:cash ?app|venmo|zelle|gift ?cards?)\b.{0,50}\b(?:send|pay|buy)\b/i,
    /\b(onlyfans|nudes?|18\+|horny|hot girls?|dating site|sugar (?:daddy|baby))\b/i,
    /^\s*(?:hi|hello|hey)(?: dear| there| beautiful| friend)?[!. ]*$/i
  ];
  function dmKind(text, info, name) {
    var hasLink = /https?:\/\/\S+/i.test(text);
    var young = info && !info.err && ((Date.now() - info.created * 1000) / DAY < 30 || info.karma < 50);
    for (var i = 0; i < SCAM.length; i++) if (SCAM[i].test(text)) return { kind: 'scam', why: 'scam style message' };
    var seller = SELLER.some(function (re) { return re.test(text); });
    if (seller) return { kind: 'seller', why: 'sales pitch' };
    if (young && hasLink) return { kind: 'bot', why: 'new account with a link' };
    return null;
  }
  function dmAuthor(el) {
    var a = el.getAttribute('data-author'); if (a) return a;
    var link = el.querySelector('a[href*="/user/"]'); if (link) return (link.textContent || '').replace(/^\/?u\//, '').trim();
    var m = (el.getAttribute('aria-label') || el.innerText || '').match(/\bu\/([A-Za-z0-9_-]{3,20})\b/); return m ? m[1] : null;
  }
  function evaluateDMs() {
    stats.dms = 0;
    if (!cfg.enabled || !cfg.dmFilter) { document.querySelectorAll('[data-nobotty-dm]').forEach(function (el) { clear(el); el.removeAttribute('data-nobotty-dm'); }); return; }
    document.querySelectorAll(DM_SEL).forEach(function (el) {
      var text = (el.innerText || el.textContent || '').trim(); if (text.length < 4) return;
      var name = dmAuthor(el) || '';
      if (name && cfg.trusted.indexOf(name.toLowerCase()) !== -1) { clear(el); el.removeAttribute('data-nobotty-dm'); return; }
      var info = name ? cache[name] : null; if (name && !info) want(name);
      var k = dmKind(text, info, name);
      var hide = k && ((k.kind === 'seller' && cfg.dmBlockSellers) || ((k.kind === 'scam' || k.kind === 'bot') && cfg.dmBlockBots));
      if (!hide) { if (el.hasAttribute('data-nobotty-dm')) { clear(el); el.removeAttribute('data-nobotty-dm'); } return; }
      stats.dms++;
      el.setAttribute('data-nobotty-dm', k.kind);
      el.setAttribute('data-nobotty', 'high');
      el.setAttribute('data-nobotty-label', 'Nobotty hid a message (' + k.why + (name ? ' from u/' + name : '') + '). Click to ' + (el.hasAttribute('data-nobotty-open') ? 'hide' : 'show') + '.');
    });
  }


  /* ---- status chip: shows that Nobotty runs and what it found (helps when nothing is marked) ---- */
  var stats = { seen: 0, withAuthor: 0, checked: 0, failed: 0, lastErr: '', flagged: 0, dms: 0 };
  var chip = null; /* defined before use in observer */
  function drawChip() {
    if (!cfg.showStatus || !document.body) { if (chip) chip.style.display = 'none'; return; }
    if (!chip) {
      chip = document.createElement('div');
      chip.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483000;padding:7px 12px;border-radius:999px;background:#10231a;color:#f4f6ef;font:600 12px/1.3 system-ui,sans-serif;opacity:.8;cursor:pointer;max-width:80vw';
      chip.title = 'Nobotty status. Click to hide (turn back on in settings).';
      chip.addEventListener('click', function () { cfg.showStatus = false; sSet({ cfg: cfg }); drawChip(); });
      document.body.appendChild(chip);
    }
    chip.style.display = 'block';
    var txt = 'Nobotty: ' + stats.seen + ' comments, ' + stats.checked + ' accounts checked, ' + stats.flagged + ' flagged' + (stats.dms ? ', ' + stats.dms + ' messages hidden' : '') + (stats.failed ? ' (' + stats.failed + ' lookups failed: ' + stats.lastErr + ')' : '');
    if (chip.textContent !== txt) chip.textContent = txt;
  }

  /* ---- apply to the page ---- */
  var pending = false;
  function evaluate() {
    evaluateDMs();
    if (!cfg.enabled) { document.querySelectorAll('[data-nobotty]').forEach(clear); afterEval(); return; }
    var dups = duplicateMap();
    stats.seen = 0; stats.withAuthor = 0; stats.checked = 0; stats.failed = 0; stats.flagged = 0;
    document.querySelectorAll(SEL).forEach(function (el) {
      stats.seen++;
      var name = authorOf(el); if (!name) return;
      stats.withAuthor++;
      var ci = cache[name]; if (ci && !ci.err) stats.checked++; else if (ci && ci.err) { stats.failed++; stats.lastErr = (typeof ci.err === 'number' ? 'HTTP ' + ci.err : ci.err); }
      if (cfg.trusted.indexOf(name.toLowerCase()) !== -1) { clear(el); return; }
      var info = cache[name]; if (!info) want(name);
      var a = accountSignals(info, name), t = textSignals(textOf(el)), pts = a.pts + t.pts, why = a.why.concat(t.why);
      if (dups[normalize(textOf(el))]) { pts += 3; why.push('same text as another account'); }
      var lv = level(pts);
      if (lv === 'none' || (lv === 'medium' && !cfg.showMedium)) { clear(el); return; }
      stats.flagged++;
      el.setAttribute('data-nobotty', lv);
      el.setAttribute('data-nobotty-label', 'Nobotty: ' + lv + ' signals (' + why.join(', ') + '). Click to ' + (el.hasAttribute('data-nobotty-open') ? 'collapse' : 'show') + '.');
      el.setAttribute('title', 'Signals only, not proof. u/' + name);
      if (lv === 'high' && !cfg.collapseHigh) el.setAttribute('data-nobotty-open', '1');
    });
    afterEval();
  }
  function afterEval() { drawChip(); try { console.log('[Nobotty]', JSON.stringify(stats)); } catch (e) {} }
  function clear(el) { el.removeAttribute('data-nobotty'); el.removeAttribute('data-nobotty-label'); el.removeAttribute('data-nobotty-open'); }
  function schedule() { if (pending) return; pending = true; setTimeout(function () { pending = false; evaluate(); }, 400); }

  /* click on the chip toggles the comment open/closed (the chip is a ::before, so use the host) */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-nobotty]'); if (!el) return;
    var r = el.getBoundingClientRect(); if (e.clientY - r.top > 34) return; // only the label strip
    if (el.hasAttribute('data-nobotty-open')) el.removeAttribute('data-nobotty-open'); else el.setAttribute('data-nobotty-open', '1');
    evaluate();
  }, true);

  /* ---- boot ---- */
  sGet(['cfg'], function (r) {
    cfg = Object.assign({}, DEFAULTS, (r && r.cfg) || {});
    loadCache(function () {
      evaluate();
      new MutationObserver(function (m) { for (var i = 0; i < m.length; i++) { if (m[i].target !== chip && !(chip && chip.contains(m[i].target))) { schedule(); return; } } }).observe(document.body, { childList: true, subtree: true });
    });
  });
  window.addEventListener('nobotty-config', function (e) { cfg = Object.assign({}, DEFAULTS, e.detail || {}); evaluate(); });
  if (hasChrome && chrome.storage.onChanged) chrome.storage.onChanged.addListener(function (ch) {
    if (ch.cfg) { cfg = Object.assign({}, DEFAULTS, ch.cfg.newValue || {}); evaluate(); }
  });
  window.__nobotty = { dmKind: dmKind, evaluate: evaluate, level: level, accountSignals: accountSignals, textSignals: textSignals };
})();
