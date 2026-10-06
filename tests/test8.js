// Trust stripes + history scan: bot-like history upgrades a medium account to low; clean old accounts get green and cost no history request.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 const b=await chromium.launch();const pg=await b.newPage({viewport:{width:900,height:600}});
 const names=['spammer','newbie','oldhand','normalmid'];
 let html='<meta charset="utf-8"><style>shreddit-comment{display:block;padding:8px 12px;margin:4px 0}</style><body style="background:#1a1a1b;color:#ddd;font:15px system-ui;max-width:600px;margin:20px auto">';
 names.forEach(n=>html+=`<shreddit-comment author="${n}"><div slot="comment">comment from ${n}, a perfectly ordinary looking sentence about the thread</div></shreddit-comment>`);
 html+='</body>';
 await pg.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
 await pg.goto('https://www.reddit.com/r/x/comments/1/');
 await pg.evaluate(()=>{
  const now=Math.floor(Date.now()/1000),D=86400;window.__log=[];
  const A={spammer:{created_utc:now-20*D,total_karma:120},newbie:{created_utc:now-3*D,total_karma:4},oldhand:{created_utc:now-3000*D,total_karma:40000},normalmid:{created_utc:now-400*D,total_karma:900}};
  const spamItems=[];for(let i=0;i<20;i++)spamItems.push({s:'sub'+(i%14),b:'check this out https://bit.ly/abc'+i%2+' amazing deal for you friends',t:now-i*30});
  window.chrome={runtime:{id:'t',getManifest:()=>({version:'t'}),sendMessage:m=>{
    if(m.type==='nobotty-ping')return Promise.resolve({pong:true});
    window.__log.push(m.type+':'+m.name);
    if(m.type==='nobotty-about')return Promise.resolve({ok:true,status:200,data:{data:A[m.name]},rl:{remaining:90,reset:60}});
    return Promise.resolve({ok:true,status:200,items:m.name==='spammer'?spamItems:[{s:'a',b:'just a normal comment about gardening tips and soil',t:now-100}],rl:{remaining:80,reset:60}});}}};
 });
 await pg.addStyleTag({content:fs.readFileSync(path.join(__dirname,'..','content.css'),'utf8')});
 await pg.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8')});
 await pg.waitForTimeout(5000);
 console.log('stripes ->',await pg.evaluate(()=>[...document.querySelectorAll('shreddit-comment')].map(e=>e.getAttribute('author')+'='+(e.getAttribute('data-nobotty')||'none')).join(', ')));
 console.log('requests->',await pg.evaluate(()=>window.__log.join(' ')));
 await pg.screenshot({path:'test_stripes.png'});
 await b.close();})();
