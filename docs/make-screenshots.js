// Renders docs/before.png, docs/after.png, docs/settings.png, docs/hero.png and docs/demo.webm from a mock thread
// with fictional users. The "after" image and the video run the real content script against stubbed account data.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const C=[
 {u:'nova_writes',av:'#5b8def',t:'3h',txt:'We moved our onboarding emails to plain text and replies doubled. Worth testing before building anything fancy.',kids:[
   {u:'Fresh-Panda-4821',av:'#c084fc',t:'2h',txt:'Great question! I\'d be happy to help. Check my profile for a free audit and a game-changer tool for you.',kids:[
     {u:'nova_writes',av:'#5b8def',t:'1h',txt:'No thanks.'}]}]},
 {u:'mike_rebuilds',av:'#3fb26b',t:'3h',txt:'Referrals brought us the first ten customers. Ads did nothing for us until we had real reviews.',kids:[]},
 {u:'Happy_Falcon_233',av:'#f3b04e',t:'2h',txt:'Same here. Cold email got me mostly out-of-office replies for two months.',kids:[]},
 {u:'LeadGenDeals',av:'#ef4444',t:'1h',txt:'Boost your traffic today, DM me and add me on Telegram for the full list.',kids:[]}
];
const av=c=>`data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><circle cx='14' cy='14' r='14' fill='${c.replace('#','%23')}'/><circle cx='14' cy='11' r='5' fill='white' opacity='.85'/><ellipse cx='14' cy='24' rx='8' ry='6' fill='white' opacity='.85'/></svg>`;
function comment(c){
  return `<shreddit-comment author="${c.u}"><div slot="commentMeta" class="meta"><img src="${av(c.av)}" width=28 height=28><a href="/user/${c.u}/">${c.u}</a><span class="sep">·</span><a class="tm" href="#"><faceplate-timeago><time>${c.t} ago</time></faceplate-timeago></a></div><div slot="comment" class="body">${c.txt}</div><div slot="actionRow" class="row"><span>⇧ ${3+c.u.length%7} ⇩</span><span>Reply</span><span>Award</span><span>Share</span><span>···</span></div>${(c.kids||[]).map(k=>'<div class="kid">'+comment(k)+'</div>').join('')}</shreddit-comment>`;
}
const CSS=`body{margin:0;background:#0e1113;color:#d7dadc;font:14px/1.5 -apple-system,system-ui,sans-serif}
.wrap{padding:26px 40px 26px 40px}
h4{margin:0 0 16px;font:600 16px system-ui;color:#f2f4f5}
shreddit-comment{display:block;position:relative;margin:0 0 12px}
.meta{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#8b98a0}.meta a{color:#e8eaeb;font-weight:600;text-decoration:none}.meta a.tm{color:#8b98a0;font-weight:400}
.meta img{border-radius:50%;display:inline-block;margin-right:3px}
.body{margin:3px 0 4px 38px;color:#d7dadc}
.row{margin:0 0 4px 38px;display:flex;gap:18px;font-size:12px;color:#8b98a0}
.kid{margin:8px 0 0 30px;padding-left:8px;border-left:1px solid #2a3236}`;
const page=`<!doctype html><meta charset="utf-8"><style>${CSS}</style><body><div class="wrap"><h4>Where did your first customers come from?</h4>${C.map(comment).join('')}</div></body>`;
const now=Math.floor(Date.now()/1000),D=86400;
const A={nova_writes:{c:now-2200*D,k:18400},'Fresh-Panda-4821':{c:now-3*D,k:1},mike_rebuilds:{c:now-1400*D,k:9100},Happy_Falcon_233:{c:now-21*D,k:90},LeadGenDeals:{c:now-12*D,k:23}};
const spam=[];for(let i=0;i<20;i++)spam.push({s:'sub'+(i%13),b:'amazing deal https://bit.ly/x'+(i%2)+' dm me now',t:now-i*40});
function stub(pg,delay){
  return pg.evaluate(([a,sp,delay])=>{
    const wait=v=>new Promise(r=>setTimeout(()=>r(v),delay?delay+Math.random()*delay:0));
    window.chrome={runtime:{id:'t',getManifest:()=>({version:'0.4'}),sendMessage:m=>{
      if(m.type==='nobotty-ping')return Promise.resolve({pong:true});
      if(m.type==='nobotty-about')return wait({ok:true,status:200,data:{data:{created_utc:a[m.name].c,total_karma:a[m.name].k}},rl:{remaining:90,reset:60}});
      return wait({ok:true,status:200,items:m.name==='LeadGenDeals'?sp:[{s:'a',b:'a normal comment about something else entirely, nothing to see',t:0}],rl:{remaining:80,reset:60}});}}};
    localStorage.setItem('nobotty:cfg',JSON.stringify({showStatus:false}));
  },[A,spam,delay]);
}
async function inject(pg){
  await pg.addStyleTag({content:fs.readFileSync(path.join(root,'content.css'),'utf8')});
  await pg.addScriptTag({content:fs.readFileSync(path.join(root,'content.js'),'utf8')});
}
(async()=>{
 const b=await chromium.launch();
 // the URL id "x" is too short for the bulk lookup, so the stubbed single lookups are used
 const URL='https://www.reddit.com/r/startups/comments/x/demo/';
 for(const mode of ['before','after']){
  const pg=await b.newPage({viewport:{width:760,height:560},deviceScaleFactor:2});
  await pg.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:page}));
  await pg.goto(URL);
  if(mode==='after'){await stub(pg,0);await inject(pg);await pg.waitForTimeout(3500);}
  await pg.screenshot({path:path.join(__dirname,mode+'.png')});
  console.log(mode,await pg.evaluate(()=>[...document.querySelectorAll('shreddit-comment')].map(e=>e.getAttribute('author')+'='+(e.getAttribute('data-nobotty')||'none')).join(', ')));
  await pg.close();
 }
 // settings popup
 const pp=await b.newPage({viewport:{width:300,height:640},deviceScaleFactor:2});
 await pp.addInitScript(()=>{window.chrome={storage:{local:{get:(k,cb)=>cb({}),set:(o,cb)=>cb&&cb()}}}});
 await pp.goto('file://'+path.join(root,'popup.html'));await pp.waitForTimeout(300);
 await pp.screenshot({path:path.join(__dirname,'settings.png'),fullPage:true});
 // A browser window around a thread, used by the hero image and the video (looks like a real screen, no marketing layout)
 const C2=C.concat([
  {u:'sam_k_dev',av:'#14b8a6',t:'58m',txt:'Posting in small Slack groups worked better for us than Reddit ads. Took a while though.',kids:[
    {u:'Quick-Otter-77',av:'#e879f9',t:'40m',txt:'Interested',kids:[]}]},
  {u:'jen_builds',av:'#f97316',t:'31m',txt:'Our first five came from people who found an old blog post. Writing things down pays off later.',kids:[]}]);
 Object.assign(A,{sam_k_dev:{c:now-900*D,k:4200},'Quick-Otter-77':{c:now-2*D,k:1},jen_builds:{c:now-1800*D,k:12000}});
 const FRAME=`
  .win{position:absolute;border-radius:12px;overflow:hidden;background:#0e1113;box-shadow:0 0 0 1px #2b3236,0 24px 70px rgba(0,0,0,.55)}
  .bar{height:40px;background:#1c2125;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid #2b3236}
  .bar i{width:12px;height:12px;border-radius:50%;display:inline-block}
  .url{margin-left:18px;flex:1;height:26px;border-radius:7px;background:#121619;color:#9aa6ad;font:13px/26px system-ui;padding:0 12px}
  .ext{width:22px;height:22px;border-radius:6px;background:#10231a;display:flex;align-items:center;justify-content:center}
  .ext b{width:8px;height:8px;border-radius:50%;background:#4fc08d}
  .view{position:absolute;top:41px;left:0;right:0;bottom:0;overflow:hidden}
  .view .wrap{max-width:760px;margin:0 auto;padding:26px 28px 400px}`;
 const bar=`<div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><div class="url">reddit.com/r/startups/comments/1x8k2q/where_did_your_first_customers_come_from/</div><div class="ext"><b></b></div></div>`;
 // hero: one clean browser window, the dots doing the talking
 const hp=await b.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 await hp.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><style>${CSS}${FRAME}
  body{background:#15191c;font-size:15px}
  .t{position:absolute;left:120px;top:56px;color:#f2f4f5;font:600 30px system-ui;letter-spacing:-.01em}
  .s{position:absolute;left:120px;top:98px;color:#9aa6ad;font:400 19px system-ui}
  .s i{display:inline-block;width:10px;height:10px;border-radius:50%;margin:0 6px 0 14px;vertical-align:0}
 </style><body><div class="t">Nobotty</div><div class="s">a small dot after every Reddit comment<i style="background:#f0646b"></i>low trust<i style="background:#f3b04e"></i>medium<i style="background:#4fc08d"></i>good</div>
 <div class="win" style="left:120px;top:150px;width:1360px;height:690px">${bar}<div class="view"><div class="wrap"><h4>Where did your first customers come from?</h4>${C2.map(comment).join('')}</div></div></div></body>`}));
 await hp.goto(URL);await stub(hp,0);await inject(hp);await hp.waitForTimeout(3500);
 await hp.screenshot({path:path.join(__dirname,'hero.png')});
 // video: a plain screen recording. Thread is there, dots appear, it scrolls, the cursor checks a red one, then the link.
 const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:__dirname,size:{width:1280,height:720}}});
 const vp=await ctx.newPage();
 const vpage=`<!doctype html><meta charset="utf-8"><style>${CSS}${FRAME}
  body{background:#15191c;font-size:15px;overflow:hidden}
  .cur{position:fixed;left:0;top:0;width:20px;height:20px;z-index:9;transition:transform 1.1s cubic-bezier(.45,.05,.25,1);transform:translate(900px,560px);pointer-events:none}
  .tick{position:fixed;right:0;bottom:0;width:2px;height:2px;animation:tick 1s steps(30) infinite}
  @keyframes tick{from{background:#15191c}to{background:#161a1d}}
  .end{position:fixed;inset:0;background:#15191c;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity .5s;color:#f2f4f5;font:400 22px system-ui;gap:10px}
  .end b{font:600 30px system-ui}.end span{color:#9aa6ad}
 </style><body><div class="win" style="left:0;top:0;right:0;bottom:0;border-radius:0">${bar}<div class="view" id="view"><div class="wrap"><h4>Where did your first customers come from?</h4>${C2.map(comment).join('')}</div></div></div>
 <svg class="cur" id="cur" viewBox="0 0 20 20"><path d="M3 2 L3 16 L7 12.5 L9.6 18 L12 17 L9.5 11.6 L15 11.4 Z" fill="#fff" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/></svg>
 <div class="tick"></div><div class="end" id="end"><b>Nobotty</b><span>free, open source</span><div>github.com/MaximilianMischkin/nobotty</div></div></body>`;
 await vp.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:vpage}));
 await vp.goto(URL);
 const move=(x,y)=>vp.evaluate(([x,y])=>document.getElementById('cur').style.transform=`translate(${x}px,${y}px)`,[x,y]);
 const dotAt=n=>vp.evaluate(n=>{const c=[...document.querySelectorAll('shreddit-comment')].find(e=>e.getAttribute('author')===n);const d=c&&c.querySelector('.nobotty-dot');const r=d&&d.getBoundingClientRect();return r?[r.left+2,r.top+2]:[700,400];},n);
 const scroll=(y,ms)=>vp.evaluate(([y,ms])=>{const v=document.getElementById('view'),s=v.scrollTop,t0=performance.now();
   (function f(t){const k=Math.min(1,(t-t0)/ms),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;v.scrollTop=s+(y-s)*e;if(k<1)requestAnimationFrame(f);})(t0);},[y,ms]);
 await vp.waitForTimeout(900);
 await move(760,300);
 await vp.waitForTimeout(700);
 await stub(vp,380);await inject(vp);
 await vp.waitForTimeout(2600);
 let [x,y]=await dotAt('Fresh-Panda-4821');await move(x,y);
 await vp.waitForTimeout(1700);
 await move(1000,420);await scroll(330,2200);
 await vp.waitForTimeout(2600);
 [x,y]=await dotAt('Quick-Otter-77');await move(x,y);
 await vp.waitForTimeout(1900);
 await vp.evaluate(()=>document.getElementById('end').style.opacity=1);
 await vp.waitForTimeout(2600);
 const vpath=await vp.video().path();await ctx.close();
 fs.renameSync(vpath,path.join(__dirname,'demo.webm'));
 await b.close();})();
