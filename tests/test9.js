// Dot placement: must pick the round avatar (not a wrapper with the thread line) and sit beside it, not on top of it.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 const b=await chromium.launch();const pg=await b.newPage({viewport:{width:700,height:300},deviceScaleFactor:4});
 const html=`<meta charset="utf-8"><style>body{background:#0e1113;color:#ddd;font:14px system-ui;margin:0;padding:20px 20px 20px 70px}
 shreddit-comment{display:block;position:relative}
 [slot=commentAvatar]{position:absolute;left:0;top:0;width:52px;height:80px}
 .line{position:absolute;left:8px;top:36px;width:2px;height:44px;background:#444}
 faceplate-img{position:absolute;left:10px;top:0;display:block;width:32px;height:32px;border-radius:50%;background:#c084fc}
 [slot=commentMeta]{margin-left:52px;height:32px;line-height:32px}[slot=comment]{margin-left:52px}</style>
 <shreddit-comment author="x1"><div slot="commentAvatar"><div class="line"></div><faceplate-img></faceplate-img></div><div slot="commentMeta">newbie_one</div><div slot="comment">Interested, please contact me</div></shreddit-comment>`;
 await pg.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
 await pg.goto('https://www.reddit.com/r/x/comments/1/');
 await pg.evaluate(()=>{const now=Math.floor(Date.now()/1000);window.chrome={runtime:{id:'t',getManifest:()=>({version:'t'}),sendMessage:m=>m.type==='nobotty-ping'?Promise.resolve({pong:true}):Promise.resolve({ok:true,status:200,data:{data:{created_utc:now-86400,total_karma:1}},items:[],rl:{remaining:90,reset:60}})}}});
 await pg.addStyleTag({content:fs.readFileSync(path.join(__dirname,'..','content.css'),'utf8')});
 await pg.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8')});
 await pg.waitForTimeout(2500);
 const r=await pg.evaluate(()=>{const h=document.querySelector('shreddit-comment'),a=document.querySelector('faceplate-img').getBoundingClientRect(),hr=h.getBoundingClientRect();
   const dx=parseFloat(h.style.getPropertyValue('--nb-dx')),dy=parseFloat(h.style.getPropertyValue('--nb-dy'));
   const dot={left:hr.left+dx,right:hr.left+dx+10,top:hr.top+dy,bottom:hr.top+dy+10};
   const overlap=!(dot.right<=a.left||dot.left>=a.right||dot.bottom<=a.top||dot.top>=a.bottom);
   return {level:h.getAttribute('data-nobotty'),dot,avatar:{left:a.left,right:a.right,top:a.top,bottom:a.bottom},overlap,gap:+(a.left-dot.right).toFixed(1),centred:+((dot.top+5)-(a.top+a.height/2)).toFixed(1)}});
 console.log(JSON.stringify(r));
 await pg.screenshot({path:'test_dot.png',clip:{x:20,y:10,width:260,height:90}});
 await b.close();})();
