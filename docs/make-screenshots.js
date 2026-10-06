// Renders docs/before.png, docs/after.png, docs/settings.png and docs/hero.png from a mock thread with fictional users.
// The "after" image runs the real content script against stubbed account data.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const C=[
 {u:'nova_writes',av:'#5b8def',t:'3h',txt:'We moved our onboarding emails to plain text and replies doubled. Worth testing before building anything fancy.',kids:[
   {u:'Fresh-Panda-4821',av:'#c084fc',t:'2h',txt:'Great question! I\'d be happy to help. Check my profile for a free audit and a game-changer tool for you.'}]},
 {u:'mike_rebuilds',av:'#3fb26b',t:'3h',txt:'Referrals brought us the first ten customers. Ads did nothing for us until we had real reviews.',kids:[]},
 {u:'Happy_Falcon_233',av:'#f3b04e',t:'2h',txt:'Same here. Cold email got me mostly out-of-office replies for two months.',kids:[]},
 {u:'LeadGenDeals',av:'#ef4444',t:'1h',txt:'Boost your traffic today, DM me and add me on Telegram for the full list.',kids:[]}
];
function comment(c){
  return `<shreddit-comment author="${c.u}"><div slot="commentMeta" class="meta"><i style="background:${c.av}"></i><b>${c.u}</b><span>${c.t} ago</span></div><div slot="comment" class="body">${c.txt}</div><div slot="actionRow" class="row"><span>⇧ ${3+c.u.length%7}</span><span>Reply</span><span>Share</span></div>${(c.kids||[]).map(k=>'<div class="kid">'+comment(k)+'</div>').join('')}</shreddit-comment>`;
}
const page=`<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#0e1113;color:#d7dadc;font:14px/1.5 -apple-system,system-ui,sans-serif}
.wrap{padding:28px 40px 28px 52px}
h4{margin:0 0 14px;font:600 15px system-ui;color:#f2f4f5}
shreddit-comment{display:block;position:relative;margin:0 0 14px}
.meta{display:flex;align-items:center;gap:8px;font-size:12px;color:#8b98a0}.meta b{color:#e8eaeb}.meta i{width:24px;height:24px;border-radius:50%;display:inline-block}
.body{margin:4px 0 4px 32px;color:#d7dadc}
.row{margin:0 0 6px 32px;display:flex;gap:16px;font-size:12px;color:#8b98a0}
.kid{margin:10px 0 0 32px}
</style><body><div class="wrap"><h4>Where did your first customers come from?</h4>${C.map(comment).join('')}</div></body>`;
(async()=>{
 const b=await chromium.launch();
 const now=Math.floor(Date.now()/1000),D=86400;
 const A={nova_writes:{c:now-2200*D,k:18400},'Fresh-Panda-4821':{c:now-3*D,k:1},mike_rebuilds:{c:now-1400*D,k:9100},Happy_Falcon_233:{c:now-21*D,k:90},LeadGenDeals:{c:now-12*D,k:23}};
 const spam=[];for(let i=0;i<20;i++)spam.push({s:'sub'+(i%13),b:'amazing deal https://bit.ly/x'+(i%2)+' dm me now',t:now-i*40});
 for(const mode of ['before','after']){
  const pg=await b.newPage({viewport:{width:760,height:520},deviceScaleFactor:2});
  await pg.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:page}));
  await pg.goto('https://www.reddit.com/r/startups/comments/demo/');
  if(mode==='after'){
   await pg.evaluate(([a,sp])=>{window.chrome={runtime:{id:'t',getManifest:()=>({version:'0.2.1'}),sendMessage:m=>{if(m.type==='nobotty-ping')return Promise.resolve({pong:true});if(m.type==='nobotty-about')return Promise.resolve({ok:true,status:200,data:{data:{created_utc:a[m.name].c,total_karma:a[m.name].k}},rl:{remaining:90,reset:60}});return Promise.resolve({ok:true,status:200,items:m.name==='LeadGenDeals'?sp:[{s:'a',b:'a normal comment about something else entirely, nothing to see',t:0}],rl:{remaining:80,reset:60}})}}}},[A,spam]);
   await pg.evaluate(()=>localStorage.setItem('nobotty:cfg',JSON.stringify({showStatus:false})));
   await pg.addStyleTag({content:fs.readFileSync(path.join(root,'content.css'),'utf8')});
   await pg.addScriptTag({content:fs.readFileSync(path.join(root,'content.js'),'utf8')});
   await pg.waitForTimeout(3500);
  }
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
 await hp.setContent(`<style>body{margin:0;width:1600px;height:900px;background:#0f1a14;color:#f4f6ef;font:system-ui,-apple-system,sans-serif;position:relative;overflow:hidden}
 h1{position:absolute;left:70px;top:48px;margin:0;font:600 54px/1.05 system-ui;letter-spacing:-.02em}
 p{position:absolute;left:72px;top:122px;margin:0;font:400 24px system-ui;color:#b9c8bd}
   .card{position:absolute;top:200px;width:720px;height:505px;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.45)}
 .card img{width:720px;display:block}
 .l{left:70px}.r{left:810px}
 .tag{position:absolute;top:760px;font:600 22px system-ui;color:#b9c8bd}
 .key{position:absolute;left:810px;top:812px;font:500 22px system-ui;color:#f4f6ef;display:flex;gap:26px;align-items:center}.key i{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:8px;vertical-align:-1px}
 </style><h1>Nobotty</h1><p>See which Reddit accounts to trust. Colour only, nothing else on screen.</p>
 <div class="card l"><img src="${img('before')}"></div><div class="card r"><img src="${img('after')}"></div>
 <div class="tag" style="left:72px">Before</div><div class="tag" style="left:812px">With Nobotty</div>
 <div class="key" style="top:812px"><span><i style="background:#f0646b"></i>low trust</span><span><i style="background:#f3b04e"></i>medium</span><span><i style="background:#4fc08d"></i>good</span></div>`);
 await hp.waitForTimeout(400);
 await hp.screenshot({path:path.join(__dirname,'hero.png')});
 await b.close();})();
