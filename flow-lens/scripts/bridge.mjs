import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {Store,diff,sourceFile,stale} from './model.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=process.env.FLOW_LENS_DATA || path.join(os.homedir(),'.local/share/flow-lens');
fs.mkdirSync(runtime,{recursive:true,mode:0o700});
const endpoint=path.join(runtime,'endpoint.json');

export async function serve() {
  const store=new Store(path.join(runtime,'flows')), token=crypto.randomBytes(32).toString('hex');
  const server=http.createServer(async(req,res)=>{
    const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try {
      const host=`127.0.0.1:${server.address().port}`, origin=`http://${host}`;
      if (req.headers.host!==host || (req.headers.origin && req.headers.origin!==origin)) return send({error:'Origin rejected'},403);
      const url=new URL(req.url,origin);
      if (url.pathname==='/health') return send({app:'flow-lens',version:1});
      if (url.pathname.startsWith('/api/')) {
        if (req.headers.authorization!==`Bearer ${token}`) return send({error:'请从插件提供的链接打开流程图'},401);
        let body={};
        if(req.method==='POST') {let text='';for await(const chunk of req){text+=chunk;if(text.length>2_000_000) throw new Error('请求过大');}body=JSON.parse(text);}
        const parts=url.pathname.split('/').filter(Boolean), id=parts[2], action=parts[3];
        if(parts[1]!=='flows') return send({error:'Not found'},404);
        if(id==='by-thread' && req.method==='GET') {
          const r=store.forThread(url.searchParams.get('thread'));
          return send(r?{...r,changes:diff(r.baseline,r.draft),stale:stale(r)}:null);
        }
        if(id==='session' && req.method==='POST')return send(store.session(body));
        if(!id && req.method==='GET') return send(store.list());
        if(!id && req.method==='POST') return send(store.create(body));
        const r=store.get(id);
        if(req.method==='GET' && action==='source') {
          const source=url.searchParams.get('path');
          if(![...r.baseline.nodes,...r.draft.nodes].some(n=>n.data.source?.path===source)) throw new Error('该文件未关联到流程节点');
          return send({path:source,text:fs.readFileSync(sourceFile(r.workspace,source),'utf8')});
        }
        if(req.method==='GET') return send({...r,changes:diff(r.baseline,r.draft),stale:stale(r)});
        if(req.method==='POST' && action==='mode') return send(store.setMode(id,body.mode));
        if(req.method==='POST' && action==='draft') return send(store.save(id,body.revision,body.graph));
        if(req.method==='POST' && action==='sync') return send(store.sync(id,body.revision,body));
        if(req.method==='POST' && action==='tracking')return send(store.update(id,body.revision,r=>{if(typeof body.enabled!=='boolean')throw new Error('enabled 必须是布尔值');r.tracking=body.enabled;}));
        if(req.method==='POST' && action==='submit') return send(store.submit(id,body.revision));
        if(req.method==='POST' && action==='reconcile') return send(store.reconcile(id,body.revision,body.graph,body.verification));
        return send({error:'Not found'},404);
      }
      const file=url.pathname==='/'?path.join(root,'dist/index.html'):path.resolve(root,'dist','.'+url.pathname);
      if(!file.startsWith(path.join(root,'dist')+path.sep)) return send({error:'Not found'},404);
      const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
      res.end(fs.readFileSync(file));
    } catch(error) {if(!res.headersSent)send({error:error.message},error.status||400);else res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const info={url:`http://127.0.0.1:${server.address().port}`,token,pid:process.pid};
  fs.writeFileSync(endpoint,JSON.stringify(info),{mode:0o600});
  return {server,info};
}
export async function ensure() {
  try {const info=JSON.parse(fs.readFileSync(endpoint));const r=await fetch(info.url+'/health',{signal:AbortSignal.timeout(1000)});if((await r.json()).app==='flow-lens')return info;} catch{}
  const log=fs.openSync(path.join(runtime,'server.log'),'a',0o600);
  const child=spawn(process.execPath,[path.join(root,'scripts/bridge.mjs'),'serve'],{detached:true,stdio:['ignore',log,log],env:process.env});child.unref();fs.closeSync(log);
  for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,100));try{const info=JSON.parse(fs.readFileSync(endpoint));if(info.pid===child.pid)return info;}catch{}}
  throw new Error('流程服务启动失败，查看 '+path.join(runtime,'server.log'));
}
export async function call(route,body) {
  const info=await ensure();const r=await fetch(info.url+'/api/flows'+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${info.token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;
}
async function main() {
  const [command,...args]=process.argv.slice(2);
  if(command==='serve'){const {info}=await serve();console.error('Flow Lens listening on '+info.url);return;}
  if(command==='url'){const info=await ensure();console.log(info.url+'/?flow='+encodeURIComponent(args[0]||'')+'#token='+info.token);return;}
  if(command==='list'){console.log(JSON.stringify(await call(''),null,2));return;}
  if(command==='read'){console.log(JSON.stringify(await call('/'+args[0]),null,2));return;}
  if(command==='create'){console.log(JSON.stringify(await call('',JSON.parse(fs.readFileSync(args[0],'utf8'))),null,2));return;}
  if(command==='session'){const r=await call('/session',{workspace:args[0]||process.cwd(),threadId:args[1]||process.env.CODEX_THREAD_ID,title:args[2]});const info=await ensure();console.log(JSON.stringify({...r,url:info.url+'/?thread='+encodeURIComponent(r.threadId)+'&surface=codex#token='+info.token},null,2));return;}
  if(command==='mode'){const r=await call('/'+args[0]+'/mode',{mode:args[1]});console.log(JSON.stringify({id:r.id,mode:r.mode,revision:r.revision}));return;}
  if(command==='sync'){console.log(JSON.stringify(await call('/'+args[0]+'/sync',JSON.parse(fs.readFileSync(args[1],'utf8'))),null,2));return;}
  if(command==='reconcile'){console.log(JSON.stringify(await call('/'+args[0]+'/reconcile',JSON.parse(fs.readFileSync(args[1],'utf8'))),null,2));return;}
  throw new Error('用法: bridge.mjs serve | url [flow-id] | list | read <id> | create <json-file> | reconcile <id> <json-file>');
}
if(process.argv[1] && path.basename(fileURLToPath(import.meta.url))==='bridge.mjs' && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
