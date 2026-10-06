/* Nobotty background: public account info and recent history for a username. Only reddit.com, only valid usernames. */
function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }
var api = typeof browser !== 'undefined' ? browser : chrome;
/* Logged-out requests have their own rate limit, separate from the user's logged-in one (which Reddit itself also uses).
   Try logged-out first; fall back to the logged-in pool when that one is used up or refused. */
var anonUntil = 0;
function reddit(path) {
  if (Date.now() < anonUntil) return one(path, 'include');
  return one(path, 'omit').then(function (r) {
    var empty = r.status === 429 || (r.rl && r.rl.remaining != null && r.rl.remaining < 1);
    if (empty) anonUntil = Date.now() + Math.min(600, (r.rl && r.rl.reset) || 60) * 1000;
    if (r.ok) { if (empty) r.rl = { remaining: null, reset: null }; return r; }  // the logged-in pool is still there
    return one(path, 'include').then(function (r2) { return r2.ok || !r.ok ? r2 : r; });
  });
}
function one(path, creds) {
  return fetch('https://www.reddit.com' + path, { credentials: creds, headers: { Accept: 'application/json' } }).then(function (r) {
    var rl = { remaining: num(r.headers.get('x-ratelimit-remaining')), reset: num(r.headers.get('x-ratelimit-reset')) };
    if (!r.ok) return { ok: false, status: r.status, rl: rl };
    return r.json().then(function (data) { return { ok: true, status: r.status, data: data, rl: rl }; },
                         function () { return { ok: false, status: r.status, error: 'bad json', rl: rl }; });
  }).catch(function (e) { return { ok: false, status: 0, error: String((e && e.message) || e).slice(0, 60) }; });
}
function compact(children) {
  return (children || []).map(function (c) {
    var d = c.data || {};
    var body = d.body || ((d.title || '') + ' ' + (d.url && !/reddit\.com|redd\.it/.test(d.url) ? d.url : '') + ' ' + (d.selftext || ''));
    return { s: d.subreddit, b: String(body).slice(0, 400), t: d.created_utc };
  });
}
api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'nobotty-ping') { sendResponse({ pong: true }); return; }
  if (msg && msg.type === 'nobotty-get') {
    /* Only two read-only bulk endpoints: a thread's comment tree and account data for up to 100 account ids. */
    var p = String(msg.path || '');
    if (!/^\/comments\/[a-z0-9]{3,12}\.json\?limit=500&depth=12&raw_json=1$/.test(p) && !/^\/api\/user_data_by_account_ids\.json\?ids=(t2_[a-z0-9]{1,16},?){1,100}$/.test(p)) {
      sendResponse({ ok: false, status: 0, error: 'bad path' }); return;
    }
    reddit(p).then(sendResponse); return true;
  }
  if (!msg || (msg.type !== 'nobotty-about' && msg.type !== 'nobotty-history')) return;
  var name = String(msg.name || '');
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(name)) { sendResponse({ ok: false, status: 0, error: 'bad name' }); return; }
  if (msg.type === 'nobotty-about') {
    reddit('/user/' + encodeURIComponent(name) + '/about.json?raw_json=1').then(sendResponse);
  } else {
    reddit('/user/' + encodeURIComponent(name) + '/overview.json?limit=40&raw_json=1').then(function (r) {
      if (r.ok) { r.items = compact(r.data && r.data.data && r.data.data.children); delete r.data; }
      sendResponse(r);
    });
  }
  return true; // async response
});
