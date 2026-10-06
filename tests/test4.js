// Lookups that fail or hang must be reported in the status chip, never swallowed.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 for (const mode of ['throws','http403','hangs']) {
  const b=await chromium.launch();const pg=await b.newPage();
  await pg.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<body><shreddit-comment author="someone"><div slot="comment">hello there friend, this is a normal comment of some length</div></shreddit-comment></body>'}));
  await pg.goto('https://www.reddit.com/r/x/comments/1/');
  await pg.evaluate(m=>{window.__NOBOTTY_FETCH=(u,o)=>{ if(m==='throws') return Promise.reject(new TypeError('NetworkError when attempting to fetch resource.')); if(m==='http403') return Promise.resolve({ok:false,status:403}); return new Promise((_,rej)=>{o.signal.addEventListener('abort',()=>rej(Object.assign(new Error('aborted'),{name:'AbortError'})))}); }},mode);
  await pg.addStyleTag({content:fs.readFileSync(path.join(__dirname,'..','content.css'),'utf8')});
  await pg.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8')});
  await pg.waitForTimeout(mode==='hangs'?10500:2500);
  const chip=await pg.evaluate(()=>{const c=[...document.querySelectorAll('div')].find(d=>d.textContent.startsWith('Nobotty:')&&d.style.position==='fixed');return c?c.textContent:'NO CHIP'});
  console.log(mode.padEnd(8),'=>',chip);
  await b.close();}
})();
