const {chromium}=require('playwright');
const fs=require('fs');
async function run(cfg){
 const b=await chromium.launch();const pg=await b.newPage({viewport:{width:900,height:700}});
 pg.on('pageerror',e=>console.log('PAGEERR',e.message));
 const now=Math.floor(Date.now()/1000),D=86400;
 const ACC={agency_guy:{created:now-200*D,karma:3000},crypto_bro:{created:now-5*D,karma:3},linkbot:{created:now-4*D,karma:8},old_friend:{created:now-3000*D,karma:50000}};
 const msg=(a,t)=>`<div class="thing message" data-author="${a}"><div class="entry"><div class="md">${t}</div></div></div>`;
 const html=`<meta charset="utf-8"><body style="font:16px system-ui;background:#1a1a1b;color:#ddd;max-width:700px;margin:20px auto">`+
  msg('agency_guy',"Hi! I came across your startup and I can build your website and boost your SEO. Free audit this week, DM me.")+
  msg('crypto_bro',"Hey, join my crypto trading signals, add me on Telegram @fastprofit")+
  msg('linkbot',"look here https://example.com/deal for more")+
  msg('old_friend',"Hey, are we still on for Saturday? Bring the camera.")+`</body>`;
 await pg.route('https://old.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
 await pg.goto('https://old.reddit.com/message/inbox');
 await pg.evaluate(([a,c])=>{window.__NOBOTTY_FETCH=u=>{const n=decodeURIComponent(u.split('/user/')[1].split('/')[0]);const x=a[n];return Promise.resolve(x?{ok:true,status:200,json:()=>Promise.resolve({data:{created_utc:x.created,total_karma:x.karma}})}:{ok:false,status:404})};localStorage.setItem('nobotty:cfg',JSON.stringify(c))},[ACC,cfg]);
 await pg.addStyleTag({content:fs.readFileSync('content.css','utf8')});
 await pg.addScriptTag({content:fs.readFileSync('content.js','utf8')});
 await pg.waitForTimeout(6500);
 const res=await pg.evaluate(()=>[...document.querySelectorAll('.thing.message')].map(e=>e.getAttribute('data-author')+' => '+(e.getAttribute('data-nobotty-dm')||'shown')));
 console.log(JSON.stringify(cfg).slice(0,110),'\n  ',res.join('\n   '));
 const chipText=await pg.evaluate(()=>{const c=[...document.querySelectorAll('div')].find(d=>d.textContent.startsWith('Nobotty:')&&d.style.position==='fixed');return c?c.textContent:'NO CHIP'});console.log('  chip:',chipText);
 if(cfg.dmBlockSellers&&cfg.dmFilter)await pg.screenshot({path:'test_dm.png'});
 await b.close();}
(async()=>{
 const base={enabled:true,collapseHigh:true,showMedium:true,trusted:[],dmFilter:true,dmBlockBots:true};
 await run({...base,dmBlockSellers:true});
 await run({...base,dmBlockSellers:false});
 await run({...base,dmBlockSellers:true,dmFilter:false});
})();
