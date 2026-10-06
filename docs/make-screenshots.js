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
 // hero
 const hp=await b.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 const img=n=>'data:image/png;base64,'+fs.readFileSync(path.join(__dirname,n+'.png')).toString('base64');
 await hp.setContent(`<style>body{margin:0;width:1600px;height:900px;background:#0f1a14;color:#f4f6ef;font-family:system-ui,-apple-system,sans-serif;position:relative;overflow:hidden}
 h1{position:absolute;left:70px;top:44px;margin:0;font:600 54px/1.05 system-ui;letter-spacing:-.02em}
 p{position:absolute;left:72px;top:118px;margin:0;font:400 24px system-ui;color:#b9c8bd}
 .card{position:absolute;top:190px;width:720px;height:530px;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.45)}
 .card img{width:720px;display:block}
 .l{left:70px}.r{left:810px}
 .tag{position:absolute;top:745px;font:600 22px system-ui;color:#b9c8bd}
 .key{position:absolute;left:810px;top:800px;font:500 22px system-ui;color:#f4f6ef;display:flex;gap:26px;align-items:center}.key i{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:8px;vertical-align:-1px}
 </style><h1>Nobotty</h1><p>A small dot after each comment shows which Reddit accounts to trust.</p>
 <div class="card l"><img src="${img('before')}"></div><div class="card r"><img src="${img('after')}"></div>
 <div class="tag" style="left:72px">Before</div><div class="tag" style="left:812px">With Nobotty</div>
 <div class="key"><span><i style="background:#f0646b"></i>low trust</span><span><i style="background:#f3b04e"></i>medium</span><span><i style="background:#4fc08d"></i>good</span></div>`);
 await hp.waitForTimeout(400);
 await hp.screenshot({path:path.join(__dirname,'hero.png')});
 // demo video: thread loads, dots pop in one by one, captions explain, end card with the link
 const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:__dirname,size:{width:1280,height:720}}});
 const vp=await ctx.newPage();
 const vpage=`<!doctype html><meta charset="utf-8"><style>${CSS}
  body{background:#0b0f10;font-size:15px}.wrap{position:absolute;left:440px;top:36px;width:740px;padding:22px 28px;background:#0e1113;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  .side{position:absolute;left:50px;top:70px;width:360px;color:#f4f6ef}
  .side h1{font:650 46px/1.05 system-ui;margin:0 0 18px;letter-spacing:-.02em}
  .cap{font:500 25px/1.35 system-ui;color:#c9d6cd;min-height:150px;transition:opacity .35s}
  .key{margin-top:26px;font:500 19px system-ui;display:grid;gap:12px}.key i{display:inline-block;width:13px;height:13px;border-radius:50%;margin-right:10px}
  .end{position:fixed;inset:0;background:#0f1a14;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity .6s;color:#f4f6ef}
  .tick{position:fixed;right:0;bottom:0;width:2px;height:2px;animation:tick 1s steps(30) infinite}
  @keyframes tick{from{background:#0b0f10}to{background:#0c1011}}
  .end h1{font:650 64px system-ui;margin:0 0 12px;letter-spacing:-.02em}.end p{font:400 26px system-ui;color:#b9c8bd;margin:6px}
 </style><body><div class="side"><h1>Nobotty</h1><div class="cap" id="cap">Reddit threads are full of bots and sales pitches.</div>
 <div class="key"><span><i style="background:#f0646b"></i>low trust</span><span><i style="background:#f3b04e"></i>medium</span><span><i style="background:#4fc08d"></i>good</span></div></div>
 <div class="wrap"><h4>Where did your first customers come from?</h4>${C.map(comment).join('')}</div>
 <div class="tick"></div><div class="end" id="end"><h1>Nobotty</h1><p>Free and open source · Firefox, Chrome, Safari</p><p>github.com/MaximilianMischkin/nobotty</p></div></body>`;
 await vp.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:vpage}));
 await vp.goto(URL);
 const cap=t=>vp.evaluate(t=>{const c=document.getElementById('cap');c.style.opacity=0;setTimeout(()=>{c.textContent=t;c.style.opacity=1;},350);},t);
 await vp.waitForTimeout(2200);
 await cap('Nobotty checks each account: age, karma, copied text and, if it looks off, its posting history.');
 await stub(vp,450);await inject(vp);
 await vp.waitForTimeout(3600);
 await cap('A small dot after the time. Red for low trust, green for real people. Nothing else changes.');
 await vp.waitForTimeout(3600);
 await cap('It also hides bot and sales-pitch DMs. Everything runs on your device.');
 await vp.waitForTimeout(3200);
 await vp.evaluate(()=>document.getElementById('end').style.opacity=1);
 await vp.waitForTimeout(3000);
 const vpath=await vp.video().path();await ctx.close();
 fs.renameSync(vpath,path.join(__dirname,'demo.webm'));
 await b.close();})();
