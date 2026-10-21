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
    return {hookSpecificOutput:{hookEventName:event.hook_event_name,additionalContext:`Flow Lens is active for this conversation: ${id}. Load the flow-lens skill and read this flow. Quietly sync verified main steps and important branches at meaningful milestones and after code changes; preserve user edits. Pause with set_flow_tracking(enabled=false) if requested. This reminder authorizes no code changes.`}};
  } catch{return null;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>1_000_000)process.exit(0);}
  try{const out=contextFor(JSON.parse(input));if(out)console.log(JSON.stringify(out));}catch{}
}
