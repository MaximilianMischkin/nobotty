// Builds userscript/nobotty.user.js from content.css + content.js + a small in-page settings panel.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'content.css'), 'utf8');
const core = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const panel = `
/* ---- in-page settings (userscript build has no toolbar popup) ---- */
(function () {
  var D = { enabled:true,collapseHigh:false,showMedium:true,showGood:true,deepScan:false,hoverReasons:false,trusted:[],dmFilter:true,dmBlockBots:true,dmBlockSellers:true,showStatus:true };
  function load() { try { return Object.assign({}, D, JSON.parse(localStorage.getItem('nobotty:cfg')) || {}); } catch (e) { return Object.assign({}, D); } }
  var btn = document.createElement('button'); btn.textContent = 'Nobotty'; btn.setAttribute('aria-label', 'Nobotty settings');
  btn.style.cssText = 'position:fixed;left:12px;bottom:48px;z-index:2147483000;padding:8px 14px;border:0;border-radius:999px;background:#10231a;color:#f4f6ef;font:600 13px system-ui,sans-serif;cursor:pointer;opacity:.75';
  var box = document.createElement('div'); box.hidden = true;
  box.style.cssText = 'position:fixed;left:12px;bottom:88px;z-index:2147483000;width:290px;padding:14px;border-radius:16px;background:#f4f6ef;color:#10231a;font:14px/1.4 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35)';
  var rows = [['enabled','Turn on','Small dot after every checked comment'],['showMedium','Orange: medium trust','Some warning signs'],['showGood','Green: good trust','Old account, no warning signs'],['collapseHigh','Collapse red comments','Shrink low trust comments to one line'],['deepScan','Check history of every account','Slower'],['hoverReasons','Show reasons on hover','Plain tooltip'],['useStripe','Use a stripe instead of a dot','Thin line at the left edge'],['showStatus','Show status chip','Small badge'],['dmFilter','Filter direct messages','Hide scam and bot messages'],['dmBlockBots','Hide bots and scams','Crypto, add-me-on-Telegram'],['dmBlockSellers','Hide sales pitches too','Turn off to receive offers']];
  var c = load(), html = '<b style="font-size:16px">Nobotty</b><div style="color:#44584c;font-size:12px;margin:2px 0 8px">Signals, not proof. Runs on your device.</div>';
  rows.forEach(function (r) { html += '<label style="display:flex;gap:8px;padding:6px 0;border-top:1px solid #d5ddcf;cursor:pointer"><input type="checkbox" data-k="' + r[0] + '" style="margin-top:3px"' + (c[r[0]] ? ' checked' : '') + '><span>' + r[1] + '<small style="display:block;color:#5a6d60">' + r[2] + '</small></span></label>'; });
  html += '<div style="margin-top:8px"><b>Trusted accounts</b><small style="display:block;color:#5a6d60">One username per line</small><textarea data-k="trusted" style="width:100%;height:50px;box-sizing:border-box;margin-top:4px;border:1px solid #cdd7c8;border-radius:8px;padding:6px"></textarea></div><button data-save style="margin-top:8px;width:100%;padding:9px;border:0;border-radius:999px;background:#e8693f;color:#10231a;font-weight:600;cursor:pointer">Save</button>';
  box.innerHTML = html;
  box.querySelector('textarea[data-k="trusted"]').value = c.trusted.join('\\n');  // set as text, never parsed as HTML
  btn.onclick = function () { box.hidden = !box.hidden; };
  box.querySelector('[data-save]').onclick = function () {
    var n = load(); box.querySelectorAll('input[data-k]').forEach(function (i) { n[i.getAttribute('data-k')] = i.checked; });
    n.trusted = box.querySelector('textarea').value.split('\\n').map(function (s) { return s.replace(/^u\\//, '').trim().toLowerCase(); }).filter(Boolean);
    localStorage.setItem('nobotty:cfg', JSON.stringify(n)); window.dispatchEvent(new CustomEvent('nobotty-config', { detail: n })); box.hidden = true;
  };
  document.body.appendChild(btn); document.body.appendChild(box);
})();
`;
const header = `// ==UserScript==
// @name         Nobotty
// @namespace    https://github.com/MaximilianMischkin/nobotty
// @version      ${pkg.version}
// @description  Spot likely bots, scams and sales pitches on Reddit. Runs locally.
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://chat.reddit.com/*
// @run-at       document-idle
// @noframes
// ==/UserScript==
`;
const out = header + "(function(){var st=document.createElement('style');st.textContent=" + JSON.stringify(css) + ";document.head.appendChild(st);})();\n" + core + "\n" + panel;
fs.mkdirSync(path.join(root, 'userscript'), { recursive: true });
fs.writeFileSync(path.join(root, 'userscript', 'nobotty.user.js'), out);
console.log('built userscript/nobotty.user.js', out.length, 'bytes');
