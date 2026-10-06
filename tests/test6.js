// Background that never answers (or lacks a listener) must be reported in the chip within ~10 s.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 for (const mode of ['ok','hang','nolistener']) {
  const b=await chromium.launch();const pg=await b.newPage();
  await pg.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<body><shreddit-comment author="freshbot"><div slot="comment">hello there friend, this is a normal comment of some length</div></shreddit-comment></body>'}));
  await pg.goto('https://www.reddit.com/r/x/comments/1/');
  await pg.evaluate(m=>{const now=Math.floor(Date.now()/1000);window.chrome={runtime:{id:'t',getManifest:()=>({version:'9.9.9'}),sendMessage:msg=>{
    if(m==='hang')return new Promise(()=>{});
    if(m==='nolistener')return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
    if(msg.type==='nobotty-ping')return Promise.resolve({pong:true});
    return Promise.resolve({ok:true,status:200,data:{data:{created_utc:now-86400,total_karma:2}}});}}}},mode);
  await pg.addStyleTag({content:fs.readFileSync(path.join(__dirname,'..','content.css'),'utf8')});
  await pg.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8')});
  await pg.waitForTimeout(mode==='hang'?12500:3500);
  console.log(mode.padEnd(10),'=>',await pg.evaluate(()=>{const c=[...document.querySelectorAll('div')].find(d=>d.textContent.startsWith('Nobotty')&&d.style.position==='fixed');return c?c.textContent:'NO CHIP'}));
  await b.close();}
})();
