// Bulk lookup: 120 commenters in one thread cost 1 thread request + 2 account-data requests, no per-account lookups.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 const b=await chromium.launch();const pg=await b.newPage({viewport:{width:900,height:600}});
 const names=[];for(let i=0;i<120;i++)names.push('user_'+i);
 let html='<meta charset="utf-8"><style>shreddit-comment{display:block;padding:4px 12px}</style><body style="background:#1a1a1b;color:#ddd;font:15px system-ui;max-width:600px;margin:20px auto">';
 names.forEach(n=>html+=`<shreddit-comment author="${n}"><div slot="comment">comment from ${n} about the thread</div></shreddit-comment>`);
 html+='<shreddit-comment author="user_0"><shreddit-comment author="nested_reply"><div slot="comment">a reply to a reply</div></shreddit-comment></shreddit-comment>';
 html+='</body>';
 await pg.route('https://www.reddit.com/**',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
 await pg.goto('https://www.reddit.com/r/x/comments/abc123/some_title/');
 await pg.evaluate(names=>{
  const now=Math.floor(Date.now()/1000),D=86400;window.__log=[];
  const all=names.concat(['nested_reply']);
  const c=(n,i,replies)=>({kind:'t1',data:{author:n,author_fullname:'t2_'+i.toString(36),replies:replies||''}});
  const top=all.slice(0,120).map((n,i)=>c(n,i));
  top[0].data.replies={kind:'Listing',data:{children:[c('nested_reply',500)]}};
  top.push({kind:'t1',data:{author:'[deleted]',replies:''}});
  const thread=[{kind:'Listing',data:{children:[{kind:'t3',data:{author:'op'}}]}},{kind:'Listing',data:{children:top}}];
  const byId={};all.forEach((n,i)=>byId['t2_'+(n==='nested_reply'?500:i).toString(36)]=n);
  window.chrome={runtime:{id:'t',getManifest:()=>({version:'t'}),sendMessage:m=>{
    if(m.type==='nobotty-ping')return Promise.resolve({pong:true});
    window.__log.push(m.type+':'+(m.path?m.path.split('?')[0]:m.name));
    if(m.type==='nobotty-get'&&m.path.startsWith('/comments/'))return Promise.resolve({ok:true,status:200,data:thread,rl:{remaining:95,reset:300}});
    if(m.type==='nobotty-get'){const ids=m.path.split('ids=')[1].split(','),d={};
      ids.forEach(id=>{const n=byId[id];d[id]={name:n,created_utc:n==='nested_reply'?now-2*D:now-900*D,link_karma:n==='nested_reply'?1:5000,comment_karma:n==='nested_reply'?0:5000};});
      return Promise.resolve({ok:true,status:200,data:d,rl:{remaining:94,reset:300}});}
    return Promise.resolve({ok:true,status:200,data:{data:{created_utc:now-900*D,total_karma:9000}},rl:{remaining:90,reset:300}});}}};
 },names);
 await pg.addStyleTag({content:fs.readFileSync(path.join(__dirname,'..','content.css'),'utf8')});
 await pg.addScriptTag({content:fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8')});
 await pg.waitForTimeout(4000);
 const log=await pg.evaluate(()=>window.__log.filter(x=>x!=='nobotty-ping:undefined'));
 const r=await pg.evaluate(()=>({
  marked:document.querySelectorAll('[data-nobotty]').length,
  nested:document.querySelector('shreddit-comment[author="nested_reply"]').getAttribute('data-nobotty'),
  chip:(document.querySelector('[title^="Nobotty"]')||{}).textContent}));
 const counts={};log.forEach(x=>counts[x]=(counts[x]||0)+1);
 console.log('requests ->',JSON.stringify(counts));
 console.log('result   ->',JSON.stringify(r));
 const ok=counts['nobotty-get:/comments/abc123.json']===1&&counts['nobotty-get:/api/user_data_by_account_ids.json']===2&&!Object.keys(counts).some(k=>k.startsWith('nobotty-about'))&&r.marked===122&&r.nested==='low';
 console.log(ok?'PASS':'FAIL');
 await b.close();process.exit(ok?0:1);})();
