# CLI fallback

Resolve the plugin root three levels above this reference directory, then run `node <plugin-root>/scripts/bridge.mjs`:

| Command | Purpose |
| --- | --- |
| `session <workspace> <thread-id> [title]` | Open or resume this conversation and return its live URL |
| `read <flow-id>` | Read state, revision and changes |
| `mode <flow-id> <view\|edit\|compare>` | Change presentation |
| `sync <flow-id> <absolute-json-file>` | Update verified logic |
| `reconcile <flow-id> <absolute-json-file>` | Publish verified code-backed logic |
| `url <flow-id>` | Get a fresh local URL |

Sync JSON: `revision,nodes,edges,summary` and optional `removeNodes/removeEdges`. Reconcile JSON: `revision,graph,verification`. For draft or tracking changes without an MCP tool, import the bridge's `call` helper and POST to `/<flow-id>/draft` with `revision,graph` or `/<flow-id>/tracking` with `revision,enabled`.

Commands start the service when needed. Keep `surface=codex` when present; for a `url` fallback, add it to the query before the token fragment. Open the HTTP URL in this task's right browser panel, or return it if the panel tool is unavailable. Do not expose the token elsewhere.

Installed packages include built UI and MCP code. In a source checkout, run `npm ci` and `npm run build` only if built assets are missing. A new installation may need a new Codex task for MCP discovery; the CLI can serve an already-open task.
