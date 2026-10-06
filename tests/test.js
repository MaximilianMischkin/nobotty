const {chromium}=require('playwright');
const fs=require('fs');
(async()=>{
 const b=await chromium.launch();const pg=await b.newPage({viewport:{width:900,height:900}});
 pg.on('pageerror',e=>console.log('PAGEERR',e.message));
 const now=Math.floor(Date.now()/1000),D=86400;
 const ACC={fresh_acct:{created:now-3*D,karma:12},'Quiet_Fox-4821':{created:now-400*D,karma:900},oldtimer:{created:now-2000*D,karma:25000},mid_user:{created:now-21*D,karma:90},copycat1:{created:now-200*D,karma:700},copycat2:{created:now-250*D,karma:800},trusty:{created:now-2*D,karma:1}};
 const html=`<body style="font:16px system-ui;background:#1a1a1b;color:#ddd;max-width:700px;margin:20px auto">
 <shreddit-comment author="fresh_acct"><div slot="comment">Great question! I'd be happy to help — it is a game-changer for sure — and worth testing in your own funnel.</div></shreddit-comment>
 <shreddit-comment author="oldtimer"><div slot="comment">Referrals worked best for me, direct outreach to people who already feel the problem.</div></shreddit-comment>
 <shreddit-comment author="mid_user"><div slot="comment">I tried cold email for two months and the replies were mostly out of office messages.</div></shreddit-comment>
 <shreddit-comment author="copycat1"><div slot="comment">This is a really great tool and everyone should try it right now, link in my profile.</div></shreddit-comment>
 <shreddit-comment author="copycat2"><div slot="comment">This is a really great tool and everyone should try it right now, link in my profile!</div></shreddit-comment>
 <shreddit-comment author="trusty"><div slot="comment">New account but I am a friend of the poster.</div></shreddit-comment>
 <div class="thing comment" data-author="Quiet_Fox-4821"><div class="entry"><div class="usertext-body"><div class="md">Old reddit layout comment from an auto style username.</div></div></div></div>
 </body>`;
 await pg.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:html}));
 await pg.goto('https://www.reddit.com/r/test/comments/x/');
 await pg.addInitScript(()=>{});
 await pg.evaluate(a=>{window.__NOBOTTY_FETCH=u=>{const n=decodeURIComponent(u.split('/user/')[1].split('/')[0]);const x=a[n];return Promise.resolve(x?{ok:true,status:200,json:()=>Promise.resolve({data:{created_utc:x.created,total_karma:x.karma}})}:{ok:false,status:404})};localStorage.setItem('nobotty:cfg',JSON.stringify({enabled:true,collapseHigh:true,showMedium:true,trusted:['trusty']}))},ACC);
 await pg.addStyleTag({content:fs.readFileSync('content.css','utf8')});
 await pg.addScriptTag({content:fs.readFileSync('content.js','utf8')});
 await pg.waitForTimeout(9500);
 const res=await pg.evaluate(()=>[...document.querySelectorAll('shreddit-comment,.thing.comment')].map(e=>({a:e.getAttribute('author')||e.getAttribute('data-author'),lv:e.getAttribute('data-nobotty'),label:(e.getAttribute('data-nobotty-label')||'').slice(0,150)})));
 console.log(JSON.stringify(res,null,1));
 await pg.screenshot({path:'test_shot.png'});
 // click expand test on the high one
 await pg.mouse.click(120,30);await pg.waitForTimeout(300);
 console.log('open after click:',await pg.evaluate(()=>document.querySelector('[data-nobotty="high"]')?.hasAttribute('data-nobotty-open')));
 await b.close();})();
