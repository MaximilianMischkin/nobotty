// Userscript build: loads botless.user.js into a mock inbox and drives the in-page settings panel.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 const b=await chromium.launch();const pg=await b.newPage({viewport:{width:900,height:700}});
 pg.on('pageerror',e=>console.log('PAGEERR',e.message));
 const now=Math.floor(Date.now()/1000),D=86400;
 const ACC={agency_guy:{created:now-200*D,karma:3000},crypto_bro:{created:now-5*D,karma:3},old_friend:{created:now-3000*D,karma:50000}};
 const msg=(a,t)=>`<div class="thing message" data-author="${a}"><div class="entry"><div class="md">${t}</div></div></div>`;
 const html=`<meta charset="utf-8"><body style="font:16px system-ui;background:#1a1a1b;color:#ddd;max-width:700px;margin:20px auto">`+
  msg('agency_guy',"Hi! I came across your startup and I can build your website and boost your SEO. Free audit this week.")+
  msg('crypto_bro',"Hey, join my crypto trading signals, add me on Telegram @fastprofit")+
  msg('old_friend',"Hey, are we still on for Saturday?")+`</body>`;
 await pg.route('https://old.reddit.com/**',r=>{
   const u=r.request().url();
   if(u.includes('about.json')){const n=decodeURIComponent(u.split('/user/')[1].split('/')[0]);const x=ACC[n];return r.fulfill(x?{status:200,contentType:'application/json',body:JSON.stringify({data:{created_utc:x.created,total_karma:x.karma}})}:{status:404,body:'{}'})}
   return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html})});
 await pg.goto('https://old.reddit.com/message/inbox');
 await pg.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..','userscript','botless.user.js'),'utf8')});
 const state=()=>pg.evaluate(()=>[...document.querySelectorAll('.thing.message')].map(e=>e.getAttribute('data-author')+'='+(e.getAttribute('data-botless-dm')||'shown')).join(', '));
 await pg.waitForTimeout(4500);console.log('default       :',await state());
 await pg.click('button[aria-label="Botless settings"]');
 await pg.uncheck('input[data-k="dmBlockSellers"]');await pg.click('[data-save]');await pg.waitForTimeout(500);
 console.log('sellers off   :',await state());
 await pg.click('button[aria-label="Botless settings"]');
 await pg.check('input[data-k="dmBlockSellers"]');await pg.click('[data-save]');await pg.waitForTimeout(500);
 console.log('sellers on    :',await state());
 await pg.screenshot({path:'test_userscript.png'});
 await b.close();})();
