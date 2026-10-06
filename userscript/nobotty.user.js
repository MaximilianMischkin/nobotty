// ==UserScript==
// @name         Nobotty
// @namespace    https://github.com/MaximilianMischkin/nobotty
// @version      0.4.5
// @description  Spot likely bots, scams and sales pitches on Reddit. Runs locally.
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://chat.reddit.com/*
// @run-at       document-idle
// @noframes
// ==/UserScript==
(function(){var st=document.createElement('style');st.textContent="/* Nobotty: a small colour dot right after each comment's time (\"4d ago (dot)\").\n   red = low trust, orange = medium, green = good. Optional: a thin stripe instead (setting \"Use a stripe\"). */\n[data-nobotty]{position:relative;--nb-c:transparent}\n[data-nobotty=\"low\"]{--nb-c:#f0646b}\n[data-nobotty=\"medium\"]{--nb-c:#f3b04e}\n[data-nobotty=\"good\"]{--nb-c:#4fc08d}\n/* dot (default): inline element after the time */\n.nobotty-dot{display:inline-block;width:9px;height:9px;margin:0 0 0 7px;border-radius:50%;vertical-align:middle;position:relative;top:-1px;flex:none;pointer-events:none;background:transparent}\n.nobotty-dot[data-lv=\"low\"]{background:#f0646b}\n.nobotty-dot[data-lv=\"medium\"]{background:#f3b04e}\n.nobotty-dot[data-lv=\"good\"]{background:#4fc08d}\n@keyframes nobotty-pop{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:none}}\n@media (prefers-reduced-motion:no-preference){.nobotty-dot{animation:nobotty-pop 220ms cubic-bezier(.23,1,.32,1)}}\n/* stripe (option) */\nhtml[data-nobotty-style=\"stripe\"] [data-nobotty]::after{content:\"\";position:absolute;left:-10px;top:3px;width:3px;height:calc(var(--nb-h, 100%) - 6px);border-radius:3px;background:var(--nb-c);pointer-events:none;opacity:.9}\n/* optional one-line collapse (low trust comments, or hidden direct messages) */\n[data-nobotty-collapse]:not([data-nobotty-open]),[data-nobotty-dm]:not([data-nobotty-open]){display:block;max-height:22px;overflow:hidden;opacity:.7}\n[data-nobotty-collapse]::before,[data-nobotty-dm]::before{\n  content:attr(data-nobotty-label);display:block;font:500 12px/20px system-ui,-apple-system,sans-serif;\n  color:#f0646b;padding:0 8px 0 20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}\n[data-nobotty-collapse]::after,[data-nobotty-dm]::after,\nhtml[data-nobotty-style=\"stripe\"] [data-nobotty-collapse]::after,html[data-nobotty-style=\"stripe\"] [data-nobotty-dm]::after{content:\"\";position:absolute;background:var(--nb-c);pointer-events:none;left:6px;top:5px;width:10px;height:10px;border-radius:50%;box-shadow:none}\n[data-nobotty-dm]{--nb-c:#f0646b}\n[data-nobotty-dm]::after{content:\"\";position:absolute;background:var(--nb-c);pointer-events:none;z-index:2}\n";document.head.appendChild(st);})();
/* Nobotty content script. Local only: reads the page and public account info, shows a colour stripe per comment. */
(function () {
  'use strict';
  var DAY = 86400000, TTL = 7 * DAY;
  var DEFAULTS = { enabled: true, collapseHigh: false, showMedium: true, showGood: true, deepScan: false, hoverReasons: false, useStripe: false,
                   trusted: [], dmFilter: true, dmBlockBots: true, dmBlockSellers: true, showStatus: true };
  var cfg = Object.assign({}, DEFAULTS);
  var cache = {};                 // name -> {t, created, karma, hist, err}
  var queue = [], queued = {};    // jobs: {k:'a'|'h', n:name}; key 'a:name' / 'h:name'
  var prio = {}, inflight = 0, MAXC = 4, BASE_SPACING = 120, lastStart = 0, pumpTimer = null;
  var backoffUntil = 0, limit = { remaining: null, reset: null };
  var stats = { seen: 0, withAuthor: 0, checked: 0, failed: 0, lastErr: '', low: 0, mid: 0, good: 0, dms: 0, hist: 0 };

  /* ---------- messaging: extension background does the requests; userscript/tests fall back to fetch ---------- */
  var rt = (typeof browser !== 'undefined' && browser.runtime && browser.runtime.id) ? browser.runtime
         : (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ? chrome.runtime : null;
  function withTimeout(p, ms, msg) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error(msg)); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  var version = ''; try { if (rt && rt.getManifest) version = rt.getManifest().version; } catch (e) {}
  var bgState = rt ? 'checking' : 'n/a';
  if (rt) {
    withTimeout(Promise.resolve(rt.sendMessage({ type: 'nobotty-ping' })), 4000, 'timeout')
      .then(function (r) { bgState = r && r.pong ? 'ok' : 'bad answer'; drawChip(); },
            function (e) { bgState = 'NOT RESPONDING (' + String((e && e.message) || e).slice(0, 40) + ')'; drawChip(); });
  }
  function pageFetch(path) {
    var f = window.__NOBOTTY_FETCH || window.fetch.bind(window);
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
    return f(location.origin + path, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        clearTimeout(timer);
        var rl = { remaining: num(r.headers && r.headers.get && r.headers.get('x-ratelimit-remaining')), reset: num(r.headers && r.headers.get && r.headers.get('x-ratelimit-reset')) };
        if (!r.ok) return { ok: false, status: r.status, rl: rl };
        return r.json().then(function (data) { return { ok: true, status: r.status, data: data, rl: rl }; });
      }, function (e) { clearTimeout(timer); throw e; });
  }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
  function lookup(kind, name) {
    if (rt && !window.__NOBOTTY_FETCH) {
      var type = kind === 'h' ? 'nobotty-history' : 'nobotty-about';
      return withTimeout(Promise.resolve(rt.sendMessage({ type: type, name: name })), 10000, 'background not responding').then(function (r) {
        if (!r) throw new Error('no answer from background');
        if (r.error && !r.status) throw new Error(r.error);
        return r;
      });
    }
    var path = kind === 'h' ? '/user/' + encodeURIComponent(name) + '/overview.json?limit=40&raw_json=1' : '/user/' + encodeURIComponent(name) + '/about.json?raw_json=1';
    return pageFetch(path).then(function (r) {
      if (kind === 'h' && r.ok && r.data && r.data.data) r.items = compactHistory(r.data.data.children || []);
      return r;
    });
  }
  function compactHistory(children) {
    return children.map(function (c) {
      var d = c.data || {};
      var body = d.body || ((d.title || '') + ' ' + (d.url && !/reddit\.com|redd\.it/.test(d.url) ? d.url : '') + ' ' + (d.selftext || ''));
      return { s: d.subreddit, b: String(body).slice(0, 400), t: d.created_utc };
    });
  }

  /* ---------- storage (falls back to localStorage outside an extension) ---------- */
  var hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  function sGet(keys, cb) {
    if (hasChrome) return chrome.storage.local.get(keys, cb);
    var out = {}; keys.forEach(function (k) { try { out[k] = JSON.parse(localStorage.getItem('nobotty:' + k)); } catch (e) {} }); cb(out);
  }
  function sSet(obj) {
    if (hasChrome) return chrome.storage.local.set(obj);
    Object.keys(obj).forEach(function (k) { localStorage.setItem('nobotty:' + k, JSON.stringify(obj[k])); });
  }

  /* ---------- finding comments ---------- */
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

  /* ---------- scoring ---------- */
  var LLM_PHRASES = ['great question', "i'd be happy to", 'i would be happy to', 'delve', "in today's fast-paced", "it's worth noting", 'it is worth noting', 'as an ai', 'game-changer', 'game changer', 'unlock the', 'navigate the complexities', 'rich tapestry', 'in conclusion,', 'i hope this helps'];
  function textSignals(text) {
    var pts = 0, why = [], low = text.toLowerCase();
    if ((text.match(/—/g) || []).length >= 3) { pts += 1; why.push('many em dashes'); }
    if (LLM_PHRASES.some(function (p) { return low.indexOf(p) !== -1; })) { pts += 1; why.push('stock phrase'); }
    return { pts: Math.min(pts, 2), why: why };
  }
  function accountSignals(info, name) {
    var pts = 0, why = [];
    if (info && !info.err) {
      var days = Math.floor((Date.now() - info.created * 1000) / DAY);
      if (days < 7) { pts += 3; why.push(days + 'd old'); } else if (days < 30) { pts += 2; why.push(days + 'd old'); } else if (days < 90) { pts += 1; why.push(days + 'd old'); }
      if (info.karma < 50) { pts += 2; why.push(info.karma + ' karma'); } else if (info.karma < 200) { pts += 1; why.push(info.karma + ' karma'); }
    }
    if (/^[A-Z][a-z]+[-_][A-Za-z]+[-_]?\d{2,4}$/.test(name)) { pts += 1; why.push('auto username'); }
    return { pts: pts, why: why };
  }
  function normalize(t) { return t.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim(); }
  function duplicateMap() {
    var seen = {}, map = {};
    document.querySelectorAll(SEL).forEach(function (el) { var a = authorOf(el), t = normalize(textOf(el)); if (!a || t.length < 40) return; (seen[t] = seen[t] || {})[a] = 1; });
    Object.keys(seen).forEach(function (t) { if (Object.keys(seen[t]).length >= 2) map[t] = true; });
    return map;
  }

  /* ---------- history: does this account post links and text like a bot? (public profile, analysed locally) ---------- */
  var SHORTENERS = /^(bit\.ly|t\.co|tinyurl\.com|cutt\.ly|rb\.gy|shorturl\.at|is\.gd|ow\.ly|buff\.ly)$/;
  var LINK_HUBS = /(^|\.)(t\.me|telegram\.me|wa\.me|onlyfans\.com|linktr\.ee|beacons\.ai|allmylinks\.com)$/;
  var OWN_HOSTS = /(^|\.)(reddit\.com|redd\.it|redditmedia\.com|redditstatic\.com|imgur\.com)$/;
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function analyzeHistory(items) {
    var n = items.length, link = 0, dom = {}, dup = {}, subs = {}, ts = [], short = 0, hub = 0;
    items.forEach(function (it) {
      var body = it.b || '', urls = body.match(/https?:\/\/[^\s)\]>]+/g) || [];
      var ext = urls.map(hostOf).filter(function (h) { return h && !OWN_HOSTS.test(h); });
      if (ext.length) { link++; ext.forEach(function (h) { dom[h] = (dom[h] || 0) + 1; if (SHORTENERS.test(h)) short++; if (LINK_HUBS.test(h)) hub++; }); }
      var k = normalize(body).slice(0, 100); if (k.length >= 30) dup[k] = (dup[k] || 0) + 1;
      if (it.s) subs[it.s] = 1; if (it.t) ts.push(it.t);
    });
    var top = 0; Object.keys(dom).forEach(function (h) { if (dom[h] > top) top = dom[h]; });
    var dupMax = 0; Object.keys(dup).forEach(function (k) { if (dup[k] > dupMax) dupMax = dup[k]; });
    ts.sort(function (a, b) { return a - b; });
    var burst = 0, j = 0; for (var i = 0; i < ts.length; i++) { while (ts[i] - ts[j] > 600) j++; if (i - j + 1 > burst) burst = i - j + 1; }
    return { n: n, link: link, top: top, dup: dupMax, burst: burst, subs: Object.keys(subs).length, short: short, hub: hub };
  }
  function histSignals(h) {
    var pts = 0, why = [];
    if (!h || !(h.n >= 4)) return { pts: 0, why: why };
    if (h.short >= 1 || h.hub >= 2) { pts += 2; why.push('shortened or hub links'); }
    if (h.top >= 3) { pts += 2; why.push('same link repeated'); } else if (h.link / h.n >= 0.4) { pts += 1; why.push('many links'); }
    if (h.dup >= 3) { pts += 2; why.push('repeated text'); } else if (h.dup === 2) { pts += 1; why.push('repeated text'); }
    if (h.burst >= 10) { pts += 1; why.push('burst posting'); }
    if (h.subs >= 12 && h.n >= 20) { pts += 1; why.push('spreads across many subs'); }
    return { pts: Math.min(pts, 4), why: why };
  }
  function trustOf(pts, known) { return pts >= 5 ? 'low' : pts >= 3 ? 'medium' : (known && pts <= 1) ? 'good' : 'neutral'; }

  /* ---------- request queue: prioritises what you see, paces itself to Reddit's limit ---------- */
  function loadCache(done) { sGet(['acct'], function (r) { cache = (r && r.acct) || {}; done(); }); }
  var saveTimer = null;
  function saveCache() { clearTimeout(saveTimer); saveTimer = setTimeout(function () {
    var now = Date.now(); Object.keys(cache).forEach(function (k) { if (now - cache[k].t > TTL) delete cache[k]; });
    sSet({ acct: cache }); }, 1500); }
  function want(name, el, kind) {
    kind = kind || 'a';
    var c = cache[name];
    if (kind === 'a' && c && Date.now() - c.t < (c.err ? 60000 : TTL)) return;
    if (kind === 'h' && (!c || c.err || c.hist)) return;
    var d = 0;
    if (el) { var top = el.getBoundingClientRect().top, vh = window.innerHeight || 800; d = top < 0 ? Math.abs(top) + vh : (top > vh ? top : 0); }
    var key = kind + ':' + name;
    if (prio[key] === undefined || d < prio[key]) prio[key] = d + (kind === 'h' ? 5000 : 0);
    if (queued[key]) return; queued[key] = 1; queue.push({ k: kind, n: name }); pump();
  }

  /* Bulk lookup: one request for the thread's comment tree (gives every author's account id),
     then one request per 100 accounts. Replaces ~1 request per account, which ran into Reddit's limit. */
  var thread = { id: null, at: 0, busy: false, ok: false };
  function getJSON(path) {
    if (rt && !window.__NOBOTTY_FETCH) return withTimeout(Promise.resolve(rt.sendMessage({ type: 'nobotty-get', path: path })), 15000, 'background not responding');
    return pageFetch(path);
  }
  function collectAuthors(node, out) {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(function (n) { collectAuthors(n, out); }); return; }
    var d = node.data; if (!d) return;
    if (d.children) collectAuthors(d.children, out);
    if (d.author && d.author_fullname && d.author !== '[deleted]') out[d.author] = d.author_fullname;
    if (d.replies) collectAuthors(d.replies, out);
  }
  function threadId() { var m = location.pathname.match(/\/comments\/([a-z0-9]{3,12})/i); return m ? m[1].toLowerCase() : null; }
  function bulkPrefetch(unknown) {
    var id = threadId(); if (!id || thread.busy || backoffUntil > Date.now()) return;
    var now = Date.now();
    if (thread.id === id && (unknown < 3 || now - thread.at < 30000)) return;
    if (thread.id !== id) thread.ok = false;
    thread.busy = true; thread.id = id; thread.at = now;
    /* If the page already carries account ids (old Reddit: data-author-fullname), no thread request is needed. */
    var fromDom = {}, missing = 0;
    document.querySelectorAll(SEL).forEach(function (el) {
      var n = authorOf(el); if (!n || cache[n]) return;
      var fid = el.getAttribute('data-author-fullname') || el.getAttribute('author-id') || el.getAttribute('authorid');
      if (fid && /^t2_[a-z0-9]+$/.test(fid)) fromDom[n] = fid; else missing++;
    });
    var treeReq = missing ? getJSON('/comments/' + id + '.json?limit=500&depth=12&raw_json=1')
                          : Promise.resolve({ ok: true, status: 200, dom: fromDom });
    treeReq.then(function (r) {
      if (!(r && r.dom)) { noteNet('thread', r); noteLimit(r && r.rl); }
      if (r && r.status === 429) backoffUntil = Date.now() + 60000;
      if (!r || !r.ok) throw new Error('thread ' + ((r && (r.status || r.error)) || 'failed'));
      thread.ok = true;
      var map = r.dom || {}; if (!r.dom) collectAuthors(r.data, map);
      var need = Object.keys(map).filter(function (n) { var c = cache[n]; return !c || c.err || Date.now() - c.t > TTL; });
      var ids = need.map(function (n) { return map[n]; }), chunks = [];
      for (var i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
      return chunks.reduce(function (p, ch) {
        return p.then(function () { return getJSON('/api/user_data_by_account_ids.json?ids=' + ch.join(',')); }).then(function (u) {
          noteNet('accounts', u); noteLimit(u && u.rl); if (!u || !u.ok || !u.data) return;
          /* Accept {t2_x: {...}}, {data: {t2_x: {...}}} or a list; match by name, else by account id. */
          var byId = {}; Object.keys(map).forEach(function (n) { byId[map[n]] = n; byId[map[n].replace(/^t2_/, '')] = n; });
          var src = u.data.data && typeof u.data.data === 'object' ? u.data.data : u.data, got = 0;
          (Array.isArray(src) ? src.map(function (a) { return [a && (a.id || a.name), a]; }) : Object.keys(src).map(function (k) { return [k, src[k]]; })).forEach(function (kv) {
            var a = kv[1]; if (!a || typeof a !== 'object') return;
            var n = a.name || a.username || byId[kv[0]] || byId[String(a.id || '')]; if (!n) return;
            var created = a.created_utc != null ? a.created_utc : a.created;
            if (created == null) return;
            var karma = a.total_karma != null ? a.total_karma : (a.link_karma || 0) + (a.comment_karma || 0);
            cache[n] = { t: Date.now(), created: created, karma: karma }; got++;
          });
          try { console.log('[Nobotty] accounts:', got, 'of', ch.length, got ? '' : JSON.stringify(u.data).slice(0, 300)); } catch (x) {}
          if (!got) lastNet = 'accounts 200 but unreadable: ' + JSON.stringify(u.data).slice(0, 80);
        });
      }, Promise.resolve());
    }).catch(function (e) { if (!lastNet || lastNet.indexOf('thread') !== 0) lastNet = 'bulk ' + String((e && e.message) || e).slice(0, 50); try { console.warn('[Nobotty] bulk lookup failed:', e); } catch (x) {} })
      .then(function () {
        thread.busy = false;
        for (var i = queue.length - 1; i >= 0; i--) { var j = queue[i]; if (j.k === 'a' && cache[j.n] && !cache[j.n].err) { delete queued[j.k + ':' + j.n]; queue.splice(i, 1); } }
        saveCache(); drawChip(); schedule(50);
      });
  }
  function nextJob(historyOnly) {
    var bi = 0, bp = Infinity;
    for (var i = 0; i < queue.length; i++) { if (historyOnly && queue[i].k === 'a') continue; var p = prio[queue[i].k + ':' + queue[i].n]; if (p === undefined) p = 1e9; if (p < bp) { bp = p; bi = i; } }
    return queue.splice(bi, 1)[0];
  }
  function spacing() {
    if (limit.remaining !== null && limit.remaining <= 20) return Math.max(300, ((limit.reset || 60) * 1000) / Math.max(limit.remaining, 1));
    return BASE_SPACING;
  }
  var lastNet = '';
  function noteNet(what, r) {
    lastNet = what + ' ' + (r ? (r.status || r.error || '?') : 'no answer') + (r && r.rl && r.rl.remaining != null ? ', ' + r.rl.remaining + ' left, reset ' + Math.round(r.rl.reset || 0) + 's' : '');
    try { console.log('[Nobotty] net:', lastNet); } catch (e) {}
  }
  function noteLimit(rl) {
    if (!rl || rl.remaining == null) return;
    limit = { remaining: rl.remaining, reset: rl.reset };
    if (rl.remaining <= 2) backoffUntil = Math.max(backoffUntil, Date.now() + Math.min(600, rl.reset || 30) * 1000);
  }
  /* Watchdog: if jobs wait but nothing runs (timer chain broke, background was suspended), restart the pump. */
  setInterval(function () {
    if (!queue.length) return;
    if (inflight > 0 && Date.now() - lastStart > 30000) inflight = 0;
    if (inflight === 0 && !pumpTimer) pump();
    else if (!pumpTimer && inflight < MAXC && Date.now() - lastStart > 5000) pump();
    schedule(100);
  }, 3000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { pump(); schedule(100); } });
  function pump() {
    if (inflight >= MAXC || !queue.length) return;
    if (thread.busy || (threadId() && !(thread.ok && thread.id === threadId()))) {
      if (!thread.busy) bulkPrefetch(99);
      var onlyA = queue.every(function (j) { return j.k === 'a'; });
      if (onlyA || thread.busy) { if (!pumpTimer) pumpTimer = setTimeout(function () { pumpTimer = null; pump(); }, 1000); return; }
    }
    var now = Date.now(), wait = Math.max(0, backoffUntil - now, lastStart + spacing() - now);
    if (wait > 0) { if (!pumpTimer) pumpTimer = setTimeout(function () { pumpTimer = null; pump(); }, Math.min(wait, 1000)); return; }
    var bulkPending = !!threadId() && !(thread.ok && thread.id === threadId());
    var job = nextJob(bulkPending), key = job.k + ':' + job.n; delete queued[key]; inflight++; lastStart = Date.now();
    lookup(job.k, job.n)
      .then(function (r) {
        noteNet(job.k === 'h' ? 'history' : 'account', r); noteLimit(r.rl);
        if (r.status === 429) { backoffUntil = Date.now() + 60000; queue.unshift(job); queued[key] = 1; throw new Error('rate'); }
        if (!r.ok) { if (job.k === 'a') cache[job.n] = { t: Date.now(), err: r.status || r.error || 'failed' }; else if (cache[job.n]) cache[job.n].hist = { n: 0, err: r.status || 1 }; return; }
        if (job.k === 'a') {
          var j = r.data && r.data.data;
          if (j) cache[job.n] = { t: Date.now(), created: j.created_utc, karma: (j.total_karma != null ? j.total_karma : (j.link_karma || 0) + (j.comment_karma || 0)) };
        } else if (cache[job.n]) {
          var items = r.items || compactHistory((r.data && r.data.data && r.data.data.children) || []);
          cache[job.n].hist = analyzeHistory(items);
        }
        saveCache();
      })
      .then(function () { schedule(150); }, function (e) {
        if (e && e.message === 'rate') return;
        var msg = e && e.name === 'AbortError' ? 'timeout' : String((e && e.message) || e).slice(0, 60);
        if (job.k === 'a') cache[job.n] = { t: Date.now(), err: msg }; else if (cache[job.n]) cache[job.n].hist = { n: 0, err: 1 };
        try { console.warn('[Nobotty] lookup failed for ' + job.n + ':', e); } catch (x) {}
        schedule(150);
      })
      .then(function () { inflight--; drawChip(); pump(); });
    pump();
  }

  /* ---------- direct messages: hide scam/bot messages and (optionally) sales pitches ---------- */
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
  function dmKind(text, info) {
    var hasLink = /https?:\/\/\S+/i.test(text);
    var young = info && !info.err && ((Date.now() - info.created * 1000) / DAY < 30 || info.karma < 50);
    for (var i = 0; i < SCAM.length; i++) if (SCAM[i].test(text)) return { kind: 'scam', why: 'scam style message' };
    if (SELLER.some(function (re) { return re.test(text); })) return { kind: 'seller', why: 'sales pitch' };
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
    if (!cfg.enabled || !cfg.dmFilter) { document.querySelectorAll('[data-nobotty-dm]').forEach(clear); return; }
    document.querySelectorAll(DM_SEL).forEach(function (el) {
      var text = (el.innerText || el.textContent || '').trim(); if (text.length < 4) return;
      var name = dmAuthor(el) || '';
      if (name && cfg.trusted.indexOf(name.toLowerCase()) !== -1) { clear(el); return; }
      var info = name ? cache[name] : null; if (name && !info) want(name, el);
      var k = dmKind(text, info);
      var hide = k && ((k.kind === 'seller' && cfg.dmBlockSellers) || ((k.kind === 'scam' || k.kind === 'bot') && cfg.dmBlockBots));
      if (!hide) { if (el.hasAttribute('data-nobotty-dm')) clear(el); return; }
      stats.dms++;
      el.setAttribute('data-nobotty-dm', k.kind);
      el.setAttribute('data-nobotty-label', 'Hidden ' + k.why + (name ? ' · u/' + name : ''));
    });
  }

  /* ---------- status chip ---------- */
  var chip = null, idleTimer = null, tickTimer = null;
  function fmtWait(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function drawChip() {
    if (!cfg.showStatus || !document.body) { if (chip) chip.style.display = 'none'; return; }
    if (!chip) {
      chip = document.createElement('div');
      chip.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483000;padding:4px 10px;border-radius:999px;background:#10231a;color:#f4f6ef;font:500 11px/1.3 system-ui,sans-serif;cursor:pointer;max-width:80vw;transition:opacity 200ms cubic-bezier(.23,1,.32,1)';
      chip.title = 'Nobotty. Click to hide (turn back on in settings).';
      chip.addEventListener('click', function () { cfg.showStatus = false; sSet({ cfg: cfg }); drawChip(); });
      document.body.appendChild(chip);
    }
    chip.style.display = 'block';
    var waiting = queue.length + inflight, bad = (bgState !== 'ok' && bgState !== 'n/a');
    var paused = backoffUntil > Date.now() ? Math.ceil((backoffUntil - Date.now()) / 1000) : 0;
    var txt;
    if (waiting || bad || stats.failed || paused) {
      txt = 'Nobotty' + (version ? ' ' + version : '') + ': ' + stats.checked + '/' + stats.withAuthor + ' checked, ' + (stats.low + stats.mid) + ' flagged'
          + (waiting ? ', ' + waiting + ' waiting' : '') + (paused ? ', paused ' + fmtWait(paused) + ' (Reddit limit)' : (waiting && limit.remaining !== null && limit.remaining <= 20 ? ', slowed by Reddit limit (' + limit.remaining + ' left, resets in ' + fmtWait(limit.reset || 60) + ')' : ''))
          + (bad ? ' [background: ' + bgState + ']' : '') + (stats.failed ? ' (' + stats.failed + ' lookups failed: ' + stats.lastErr + ')' : '')
          + (lastNet ? ' [last: ' + lastNet + ']' : '');
      chip.style.opacity = '.85';
      if (paused && !tickTimer) tickTimer = setInterval(function () { if (backoffUntil <= Date.now()) { clearInterval(tickTimer); tickTimer = null; } drawChip(); }, 1000);
    } else {
      txt = 'Nobotty · ' + stats.low + ' low · ' + stats.mid + ' mid' + (stats.dms ? ' · ' + stats.dms + ' hidden' : '');
      clearTimeout(idleTimer); idleTimer = setTimeout(function () { if (chip) chip.style.opacity = '.35'; }, 2500);
    }
    if (chip.textContent !== txt) chip.textContent = txt;
  }

  /* ---------- apply to the page ---------- */
  var pending = false;
  function evaluate() {
    evaluateDMs();
    if (!cfg.enabled) { document.querySelectorAll('[data-nobotty]').forEach(clear); afterEval(); return; }
    if (cfg.useStripe) document.documentElement.setAttribute('data-nobotty-style', 'stripe'); else document.documentElement.removeAttribute('data-nobotty-style');
    var dups = duplicateMap(), unknown = 0;
    document.querySelectorAll(SEL).forEach(function (el) { var n = authorOf(el); if (n && !cache[n]) unknown++; });
    if (unknown) bulkPrefetch(unknown);
    stats.seen = 0; stats.withAuthor = 0; stats.checked = 0; stats.failed = 0; stats.low = 0; stats.mid = 0; stats.good = 0; stats.hist = 0;
    document.querySelectorAll(SEL).forEach(function (el) {
      stats.seen++;
      var name = authorOf(el); if (!name) return;
      stats.withAuthor++;
      var info = cache[name];
      if (info && !info.err) stats.checked++; else if (info && info.err) { stats.failed++; stats.lastErr = (typeof info.err === 'number' ? 'HTTP ' + info.err : info.err); }
      if (cfg.trusted.indexOf(name.toLowerCase()) !== -1) { clear(el); return; }
      if (!info) want(name, el);
      var a = accountSignals(info, name), t = textSignals(textOf(el)), pts = a.pts + t.pts, why = a.why.concat(t.why);
      if (dups[normalize(textOf(el))]) { pts += 3; why.push('copied text'); }
      var h = info && info.hist; if (h && h.n) stats.hist++;
      if (info && !info.err && !info.hist && (pts >= 2 || cfg.deepScan)) want(name, el, 'h');
      if (h) { var hs = histSignals(h); pts += hs.pts; why = why.concat(hs.why); }
      var known = !!(info && !info.err);
      var lv = trustOf(pts, known);
      if (lv === 'neutral' || (lv === 'medium' && !cfg.showMedium) || (lv === 'good' && !cfg.showGood)) { clear(el); return; }
      if (lv === 'low') stats.low++; else if (lv === 'medium') stats.mid++; else stats.good++;
      el.setAttribute('data-nobotty', lv);
      setOwnHeight(el); setDot(el, lv);
      if (cfg.hoverReasons) el.setAttribute('title', 'Signals only, not proof: ' + (why.join(', ') || 'no warning signs')); else el.removeAttribute('title');
      if (lv === 'low' && cfg.collapseHigh) { el.setAttribute('data-nobotty-collapse', '1'); el.setAttribute('data-nobotty-label', 'Low trust · u/' + name); }
      else { el.removeAttribute('data-nobotty-collapse'); el.removeAttribute('data-nobotty-label'); el.removeAttribute('data-nobotty-open'); }
    });
    afterEval();
  }
  /* ---------- the dot: a real element placed right after the comment's time ("4d ago (dot)") ----------
     It flows with the header text, so nothing is measured or positioned. No time found = no dot. */
  function ownedBy(el, n) { return n.closest(SEL) === el; }
  function timeAnchor(el) {
    var times = el.querySelectorAll('faceplate-timeago, time'), last = null;
    for (var i = 0; i < times.length; i++) {
      var t = times[i];
      if (!ownedBy(el, t) || t.closest('[slot="comment"], .usertext-body, .md')) continue;
      if (t.tagName === 'TIME' && t.parentElement && t.parentElement.closest('faceplate-timeago')) continue;
      last = t;
    }
    if (!last) return null;
    var link = last.parentElement && last.parentElement.closest('a');
    return link && ownedBy(el, link) ? link : last;
  }
  function ownDot(el) {
    var d = el.querySelectorAll('.nobotty-dot');
    for (var i = 0; i < d.length; i++) if (ownedBy(el, d[i])) return d[i];
    return null;
  }
  function setDot(el, lv) {
    var dot = ownDot(el), anchor = timeAnchor(el);
    if (!anchor || cfg.useStripe) { if (dot) dot.remove(); return; }
    if (!dot) { dot = document.createElement('span'); dot.className = 'nobotty-dot'; dot.setAttribute('aria-hidden', 'true'); }
    if (dot.getAttribute('data-lv') !== lv) dot.setAttribute('data-lv', lv);
    if (anchor.nextSibling !== dot) anchor.after(dot);
  }
  function removeDot(el) { var d = ownDot(el); if (d) d.remove(); }
  /* In stripe mode the stripe should only cover the comment itself, not its whole reply tree. */
  function setOwnHeight(el) {
    var own = el.querySelector(':scope > [slot="actionRow"]') || el.querySelector(':scope > [slot="comment"]') || el.querySelector(':scope > .entry');
    if (!own) { el.style.removeProperty('--nb-h'); return; }
    var h = Math.round(own.getBoundingClientRect().bottom - el.getBoundingClientRect().top);
    if (h > 0) el.style.setProperty('--nb-h', h + 'px'); else el.style.removeProperty('--nb-h');
  }
  function afterEval() { drawChip(); try { console.log('[Nobotty]', JSON.stringify(stats)); } catch (e) {} }
  function clear(el) {
    removeDot(el);
    ['data-nobotty', 'data-nobotty-label', 'data-nobotty-open', 'data-nobotty-collapse', 'data-nobotty-dm'].forEach(function (a) { el.removeAttribute(a); }); ['--nb-h'].forEach(function (v) { el.style.removeProperty(v); });
  }
  function onlyDots(m) {
    var n = [].concat([].slice.call(m.addedNodes), [].slice.call(m.removedNodes));
    return n.length > 0 && n.every(function (x) { return x.nodeType === 1 && x.classList.contains('nobotty-dot'); });
  }
  function schedule(ms) { if (pending) return; pending = true; setTimeout(function () { pending = false; evaluate(); }, typeof ms === 'number' ? ms : 400); }

  /* click on the one-line label of a collapsed item opens/closes it */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-nobotty-collapse], [data-nobotty-dm]'); if (!el) return;
    var r = el.getBoundingClientRect(); if (e.clientY - r.top > 24) return;
    if (el.hasAttribute('data-nobotty-open')) el.removeAttribute('data-nobotty-open'); else el.setAttribute('data-nobotty-open', '1');
  }, true);

  /* ---------- boot ---------- */
  sGet(['cfg'], function (r) {
    cfg = Object.assign({}, DEFAULTS, (r && r.cfg) || {});
    loadCache(function () {
      evaluate();
      new MutationObserver(function (m) { for (var i = 0; i < m.length; i++) { if (m[i].target !== chip && !(chip && chip.contains(m[i].target)) && !onlyDots(m[i])) { schedule(); return; } } }).observe(document.body, { childList: true, subtree: true });
    });
  });
  window.addEventListener('resize', function () { schedule(200); });
  window.addEventListener('nobotty-config', function (e) { cfg = Object.assign({}, DEFAULTS, e.detail || {}); evaluate(); });
  if (hasChrome && chrome.storage.onChanged) chrome.storage.onChanged.addListener(function (ch) {
    if (ch.cfg) { cfg = Object.assign({}, DEFAULTS, ch.cfg.newValue || {}); evaluate(); }
  });
  window.__nobotty = { dmKind: dmKind, evaluate: evaluate, analyzeHistory: analyzeHistory, histSignals: histSignals, trustOf: trustOf };
})();


/* ---- in-page settings (userscript build has no toolbar popup) ---- */
(function () {
  var D = { enabled:true,collapseHigh:false,showMedium:true,showGood:true,deepScan:false,hoverReasons:false,trusted:[],dmFilter:true,dmBlockBots:true,dmBlockSellers:true,showStatus:true };
  function load() { try { return Object.assign({}, D, JSON.parse(localStorage.getItem('nobotty:cfg')) || {}); } catch (e) { return Object.assign({}, D); } }
  var btn = document.createElement('button'); btn.textContent = 'Nobotty'; btn.setAttribute('aria-label', 'Nobotty settings');
  btn.style.cssText = 'position:fixed;left:12px;bottom:48px;z-index:2147483000;padding:8px 14px;border:0;border-radius:999px;background:#10231a;color:#f4f6ef;font:600 13px system-ui,sans-serif;cursor:pointer;opacity:.75';
  var box = document.createElement('div'); box.hidden = true;
  box.style.cssText = 'position:fixed;left:12px;bottom:88px;z-index:2147483000;width:290px;padding:14px;border-radius:16px;background:#f4f6ef;color:#10231a;font:14px/1.4 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35)';
  var rows = [['enabled','Turn on','Colour stripe on every checked comment'],['showMedium','Orange: medium trust','Some warning signs'],['showGood','Green: good trust','Old account, no warning signs'],['collapseHigh','Collapse red comments','Shrink low trust comments to one line'],['deepScan','Check history of every account','Slower'],['hoverReasons','Show reasons on hover','Plain tooltip'],['useStripe','Use a stripe instead of a dot','Thin line at the left edge'],['showStatus','Show status chip','Small badge'],['dmFilter','Filter direct messages','Hide scam and bot messages'],['dmBlockBots','Hide bots and scams','Crypto, add-me-on-Telegram'],['dmBlockSellers','Hide sales pitches too','Turn off to receive offers']];
  var c = load(), html = '<b style="font-size:16px">Nobotty</b><div style="color:#44584c;font-size:12px;margin:2px 0 8px">Signals, not proof. Runs on your device.</div>';
  rows.forEach(function (r) { html += '<label style="display:flex;gap:8px;padding:6px 0;border-top:1px solid #d5ddcf;cursor:pointer"><input type="checkbox" data-k="' + r[0] + '" style="margin-top:3px"' + (c[r[0]] ? ' checked' : '') + '><span>' + r[1] + '<small style="display:block;color:#5a6d60">' + r[2] + '</small></span></label>'; });
  html += '<div style="margin-top:8px"><b>Trusted accounts</b><small style="display:block;color:#5a6d60">One username per line</small><textarea data-k="trusted" style="width:100%;height:50px;box-sizing:border-box;margin-top:4px;border:1px solid #cdd7c8;border-radius:8px;padding:6px">' + c.trusted.join('\n') + '</textarea></div><button data-save style="margin-top:8px;width:100%;padding:9px;border:0;border-radius:999px;background:#e8693f;color:#10231a;font-weight:600;cursor:pointer">Save</button>';
  box.innerHTML = html;
  btn.onclick = function () { box.hidden = !box.hidden; };
  box.querySelector('[data-save]').onclick = function () {
    var n = load(); box.querySelectorAll('input[data-k]').forEach(function (i) { n[i.getAttribute('data-k')] = i.checked; });
    n.trusted = box.querySelector('textarea').value.split('\n').map(function (s) { return s.replace(/^u\//, '').trim().toLowerCase(); }).filter(Boolean);
    localStorage.setItem('nobotty:cfg', JSON.stringify(n)); window.dispatchEvent(new CustomEvent('nobotty-config', { detail: n })); box.hidden = true;
  };
  document.body.appendChild(btn); document.body.appendChild(box);
})();
