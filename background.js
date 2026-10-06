/* Nobotty background: looks up public account info for a username. Only reddit.com, only valid usernames. */
var api = typeof browser !== 'undefined' ? browser : chrome;
api.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.type === 'nobotty-ping') { sendResponse({ pong: true }); return; }
  if (!msg || msg.type !== 'nobotty-about') return;
  var name = String(msg.name || '');
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(name)) { sendResponse({ ok: false, status: 0, error: 'bad name' }); return; }
  fetch('https://www.reddit.com/user/' + encodeURIComponent(name) + '/about.json?raw_json=1', {
    credentials: 'include', headers: { Accept: 'application/json' }
  }).then(function (r) {
    if (!r.ok) return { ok: false, status: r.status };
    return r.json().then(function (data) { return { ok: true, status: r.status, data: data }; }, function () { return { ok: false, status: r.status, error: 'bad json' }; });
  }).catch(function (e) {
    return { ok: false, status: 0, error: String((e && e.message) || e).slice(0, 60) };
  }).then(sendResponse);
  return true; // async response
});
