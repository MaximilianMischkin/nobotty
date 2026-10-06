// Dot placement: exactly one round dot per comment, directly after that comment's own time ("4d ago (dot)"),
// also for replies and replies to replies; inserting dots must not make evaluate() loop.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 const b=await chromium.launch();const pg=await b.newPage({viewport:{width:900,height:700}});
 const meta=(n,t,edited)=>`<div slot="commentMeta"><a href="/user/${n}/">${n}</a> <span>·</span> <a href="/r/x/comments/abc123/c/${n}/"><faceplate-timeago ts="x"><time>${t}</time></faceplate-timeago></a>${edited?' <span>·</span> <span>Edited <faceplate-timeago><time>10h ago</time></faceplate-timeago></span>':''}</div>`;
 const html=`<meta charset="utf-8"><style>shreddit-comment{display:block;position:relative;padding:6px 0 6px 40px}[slot=commentMeta]{line-height:24px;font:13px system-ui}</style>
 <body style="background:#0e1113;color:#ddd;font:15px system-ui;max-width:700px;margin:20px auto">
 <shreddit-comment author="top_user">${meta('top_user','23h ago',true)}<div slot="comment">top comment that says 4d ago in the text</div>
  <shreddit-comment author="reply_user">${meta('reply_user','12h ago')}<div slot="comment">a reply</div>
   <shreddit-comment author="deep_user">${meta('deep_user','10h ago')}<div slot="comment">a reply to a reply</div></shreddit-comment>
  </shreddit-comment>
 </shreddit-comment></body>`;
 await pg.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
 await pg.goto('https://www.reddit.com/r/x/comments/1/');
 await pg.evaluate(()=>{
  const now=Math.floor(Date.now()/1000),D=86400;
  const A={top_user:{created_utc:now-3000*D,total_karma:40000},reply_user:{created_utc:now-2*D,total_karma:1},deep_user:{created_utc:now-400*D,total_karma:900}};
  window.chrome={runtime:{id:'t',getManifest:()=>({version:'t'}),sendMessage:m=>{
    if(m.type==='nobotty-ping')return Promise.resolve({pong:true});
    if(m.type==='nobotty-about')return Promise.resolve({ok:true,status:200,data:{data:A[m.name]},rl:{remaining:90,reset:60}});
    return Promise.resolve({ok:true,status:200,items:[],rl:{remaining:90,reset:60}});}}};
 });
 await pg.addStyleTag({content:fs.readFileSync(path.join(__dirname,'..','content.css'),'utf8')});
 await pg.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8')});
 await pg.waitForTimeout(3000);
 const r=await pg.evaluate(async()=>{
  let n=0;const ol=console.log;console.log=(...a)=>{if(String(a[0]).includes('[Nobotty]'))n++;ol(...a);};
  await new Promise(res=>setTimeout(res,2500));console.log=ol;
  return [...document.querySelectorAll('shreddit-comment')].map(c=>{
   const dots=[...c.querySelectorAll('.nobotty-dot')].filter(d=>d.closest('shreddit-comment')===c);
   const d=dots[0],rect=d&&d.getBoundingClientRect();
   const metaEl=c.querySelector(':scope > [slot=commentMeta]'),times=metaEl.querySelectorAll('faceplate-timeago');
   const lastTime=times[times.length-1].getBoundingClientRect();
   return {who:c.getAttribute('author'),lv:c.getAttribute('data-nobotty'),dots:dots.length,dotLv:d&&d.getAttribute('data-lv'),
    inMeta:!!(d&&d.closest('[slot=commentMeta]')===metaEl),afterTime:!!(rect&&rect.left>=lastTime.right&&rect.left-lastTime.right<14),
    round:!!(rect&&Math.round(rect.width)===9&&Math.round(rect.height)===9),
    centred:rect?Math.round((rect.top+rect.height/2)-(lastTime.top+lastTime.height/2)):null,evalsWhileIdle:n};
  });
 });
 r.forEach(x=>console.log(JSON.stringify(x)));
 const ok=r.every(x=>x.dots===1&&x.dotLv===x.lv&&x.inMeta&&x.afterTime&&x.round&&Math.abs(x.centred)<=2&&x.evalsWhileIdle<=1);
 await pg.screenshot({path:path.join(__dirname,'..','test_dot.png')});
 console.log(ok?'PASS':'FAIL');
 await b.close();process.exit(ok?0:1);})();
