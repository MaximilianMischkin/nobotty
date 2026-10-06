// Speed + rate-limit behaviour: 40 accounts with 80 ms latency must finish quickly; low rate-limit headers must slow it down.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
async function run(label,slowAfter){
 const b=await chromium.launch();const pg=await b.newPage({viewport:{width:900,height:900}});
 let html='<meta charset="utf-8"><body>';for(let i=0;i<40;i++)html+=`<shreddit-comment author="user${i}"><div slot="comment">comment number ${i} with some ordinary text in it</div></shreddit-comment>`;html+='</body>';
 await pg.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
 await pg.goto('https://www.reddit.com/r/x/comments/1/');
 await pg.evaluate(sa=>{const now=Math.floor(Date.now()/1000);let n=0;window.__calls=[];window.chrome={runtime:{id:'t',getManifest:()=>({version:'t'}),sendMessage:msg=>{if(msg.type==='nobotty-ping')return Promise.resolve({pong:true});n++;window.__calls.push(performance.now());const rl=sa&&n>sa?{remaining:1,reset:3}:{remaining:90,reset:60};return new Promise(res=>setTimeout(()=>res({ok:true,status:200,data:{data:{created_utc:now-86400*400,total_karma:5000}},rl}),80))}}}},slowAfter);
 await pg.addStyleTag({content:fs.readFileSync(path.join(__dirname,'..','content.css'),'utf8')});
 const t0=Date.now();
 await pg.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8')});
 await pg.waitForFunction(()=>window.__calls&&window.__calls.length>=40,null,{timeout:60000,polling:100}).catch(()=>{});
 await pg.waitForTimeout(600);
 const chip=await pg.evaluate(()=>{const c=[...document.querySelectorAll('div')].find(d=>d.textContent.startsWith('Nobotty')&&d.style.position==='fixed');return c?c.textContent:'NO CHIP'});
 console.log(label.padEnd(18),((Date.now()-t0)/1000).toFixed(1)+'s ','=>',chip);
 await b.close();}
(async()=>{ await run('normal limits',0); await run('limit hits low',34); })();
