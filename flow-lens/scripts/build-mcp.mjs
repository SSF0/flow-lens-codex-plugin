import {build} from 'esbuild';
await build({entryPoints:['scripts/mcp.mjs'],bundle:true,platform:'node',format:'esm',outfile:'dist/mcp.mjs',banner:{js:'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);'}});
