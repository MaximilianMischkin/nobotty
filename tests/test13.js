// Background: logged-out pool first; when it is used up (429 / 0 left) the logged-in pool answers.
const fs=require('fs'),path=require('path'),vm=require('vm');
const src=fs.readFileSync(path.join(__dirname,'..','background.js'),'utf8');
function run(answers){
  const calls=[];let listener;
  const res=(st,rem)=>({ok:st===200,status:st,headers:{get:h=>h==='x-ratelimit-remaining'?String(rem):'300'},json:()=>Promise.resolve({data:{created_utc:1,total_karma:5}})});
  const ctx={browser:{runtime:{onMessage:{addListener:f=>listener=f}}},fetch:(u,o)=>{calls.push(o.credentials);return Promise.resolve(res(...answers[o.credentials]));},Promise,String,parseFloat,isNaN};
  vm.runInNewContext(src,ctx);
  return new Promise(ok=>listener({type:'nobotty-about',name:'someone'},{},r=>ok({r,calls})));
}
(async()=>{
  const a=await run({omit:[200,50],include:[200,90]});
  const b=await run({omit:[429,0],include:[200,90]});
  const c=await run({omit:[200,0],include:[200,40]});
  // c: data came back from the logged-out pool, which is now empty: use it, do not pause, and go logged-in next time
  console.log('anon ok   ->',a.calls.join(','),a.r.ok,a.r.rl.remaining);
  console.log('anon 429  ->',b.calls.join(','),b.r.ok,b.r.rl.remaining);
  console.log('anon 0    ->',c.calls.join(','),c.r.ok,c.r.rl.remaining);
  // after a 429 the next request in the same context goes straight to the logged-in pool
  const ok=a.calls.join()==='omit'&&b.calls.join()==='omit,include'&&b.r.ok&&b.r.rl.remaining===90&&c.calls.join()==='omit'&&c.r.ok&&c.r.rl.remaining===null;
  console.log(ok?'PASS':'FAIL');process.exit(ok?0:1);
})();
