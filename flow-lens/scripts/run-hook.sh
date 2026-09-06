#!/bin/sh
set -eu
plugin_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if command -v node >/dev/null 2>&1; then exec node "$plugin_dir/scripts/session-hook.mjs"; fi
for runtime_node in /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node; do
  if [ -x "$runtime_node" ]; then exec "$runtime_node" "$plugin_dir/scripts/session-hook.mjs"; fi
done
exit 0
