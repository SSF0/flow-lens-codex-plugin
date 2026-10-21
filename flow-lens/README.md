# Flow Lens

当前 Codex 会话的代码流程图。默认只显示主要步骤和分支条件，点击节点查看说明与源码。编辑时展开“更多信息”可修改代码引用等字段；“提交并复制”会保存草稿、提交提案并复制会话指令。复制失败时可手动复制。

## 开发

需要 Node.js 22+。

```sh
npm ci
npm run build
npx playwright install chromium
npm test
```

`build` 生成浏览器界面和独立 MCP bundle。发布包自带构建产物，使用时无需安装 npm 依赖。

- `src/`：React 画布和详情面板。
- `scripts/model.mjs`：流程、草稿、版本和代码引用校验。
- `scripts/bridge.mjs`：本地 HTTP 服务和 CLI。
- `scripts/mcp.mjs`：Codex 工具接口。
- `skills/flow-lens/`：流程生成与提案处理指令。

## 状态与接口

每个会话 ID 对应一张图，项目路径只用于定位源码。查看、编辑和对比模式共享同一份数据；切换模式不会丢弃草稿。保存通过 revision 防止覆盖其他编辑，源码变化时会阻止提交，直到重新核对。提案执行后保留历史记录。

数据位于 `~/.local/share/flow-lens/`，可用 `FLOW_LENS_DATA` 指定测试目录。服务仅监听 `127.0.0.1`，使用随机端口和本地令牌；重启后需要重新获取 URL。Hook 只提醒已启用的会话，首次运行需用户信任。流程更新由 Codex 调用工具完成。

工具与图格式见 [技能说明](skills/flow-lens/SKILL.md)，命令见 [CLI 用法](skills/flow-lens/references/cli.md)。
