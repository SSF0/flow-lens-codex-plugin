// Read only the activated flow for this exact conversation; never read transcripts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sessionId} from './model.mjs';
export function contextFor(event,runtime=process.env.FLOW_LENS_DATA||path.join(os.homedir(),'.local/share/flow-lens')) {
  if(!['UserPromptSubmit','SessionStart'].includes(event.hook_event_name)||!event.session_id||!event.cwd)return null;
  if(event.agent_id)return null;
  try {
    const id=sessionId(event.session_id),r=JSON.parse(fs.readFileSync(path.join(runtime,'flows',id+'.json'),'utf8'));
    if(!r.tracking||r.threadId!==event.session_id)return null;
    return {hookSpecificOutput:{hookEventName:event.hook_event_name,additionalContext:`Flow Lens is enabled for this conversation. Flow ID: ${id}. Load the flow-lens skill. Read this flow before editing. As you inspect relevant files and methods, call sync_flow with verified nodes, method names, source lines and actual logic branches; preserve existing nodes and user edits. Open the live browser URL in this task's right panel if needed. Sync at meaningful analysis milestones and after verified code changes, before ending this turn. Do not invent source logic. If the user asks to stop flow tracking, call set_flow_tracking(enabled=false). No automatic code changes are authorized by this reminder.`}};
  } catch{return null;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>1_000_000)process.exit(0);}
  try{const out=contextFor(JSON.parse(input));if(out)console.log(JSON.stringify(out));}catch{}
}
