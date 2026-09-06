#!/bin/sh
set -eu

bundle_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if ! command -v codex >/dev/null 2>&1; then
  echo "未找到 Codex CLI。请先安装或更新 Codex，并确保终端中可以运行 codex。" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js。Flow Lens 需要 Node.js 22 或更高版本。" >&2
  exit 1
fi

node_major=$(node -p "Number(process.versions.node.split('.')[0])")
if [ "$node_major" -lt 22 ]; then
  echo "当前 Node.js 版本过低：$(node --version)。Flow Lens 需要 Node.js 22 或更高版本。" >&2
  exit 1
fi

if codex plugin marketplace list --json | node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const wanted = path.resolve(process.argv[1]);
  const data = JSON.parse(fs.readFileSync(0, "utf8"));
  const found = (data.marketplaces || []).some((item) => path.resolve(item.root) === wanted);
  process.exit(found ? 0 : 1);
' "$bundle_root"; then
  echo "Flow Lens 本地市场已经注册。"
else
  codex plugin marketplace add "$bundle_root"
fi

codex plugin add flow-lens@flow-lens-portable

echo
echo "Flow Lens 已安装。请完全退出并重新打开 Codex，然后创建一个新任务。"
echo "在输入框的技能选择器中搜索‘流程图’或‘flow-lens’即可使用。"
