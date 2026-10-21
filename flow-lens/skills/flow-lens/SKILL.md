---
name: flow-lens
description: 流程图 — Maintain a concise code flowchart for the current Codex conversation. Use when Flow Lens is selected, tracking is active, or the user asks to edit or apply a flow proposal.
---

# Flow Lens

Keep a small, source-backed flowchart beside the current task. Continue the requested work and update the graph quietly; do not explain plugin mechanics unless needed.

## Start and update

1. Get the real conversation ID from `CODEX_THREAD_ID` or task context and the project root. Call `open_session(workspace,threadId,title?)`. Missing identity must be resolved, never invented or borrowed from another task.
2. Open the returned HTTP URL unchanged with `open_in_codex` (browser, right). Reuse this task's tab. One conversation owns one canvas; workspace is source metadata. Never open the source `index.html`.
3. Read relevant code, then call `sync_flow` at meaningful milestones and after verified changes. Use stable IDs and the latest revision. Keep unrelated nodes, user layout and draft edits; resolve reported conflicts from code and user intent.
4. On “停止流程跟踪”, call `set_flow_tracking(enabled=false)` with the current revision. `open_session` resumes tracking.

## Keep the graph simple

- Show the main path and decisions that change the outcome. Usually 5–9 nodes suffice for an initial overview; use more when the logic requires it.
- Group routine calls, assignments and checks into a meaningful step. Do not create a node for every file or method. Preserve relevant failure paths and branch conditions.
- Use short action labels. Edge labels only need the condition or result. Leave `detail` empty unless it adds information the label cannot convey; details and source references are available on click.
- Expand a particular step when the user asks for more detail. Do not silently prune existing mapped logic or user edits just to reach a node count.
- Source-backed nodes need real project-relative `source.path`, one-based `line`, and `symbol`. Keep proposed or uncertain behavior separate from verified code.

Nodes: `{id,position:{x,y},data:{label,kind,detail?,status?,source?:{path,line,symbol}}}`. Kinds: `start/action/decision/end`; optional status: `todo/active/done/blocked`. Edges: `{id,source,target,label?}`. Space nodes about 260px horizontally / 140px vertically.

`sync_flow` takes `id,revision,nodes,edges,summary` plus optional `removeNodes/removeEdges`. When refreshing a source file's freshness hash, include all its previously mapped nodes that you reverified. A partial refresh keeps the previous hash. Use `update_draft` for unimplemented behavior; use `reconcile_flow` only after checking actual code and validation results.

## Editing

Default to `view`. Use `set_flow_mode` for an explicit diagram-editing request (`edit`) or a draft comparison (`compare`); otherwise preserve the current mode. Ordinary code changes do not require edit mode. Switching modes preserves drafts.

The user edits the diagram, clicks **提交并复制**, and pastes the instruction into this conversation. To apply a proposal, read [references/proposals.md](references/proposals.md). Do not require a separate comparison or confirmation when already authorized.

## Runtime

Read-only hooks remind later turns to maintain an activated flow. Codex requires initial hook trust; never bypass it or promise automatic resumption without it. The selected skill works for the current turn. The renderer follows the host/system theme and uses a bottom drawer in Codex.

If MCP tools are unavailable, read [references/cli.md](references/cli.md). State is local at `~/.local/share/flow-lens/`; browser URLs carry a private local token. This is a skill with a browser panel, not a native Codex mode or automatic source watcher.
