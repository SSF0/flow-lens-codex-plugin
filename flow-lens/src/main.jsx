import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {ReactFlow,Background,MiniMap,Handle,Position,applyNodeChanges,applyEdgeChanges,addEdge,reconnectEdge,MarkerType} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './style.css';

const token=new URLSearchParams(location.hash.slice(1)).get('token')||sessionStorage.getItem('flow-token');
if(token)sessionStorage.setItem('flow-token',token);
history.replaceState(null,'',location.pathname+location.search);
async function api(route='',body){const res=await fetch('/api/flows'+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await res.json();if(!res.ok)throw new Error(data.error);return data;}
const names={start:'入口',action:'处理',decision:'条件分支',end:'结束'};
const statusNames={todo:'待处理',active:'进行中',done:'已完成',blocked:'待解决'};
const changeNames={added:'新增',changed:'修改',removed:'删除'};
const debugTheme=new URLSearchParams(location.search).get('theme');
const systemTheme=()=>matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
const normalizeTheme=value=>value==='dark'?'dark':value==='light'?'light':null;
function useCodexTheme(){
  const pick=()=>normalizeTheme(debugTheme)||normalizeTheme(window.openai?.theme)||systemTheme();
  const [theme,setTheme]=useState(pick);
  useEffect(()=>{
    const media=matchMedia('(prefers-color-scheme: dark)');
    const apply=value=>setTheme(normalizeTheme(debugTheme)||normalizeTheme(value)||systemTheme());
    const host=e=>apply(e.detail?.globals?.theme);
    const system=()=>{if(!normalizeTheme(debugTheme)&&!normalizeTheme(window.openai?.theme))apply();};
    addEventListener('openai:set_globals',host);media.addEventListener('change',system);
    return()=>{removeEventListener('openai:set_globals',host);media.removeEventListener('change',system);};
  },[]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;},[theme]);
  return theme;
}
const themeColors={dark:{edge:'#737373',edgeSelected:'#f5f5f5',edgeLabel:'#e5e5e5',edgeLabelBg:'#171717',grid:'#303030',minimapNode:'#737373',minimapDecision:'#a3a3a3',minimapMask:'#0d0d0dcc',success:'#72c490',danger:'#f08b98'},light:{edge:'#a3a3a3',edgeSelected:'#171717',edgeLabel:'#404040',edgeLabelBg:'#ffffff',grid:'#e5e5e5',minimapNode:'#a3a3a3',minimapDecision:'#737373',minimapMask:'#fafafacc',success:'#237a48',danger:'#b42335'}};
function FlowNode({data,selected}){return <div className={`flow-node ${data.kind} ${selected?'selected':''} ${data.change||''}`}>
  <Handle type="target" position={Position.Top}/><div className="node-meta"><span>{data.kind==='decision'?'◇':'○'} {names[data.kind]}</span><span className={'status '+data.status}>{statusNames[data.status]}</span></div>
  <strong>{data.label}</strong>{data.detail&&<p>{data.detail}</p>}{data.source&&<code>{data.source.symbol&&<span className="method-name">ƒ {data.source.symbol}<br/></span>}{data.source.path.split('/').pop()}:{data.source.line}</code>}
  {data.change&&<span className="change-tag">{changeNames[data.change]}</span>}
  <Handle type="source" position={Position.Bottom}/>
</div>;}
const nodeTypes={flow:FlowNode};
const clean=g=>({nodes:g.nodes.map(({id,type,position,data})=>({id,type,position,data:Object.fromEntries(Object.entries(data).filter(([k])=>k!=='change'))})),edges:g.edges.map(({id,source,target,label,sourceHandle,targetHandle})=>({id,source,target,label,sourceHandle:sourceHandle||null,targetHandle:targetHandle||null}))});
function changes(before,after){const list=[];for(const type of ['nodes','edges']){const old=new Map(before[type].map(x=>[x.id,x])),next=new Map(after[type].map(x=>[x.id,x]));const value=x=>type==='nodes'?{...x.data,status:undefined}:{source:x.source,target:x.target,label:x.label,sourceHandle:x.sourceHandle||null,targetHandle:x.targetHandle||null};for(const [id,x]of next){if(!old.has(id))list.push({type,id,change:'added',after:x});else if(JSON.stringify(value(old.get(id)))!==JSON.stringify(value(x)))list.push({type,id,change:'changed',before:old.get(id),after:x});}for(const[id,x]of old)if(!next.has(id))list.push({type,id,change:'removed',before:x});}return list;}
function App(){
  const codexSurface=new URLSearchParams(location.search).get('surface')==='codex'||!!window.openai;
  const theme=useCodexTheme(),colors=themeColors[theme];
  const [record,setRecord]=useState(null),[draft,setDraft]=useState({nodes:[],edges:[]}),[mode,setMode]=useState('view'),[selection,setSelection]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[code,setCode]=useState(null),[showChanges,setShowChanges]=useState(false),[undo,setUndo]=useState([]),[redo,setRedo]=useState([]),[handoff,setHandoff]=useState('');
  const view=mode==='view'?'baseline':mode==='edit'?'draft':'compare';
  const canvas=useRef(null),live=useRef(null);live.current={record,draft,dirty,busy,mode};
  const inspected=mode==='view'&&record?record.baseline:draft;
  const selectedNode=inspected.nodes.find(n=>selection?.type==='node'&&n.id===selection.id),selectedEdge=inspected.edges.find(e=>selection?.type==='edge'&&e.id===selection.id);
  const sources=[...new Map(draft.nodes.filter(n=>n.data.source).map(n=>[n.data.source.path+'#'+(n.data.source.symbol||n.id),n])).values()];
  const edits=record?changes(record.baseline,clean(draft)):[];
  async function loadBoundFlow(){
    try{
      const params=new URLSearchParams(location.search),thread=params.get('thread'),flow=params.get('flow');
      if(!thread&&!flow)return;
      const r=await api(thread?'/by-thread?thread='+encodeURIComponent(thread):'/'+encodeURIComponent(flow));
      if(r&&thread&&r.threadId!==thread)throw new Error('会话与流程不匹配');
      setRecord(r);setMode(r?.mode||'view');setDraft(r?.draft||{nodes:[],edges:[]});setDirty(false);setUndo([]);setRedo([]);setSelection(null);setCode(null);setError('');
      setTimeout(()=>canvas.current?.fitView({padding:.25}),100);
    }catch(e){setError(e.message);}
  }
  useEffect(()=>{loadBoundFlow();},[]);
  useEffect(()=>{const timer=setInterval(async()=>{const s=live.current;if(s.busy)return;try{
    const params=new URLSearchParams(location.search),thread=params.get('thread'),flow=params.get('flow');
    if(!s.record&&!thread&&!flow)return;
    const r=await api(s.record?'/'+s.record.id:thread?'/by-thread?thread='+encodeURIComponent(thread):'/'+encodeURIComponent(flow));
    const current=live.current;if(!r||current.busy||(current.record&&current.record.id!==r.id))return;
    setMode(r.mode||'view');
    if(current.dirty){setRecord(previous=>({...previous,mode:r.mode}));return;}
    setRecord(r);if(r.revision!==current.record?.revision){setDraft(r.draft);setUndo([]);setRedo([]);}
  }catch(e){setError(e.message);}},2500);return()=>clearInterval(timer);},[]);
  useEffect(()=>{setSelection(null);setCode(null);setShowChanges(false);},[mode]);
  useEffect(()=>{if(!record?.request){setHandoff('');return;}setHandoff(`请使用 flow-lens 处理流程 ${record.id} 的已提交提案（会话 ${record.threadId}）。先读取最新流程和代码，核对分支变化，再修改相关代码并验证；最后更新流程图。提案 ID：${record.request.id}。`);},[record?.request?.id]);
  useEffect(()=>{const listener=e=>{if(live.current.dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener);},[]);
  useEffect(()=>{if(!document.modelContext?.registerTool)return;const registrations=[{name:'flow_lens_read_canvas',description:'Read the current Flow Lens diagram, unsaved edits and submitted change request.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:async()=>{const s=live.current;return {...s.record,visibleDraft:clean(s.draft),unsaved:s.dirty};}}];for(const tool of registrations)document.modelContext.registerTool(tool);return()=>{for(const t of registrations)document.modelContext.unregisterTool?.(t.name);};},[]);
  function checkpoint(){setUndo(h=>[...h.slice(-49),clean(draft)]);setRedo([]);}
  function edit(fn){if(mode!=='edit'||busy)return;checkpoint();setDraft(fn(draft));setDirty(true);setNotice('');setHandoff('');}
  function travel(back){const from=back?undo:redo;if(!from.length)return;const target=from.at(-1);if(back){setUndo(from.slice(0,-1));setRedo(h=>[...h,clean(draft)]);}else{setRedo(from.slice(0,-1));setUndo(h=>[...h,clean(draft)]);}setDraft(target);setDirty(true);}
  async function save(){const r=await api('/'+record.id+'/draft',{revision:record.revision,graph:clean(draft)});setRecord(r);setDirty(false);setNotice('草稿已保存');return r;}
  async function action(fn){setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function submit(){let r=dirty?await save():record;r=await api('/'+r.id+'/submit',{revision:r.revision});setRecord(r);const text=`请使用 flow-lens 处理流程 ${r.id} 的已提交提案（会话 ${r.threadId}）。先读取最新流程和代码，核对分支变化，再修改相关代码并验证；最后更新流程图。提案 ID：${r.request.id}。`;setHandoff(text);setNotice('提案已保存。把下方指令发送到当前会话即可继续。');}
  function updateNode(key,value){edit(g=>({...g,nodes:g.nodes.map(n=>n.id===selectedNode.id?{...n,data:{...n.data,[key]:value}}:n)}));}
  function remove(){edit(g=>selection.type==='node'?{nodes:g.nodes.filter(n=>n.id!==selection.id),edges:g.edges.filter(e=>e.source!==selection.id&&e.target!==selection.id)}:{...g,edges:g.edges.filter(e=>e.id!==selection.id)});setSelection(null);setCode(null);}
  function add(kind,position){const id=crypto.randomUUID();edit(g=>({...g,nodes:[...g.nodes,{id,type:'flow',position:position||canvas.current?.screenToFlowPosition({x:window.innerWidth*.4,y:window.innerHeight*.45})||{x:200,y:100},data:{kind,label:kind==='decision'?'新的判断条件':'新的'+names[kind],detail:'',status:'todo'}}]}));setSelection({type:'node',id});}
  async function showSource(n){const result=await api('/'+record.id+'/source?path='+encodeURIComponent(n.data.source.path));setCode({...result,line:n.data.source.line});setTimeout(()=>document.querySelector('.code-line.current')?.scrollIntoView({block:'center'}),50);}
  let displayed=view==='baseline'&&record?{...record.baseline,nodes:record.baseline.nodes.map(n=>({...n,position:draft.nodes.find(d=>d.id===n.id)?.position||n.position}))}:draft;
  if(view==='compare'&&record){const keys=new Map(edits.map(e=>[e.type+e.id,e.change]));displayed={nodes:[...draft.nodes,...edits.filter(e=>e.type==='nodes'&&e.change==='removed').map(e=>e.before)].map(n=>({...n,data:{...n.data,change:keys.get('nodes'+n.id)}})),edges:[...draft.edges,...edits.filter(e=>e.type==='edges'&&e.change==='removed').map(e=>e.before)].map(e=>({...e,style:{stroke:keys.get('edges'+e.id)==='removed'?colors.danger:keys.has('edges'+e.id)?colors.success:colors.edge,strokeDasharray:keys.get('edges'+e.id)==='removed'?'6 4':undefined}}))};}
  const readOnly=view!=='draft';
  return <div className={`app mode-${mode} ${codexSurface?'codex-surface':'browser-surface'}`}>  {error&&<div className="banner error" role="alert">{error} <button onClick={()=>setError('')}>关闭</button></div>}{record?.stale?.length>0&&<div className="banner error">关联代码已变化：{record.stale.join('、')}。请让 Codex 重新核对流程。</div>}{record?.syncConflicts?.length>0&&<div className="banner error">代码与草稿有 {record.syncConflicts.length} 项冲突，已保留你的编辑，请让 Codex 核对。</div>}{record?.syncNotice&&<div className="banner">{record.syncNotice}</div>}{notice&&<div className="banner" role="status">{notice}</div>}
  {mode==='edit'&&<nav><div className="edit-state"><span className="toolbar-label">编辑流程</span><span className={'save-state '+(dirty?'unsaved':'')}>{dirty?'● 未保存修改':'● 已同步'}</span></div><div className="nav-actions"><button aria-label="撤销" disabled={!undo.length||busy} onClick={()=>travel(true)}>↶</button><button aria-label="重做" disabled={!redo.length||busy} onClick={()=>travel(false)}>↷</button><button onClick={()=>setShowChanges(!showChanges)}>变更 <span className="count">{edits.length}</span></button><button disabled={!dirty||busy} onClick={()=>action(save)}>保存</button><button className="primary" disabled={!edits.length||busy} onClick={()=>action(submit)}>提交提案</button></div></nav>}
  {mode==='compare'&&<nav><span>绿色：新增 / 修改 · 红色虚线：删除</span><button onClick={()=>setShowChanges(!showChanges)}>查看 {edits.length} 项变更</button></nav>}
  <main><div className="canvas" onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move';}} onDrop={e=>{e.preventDefault();const kind=e.dataTransfer.getData('flow/kind');if(!readOnly&&names[kind])add(kind,canvas.current.screenToFlowPosition({x:e.clientX,y:e.clientY}));}}>
  {record&&<>{mode==='edit'&&<div className="palette"><span>添加节点</span>{Object.entries(names).map(([kind,name])=><button key={kind} disabled={readOnly||busy} draggable={!readOnly&&!busy} onDragStart={e=>e.dataTransfer.setData('flow/kind',kind)} onClick={()=>add(kind)}>{kind==='decision'?'◇':'＋'} {name}</button>)}</div>}
  <ReactFlow nodes={displayed.nodes.map(n=>({...n,selected:selection?.type==='node'&&selection.id===n.id}))} edges={displayed.edges.map(e=>({...e,selected:selection?.type==='edge'&&selection.id===e.id,type:'smoothstep',markerEnd:{type:MarkerType.ArrowClosed,color:e.style?.stroke||colors.edge},labelStyle:{fill:colors.edgeLabel,fontSize:12},labelBgStyle:{fill:colors.edgeLabelBg},labelBgPadding:[9,5]}))} nodeTypes={nodeTypes} proOptions={{hideAttribution:true}} onInit={r=>{canvas.current=r;}} fitView fitViewOptions={{padding:.3}} minZoom={.15} maxZoom={2} nodesDraggable={!readOnly&&!busy} nodesConnectable={!readOnly&&!busy} edgesReconnectable={!readOnly&&!busy} deleteKeyCode={null}
  onNodesChange={c=>{if(readOnly||busy)return;const actual=c.filter(x=>x.type==='position');if(actual.length){setDraft(g=>({...g,nodes:applyNodeChanges(actual,g.nodes)}));setDirty(true);}}} onNodeDragStart={checkpoint} onEdgesChange={c=>{if(!readOnly&&!busy)setDraft(g=>({...g,edges:applyEdgeChanges(c.filter(x=>x.type==='select'),g.edges)}));}}
  onConnect={c=>edit(g=>({...g,edges:addEdge({...c,id:crypto.randomUUID(),label:'分支条件'},g.edges)}))} onReconnect={(old,c)=>edit(g=>({...g,edges:reconnectEdge(old,c,g.edges,{shouldReplaceId:false})}))} onNodeClick={(_,n)=>{setSelection({type:'node',id:n.id});setCode(null);}} onEdgeClick={(_,e)=>{setSelection({type:'edge',id:e.id});setCode(null);}} onPaneClick={()=>{setSelection(null);setCode(null);}}><Background color={colors.grid} gap={22} size={1}/>{mode==='edit'&&<MiniMap nodeColor={n=>n.data.kind==='decision'?colors.minimapDecision:colors.minimapNode} maskColor={colors.minimapMask} pannable zoomable/>}</ReactFlow></>}
  {(!record||!draft.nodes.length)&&<div className="empty"><span>◇</span><h2>每个分支，都有迹可循</h2><p>{record?'当前会话已就绪。继续描述任务，Codex 会把涉及的文件、方法和分支加到这里。':'在这个会话里创建流程图后会显示在这里。'}</p></div>}
  </div>
  {(selection||(mode!=='view'&&showChanges)||(mode==='edit'&&handoff))&&<aside><button className="close-inspector" aria-label="关闭详情" onClick={()=>{setSelection(null);setShowChanges(false);setHandoff('');setCode(null);}}>×</button>
  {mode==='edit'&&handoff&&<section className="inspector"><span className="eyebrow">继续当前会话</span><h2>修改提案已就绪</h2><p>复制这段指令，发送到左侧会话。Codex 会读取已保存的具体分支变化。</p><textarea aria-label="会话指令" readOnly value={handoff}/><button className="primary" onClick={()=>action(async()=>{await navigator.clipboard.writeText(handoff);setNotice('指令已复制，请粘贴到当前会话');})}>复制会话指令</button></section>}
  {selection&&mode==='edit'&&<section className="inspector"><span className="eyebrow">{selection.type==='node'?'节点详情':'分支详情'}</span>
    {selectedNode&&<><h2>{selectedNode.data.label}</h2><label>节点名称<input disabled={readOnly||busy} value={selectedNode.data.label} onChange={e=>updateNode('label',e.target.value)}/></label><label>节点类型<select disabled={readOnly||busy} value={selectedNode.data.kind} onChange={e=>updateNode('kind',e.target.value)}>{Object.entries(names).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>逻辑说明<textarea disabled={readOnly||busy} value={selectedNode.data.detail} onChange={e=>updateNode('detail',e.target.value)}/></label><label>任务状态<select disabled={readOnly||busy} value={selectedNode.data.status} onChange={e=>updateNode('status',e.target.value)}>{Object.entries(statusNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>关联代码路径<input disabled={readOnly||busy} placeholder="相对项目路径，例如 src/auth.ts" value={selectedNode.data.source?.path||''} onChange={e=>updateNode('source',e.target.value?{...selectedNode.data.source,path:e.target.value,line:selectedNode.data.source?.line||1}:undefined)}/></label>{selectedNode.data.source&&<><label>方法 / 函数<input disabled={readOnly||busy} value={selectedNode.data.source.symbol||''} onChange={e=>updateNode('source',{...selectedNode.data.source,symbol:e.target.value})}/></label><label>代码行号<input type="number" min="1" disabled={readOnly||busy} value={selectedNode.data.source.line} onChange={e=>updateNode('source',{...selectedNode.data.source,line:Number(e.target.value)})}/></label><button onClick={()=>action(async()=>{if(dirty)await save();await showSource(selectedNode);})}>查看代码 ↗</button></>}</>}
    {selectedEdge&&<><h2>编辑分支</h2><label>触发条件<input disabled={readOnly||busy} value={selectedEdge.label||''} onChange={e=>edit(g=>({...g,edges:g.edges.map(x=>x.id===selectedEdge.id?{...x,label:e.target.value}:x)}))}/></label>{['source','target'].map(key=><label key={key}>{key==='source'?'从节点':'到节点'}<select disabled={readOnly||busy} value={selectedEdge[key]} onChange={e=>edit(g=>({...g,edges:g.edges.map(x=>x.id===selectedEdge.id?{...x,[key]:e.target.value}:x)}))}>{draft.nodes.map(n=><option key={n.id} value={n.id}>{n.data.label}</option>)}</select></label>)}</>}
    {(selectedNode||selectedEdge)&&<button className="danger" disabled={readOnly||busy} onClick={remove}>删除{selectedNode?'节点及其连线':'连线'}</button>}
  </section>}
  {selection&&mode!=='edit'&&<section className="inspector read-details">
    {selectedNode&&<><span className="eyebrow">{names[selectedNode.data.kind]}</span><h2>{selectedNode.data.label}</h2><p>{selectedNode.data.detail||'暂无补充说明'}</p>{selectedNode.data.source&&<><code>{selectedNode.data.source.symbol||selectedNode.data.source.path}</code><button onClick={()=>action(()=>showSource(selectedNode))}>查看关联代码</button></>}</>}
    {selectedEdge&&<><span className="eyebrow">分支条件</span><h2>{selectedEdge.label||'继续执行'}</h2><p>{inspected.nodes.find(n=>n.id===selectedEdge.source)?.data.label} → {inspected.nodes.find(n=>n.id===selectedEdge.target)?.data.label}</p></>}
  </section>}
  {code&&<section className="code-view"><h3>{code.path}:{code.line}</h3><pre>{code.text.split('\n').map((line,i)=><div key={i} className={'code-line '+(i+1===code.line?'current':'')}><span>{i+1}</span>{line||' '}</div>)}</pre></section>}
  {mode!=='view'&&showChanges&&<section className="inspector"><span className="eyebrow">逻辑变更</span><h2>{edits.length} 项待核对</h2>{!edits.length&&<p>尚无逻辑变化。布局调整不会计入。</p>}{edits.map(e=><div className="diff-item" key={e.type+e.id}><b>{changeNames[e.change]} · {e.type==='nodes'?'节点':'分支'}</b>{e.before&&<p className="old">− {e.before.data?.label||e.before.label||e.before.id}</p>}{e.after&&<p>＋ {e.after.data?.label||e.after.label||e.after.id}</p>}{e.type==='edges'&&<small>{e.before&&`${e.before.source} → ${e.before.target}`}{e.before&&e.after?' ⇒ ':''}{e.after&&`${e.after.source} → ${e.after.target}`}</small>}</div>)}</section>}
  </aside>}
  </main>{mode!=='view'&&<footer><span><i/> 本地流程 · {record?.request?'提案待处理':'会话关联'}</span><span>{draft.nodes.length} 节点 · {draft.edges.length} 分支</span><span>FLOW LENS / 01</span></footer>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
