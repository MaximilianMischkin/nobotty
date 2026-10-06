// Extension path: content script asks the background for account info; background validates names and returns errors cleanly.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),vm=require('vm');
(async()=>{
 // 1) background.js unit test with a fake API and fetch
 let handler=null; const calls=[];
 const sandbox={browser:undefined,chrome:{runtime:{onMessage:{addListener:fn=>handler=fn}}},
   fetch:(u,o)=>{calls.push(u);if(u.includes('/user/blocked/'))return Promise.resolve({ok:false,status:403});if(u.includes('/user/boom/'))return Promise.reject(new Error('NetworkError'));return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({data:{created_utc:1,total_karma:5}})})},
   encodeURIComponent,String,Promise};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','background.js'),'utf8'),sandbox);
 const ask=name=>new Promise(res=>{const r=handler({type:'nobotty-about',name},{},res);if(r!==true)res('no-async')});
 console.log('good   ->',JSON.stringify(await ask('someone')));
 console.log('403    ->',JSON.stringify(await ask('blocked')));
 console.log('net    ->',JSON.stringify(await ask('boom')));
 console.log('badname->',JSON.stringify(await ask('../etc/passwd')),'| fetch calls:',calls.length);
 // 2) content script uses chrome.runtime.sendMessage
 const b=await chromium.launch();const pg=await b.newPage();
 const now=Math.floor(Date.now()/1000),D=86400;
 await pg.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<body><shreddit-comment author="freshbot"><div slot="comment">hello there friend, this is a normal comment of some length</div></shreddit-comment><shreddit-comment author="oldhand"><div slot="comment">another perfectly normal comment from someone with history</div></shreddit-comment></body>'}));
 await pg.goto('https://www.reddit.com/r/x/comments/1/');
 await pg.addInitScript(()=>{});
 await pg.evaluate(a=>{window.chrome={runtime:{id:'test',sendMessage:m=>Promise.resolve({ok:true,status:200,data:{data:a[m.name]}})}}},{freshbot:{created_utc:now-2*D,total_karma:3},oldhand:{created_utc:now-3000*D,total_karma:40000}});
 await pg.addStyleTag({content:fs.readFileSync(path.join(__dirname,'..','content.css'),'utf8')});
 await pg.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8')});
 await pg.waitForTimeout(4500);
 console.log('chip   ->',await pg.evaluate(()=>{const c=[...document.querySelectorAll('div')].find(d=>d.textContent.startsWith('Nobotty:')&&d.style.position==='fixed');return c?c.textContent:'NO CHIP'}));
 console.log('flags  ->',await pg.evaluate(()=>[...document.querySelectorAll('shreddit-comment')].map(e=>e.getAttribute('author')+'='+(e.getAttribute('data-nobotty')||'none')).join(', ')));
 await b.close();})();
