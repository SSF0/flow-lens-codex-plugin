import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function graph(input) {
  if (!input || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) throw new Error('需要 nodes 和 edges 数组');
  if (input.nodes.length > 500 || input.edges.length > 1500) throw new Error('请把大流程拆成子流程');
  const ids = new Set();
  const nodes = input.nodes.map(n => {
    if (typeof n.id !== 'string' || !n.id || ids.has(n.id)) throw new Error('节点 ID 为空或重复');
    ids.add(n.id);
    if (!['start','action','decision','end'].includes(n.data?.kind) || typeof n.data?.label !== 'string') throw new Error('节点需要 label 和合法 kind');
    if (!Number.isFinite(n.position?.x) || !Number.isFinite(n.position?.y)) throw new Error('节点坐标无效');
    const data = {label:n.data.label, kind:n.data.kind, detail:n.data.detail || '', status:n.data.status || 'todo'};
    if (!['todo','active','done','blocked'].includes(data.status)) throw new Error('节点状态无效');
    if (n.data.source) {
      const s=n.data.source;
      if (typeof s.path !== 'string' || !Number.isInteger(s.line) || s.line < 1) throw new Error('代码位置无效');
      data.source={path:s.path,line:s.line};
      if(s.symbol!==undefined){if(typeof s.symbol!=='string')throw new Error('方法名无效');data.source.symbol=s.symbol;}
    }
    return {id:n.id,type:'flow',position:n.position,data};
  });
  const edgeIds=new Set();
  const edges=input.edges.map(e=>{
    if (typeof e.id !== 'string' || edgeIds.has(e.id) || !ids.has(e.source) || !ids.has(e.target)) throw new Error('连线 ID 重复或指向不存在的节点');
    edgeIds.add(e.id);
    return {id:e.id,source:e.source,target:e.target,label:String(e.label || ''),sourceHandle:e.sourceHandle || null,targetHandle:e.targetHandle || null};
  });
  return {nodes,edges};
}
export function diff(before,after) {
  const changes=[];
  for (const type of ['nodes','edges']) {
    const old=new Map(before[type].map(x=>[x.id,x])), next=new Map(after[type].map(x=>[x.id,x]));
    const meaningful=x=>type==='nodes'?{...x.data,status:undefined}:{source:x.source,target:x.target,label:x.label,sourceHandle:x.sourceHandle,targetHandle:x.targetHandle};
    for (const [id,item] of next) {
      if (!old.has(id)) changes.push({type,id,change:'added',after:item});
      else if (JSON.stringify(meaningful(old.get(id)))!==JSON.stringify(meaningful(item))) changes.push({type,id,change:'changed',before:old.get(id),after:item});
    }
    for (const [id,item] of old) if (!next.has(id)) changes.push({type,id,change:'removed',before:item});
  }
  return changes;
}
export function sourceFile(workspace,relative) {
  const root=fs.realpathSync(workspace), file=fs.realpathSync(path.resolve(root,relative));
  if (!file.startsWith(root+path.sep)) throw new Error('代码引用必须在项目目录内');
  if (fs.statSync(file).size > 2_000_000) throw new Error('代码文件过大');
  return file;
}
export function evidence(workspace,g) {
  const files={};
  for (const n of g.nodes) if (n.data.source) {
    const relative=n.data.source.path, file=sourceFile(workspace,relative), bytes=fs.readFileSync(file);
    if (n.data.source.line > bytes.toString().split('\n').length) throw new Error('代码引用行号超出文件范围');
    files[relative]=crypto.createHash('sha256').update(bytes).digest('hex');
  }
  return files;
}
export function stale(record) {
  return Object.entries(record.evidence).filter(([relative,hash])=>{
    try { return crypto.createHash('sha256').update(fs.readFileSync(sourceFile(record.workspace,relative))).digest('hex')!==hash; }
    catch {return true;}
  }).map(([relative])=>relative);
}
export class Store {
  constructor(dir) { this.dir=dir;fs.mkdirSync(dir,{recursive:true,mode:0o700}); }
  file(id) { if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new Error('流程 ID 无效');return path.join(this.dir,id+'.json'); }
  get(id) {
    const r=JSON.parse(fs.readFileSync(this.file(id),'utf8'));
    const canonical=r.threadId&&sessionId(r.threadId);
    if(id.startsWith('session-')&&id!==canonical&&fs.existsSync(this.file(canonical)))return this.get(canonical);
    return r;
  }
  put(r) { const file=this.file(r.id), tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(r,null,2),{mode:0o600});fs.renameSync(tmp,file);return r; }
  list() {return fs.readdirSync(this.dir).filter(x=>x.endsWith('.json')).map(x=>this.get(x.slice(0,-5))).map(({id,title,threadId,workspace,revision})=>({id,title,threadId,workspace,revision}));}
  create({id,title,threadId,workspace,graph:input}) {
    if (fs.existsSync(this.file(id))) throw new Error('流程已经存在，请读取后更新');
    const g=graph(input), root=fs.realpathSync(workspace);
    return this.put({id,title,threadId,workspace:root,revision:1,mode:'view',baseline:g,draft:g,evidence:evidence(root,g),request:null,history:[]});
  }
  session({workspace,threadId,title}) {
    if(typeof threadId!=='string'||!threadId.trim())throw new Error('必须提供真实会话 ID');
    const root=fs.realpathSync(workspace), id=sessionId(threadId);
    let existing=this.forThread(threadId);
    if(existing) {
      if(existing.id!==id){existing={...existing,id,tracking:true};this.put(existing);}
      if(existing.workspace!==root||!existing.tracking)return this.update(id,existing.revision,r=>{r.workspace=root;r.tracking=true;});
      return existing;
    }
    const r=this.create({id,title:title||'当前会话 · 代码逻辑',threadId,workspace:root,graph:{nodes:[],edges:[]}});
    r.tracking=true;r.syncConflicts=[];return this.put(r);
  }
  forThread(threadId) {
    if(typeof threadId!=='string'||!threadId.trim())throw new Error('必须提供会话 ID');
    const id=sessionId(threadId);
    if(fs.existsSync(this.file(id)))return this.get(id);
    // Read legacy workspace-keyed sessions without discarding their draft/history.
    const legacy=this.list().filter(r=>r.threadId===threadId&&r.id.startsWith('session-')).map(r=>this.get(r.id));
    legacy.sort((a,b)=>(b.lastSync?.at||'').localeCompare(a.lastSync?.at||''));
    return legacy[0]||null;
  }
  sync(id,revision,{nodes=[],edges=[],removeNodes=[],removeEdges=[],summary}) {
    if(typeof summary!=='string'||!summary.trim())throw new Error('请说明本次核对的文件和方法');
    return this.update(id,revision,r=>{
      if(!r.tracking)throw new Error('会话流程跟踪已暂停');
      const incoming={nodes,edges}, removals={nodes:new Set(removeNodes),edges:new Set(removeEdges)}, next={nodes:[],edges:[]}, draft={nodes:[],edges:[]}, conflicts=[];
      for(const type of ['nodes','edges']) {
        const old=new Map(r.baseline[type].map(x=>[x.id,x])), edited=new Map(r.draft[type].map(x=>[x.id,x])), updates=new Map(incoming[type].map(x=>[x.id,x]));
        if(updates.size!==incoming[type].length)throw new Error('增量中 ID 重复');
        for(const [key,x] of old)if(!removals[type].has(key))next[type].push(updates.get(key)||x);
        for(const [key,x] of updates)if(!old.has(key))next[type].push(x);
        const latest=new Map(next[type].map(x=>[x.id,x]));
        const same=(a,b)=>JSON.stringify(type==='nodes'?a?.data:a)===JSON.stringify(type==='nodes'?b?.data:b);
        for(const key of new Set([...old.keys(),...edited.keys(),...latest.keys()])) {
          const before=old.get(key), user=edited.get(key), actual=latest.get(key);
          if(same(before,user)) {if(actual)draft[type].push(type==='nodes'&&user?{...actual,position:user.position}:actual);}
          else {if(user)draft[type].push(user);if(!same(before,actual)&&!same(user,actual))conflicts.push({type,id:key});}
        }
      }
      for(const g of [next,draft]){const ids=new Set(g.nodes.map(n=>n.id));g.edges=g.edges.filter(e=>ids.has(e.source)&&ids.has(e.target));}
      const normalized=graph(next), normalizedDraft=graph(draft);
      const touched=new Set(nodes.map(n=>n.id).concat(removeNodes));
      const verified=evidence(r.workspace,normalized);
      for(const [file,hash] of Object.entries(r.evidence)) {
        if(r.baseline.nodes.some(n=>n.data.source?.path===file&&!touched.has(n.id))&&file in verified)verified[file]=hash;
      }
      r.baseline=normalized;r.draft=normalizedDraft;r.evidence=verified;r.syncConflicts=conflicts;
      r.lastSync={at:new Date().toISOString(),summary};
      if(r.request){r.request=null;r.syncNotice='代码逻辑已更新，已保留你的草稿；请核对后重新提交提案。';}
    });
  }
  setMode(id,mode) {
    if(!['view','edit','compare'].includes(mode))throw new Error('模式必须是 view、edit 或 compare');
    // Presentation changes must not invalidate an unsaved graph's revision.
    const r=this.get(id);r.mode=mode;return this.put(r);
  }
  update(id,revision,change) {const r=this.get(id);if(r.revision!==revision) throw Object.assign(new Error('流程已经更新，请刷新后重试；你的修改仍保留在页面'),{status:409});change(r);r.revision++;return this.put(r);}
  save(id,revision,input) {return this.update(id,revision,r=>{r.draft=graph(input);r.request=null;});}
  submit(id,revision) {return this.update(id,revision,r=>{
    const changed=diff(r.baseline,r.draft);if(!changed.length) throw new Error('没有逻辑修改；移动节点只改变布局');
    const outdated=stale(r);if(outdated.length) throw new Error('代码已变化，请让 Codex 重新核对：'+outdated.join(', '));
    r.request={id:crypto.randomUUID(),createdAt:new Date().toISOString(),changes:changed,graph:r.draft,status:'pending'};
  });}
  reconcile(id,revision,input,verification) {return this.update(id,revision,r=>{
    if (!verification?.trim()) throw new Error('需要代码核对和验证说明');
    const g=graph(input);r.history.push({baseline:r.baseline,proposed:r.draft,request:r.request,verification,at:new Date().toISOString()});
    r.history=r.history.slice(-20);r.baseline=g;r.draft=g;r.evidence=evidence(r.workspace,g);r.request=null;
  });}
}
export function sessionId(threadId){return 'session-'+crypto.createHash('sha256').update(threadId).digest('hex').slice(0,24);}
