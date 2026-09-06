# Flow Lens

在 Codex 当前会话的右侧内置浏览器中，查看和编辑代码流程、任务分支。

配色使用 Codex 风格的中性色主题，并自动适配浅色和深色。组件环境优先读取官方 `window.openai.theme`；普通右侧浏览器未提供该信号时跟随系统外观，不提供单独的主题开关。

默认直接显示流程画布，不显示 Flow Lens 标题栏、会话标题或操作提示；通过鼠标滚轮缩放并拖动画布。Codex 内置面板点击节点后从底部展开详情，普通浏览器从右侧展开。对 AI 说“我要拖动修改分支”才显示编辑工具，说“看看改了什么”显示只读对比，说“只查看”回到简洁界面。编辑模式支持节点与连线修改、撤销/重做、保存草稿和提交提案。切换模式保留草稿与布局，不会应用代码修改。所有内容保存在本机，不需要额外模型 API Key。

## 一段会话，一张流程图

更新后在新任务的输入框技能选择器中搜索 **流程图** 或 **flow-lens**，选中后直接描述开发或阅读代码的任务。也可以输入：

> 使用 $flow-lens 开启当前会话流程图，后续涉及文件、方法时持续显示逻辑。

流程图只属于会话 ID，项目路径仅用于查找代码。相同会话移动工作目录仍继续原图，不同会话不会混用。页面不提供流程切换器，也不默认打开其他会话的图。HTML 是共用界面；图的数据保存在本地服务。请让插件打开 HTTP 地址，**不要直接打开源码 index.html**。

Codex 读取相关代码后，用 `sync_flow` 逐步添加方法、调用、判断和异常分支；修改代码并核对后继续更新。节点显示文件、方法名和代码行。增量更新保留其他文件、你的布局和草稿，代码与草稿有冲突时会标记。无需每次重新请求画图。

跨后续消息、恢复会话的提醒由 `hooks/hooks.json` 中的两个只读 Hook 提供（UserPromptSubmit / SessionStart）。**Codex 要求你首次审阅并信任插件 Hook 才会运行**；在 Codex CLI 中用 `/hooks` 审阅。没有信任时可显式选择技能处理本轮，但不能承诺后续自动重新激活。Hook 只读本会话的流程 JSON，不读取聊天记录、不修改代码、不会阻止任务。说“停止流程跟踪”可暂停后续内容更新。

这仍然是输入框中可选择的**技能**，没有向 Codex 原生“计划”模式菜单注入新开关。自动更新由会话中的 Codex 阅读代码后调用工具完成，不是浏览器直接监视输入框，也不是静态分析器自动拦截每次文件读取。

你可以拖动节点、连接分支、编辑条件和目标。让 AI 切到对比模式检查后，再返回编辑模式，点击「提交修改提案」，复制指令发送到当前会话。Codex 读取提案、修改代码并验证后回写实际流程。移动节点只改布局；连线和条件决定分支关系。

界面归属使用 Codex 的会话侧面板：每个会话打开自己的 `?thread=<会话ID>` 页面，由 Codex 恢复该会话的标签。Hook 不负责界面切换；插件没有公开的会话切换事件接口，无法独立控制或保证 Codex 每次侧栏切换都自动展开对应标签。

## 开发与运行

Node.js 22+：

```sh
npm ci
npm run build
npm test
node scripts/bridge.mjs list
node scripts/bridge.mjs url <flow-id>
```

`build` 生成 UI 和独立 MCP bundle。安装包中的 `dist/`、`scripts/bridge.mjs`、`scripts/model.mjs` 和启动脚本必须保留。运行安装包无需安装 npm 依赖。

创建图：把 `id,title,threadId,workspace,graph` 写入 JSON，然后执行 `node scripts/bridge.mjs create /absolute/path/flow.json`。节点和连线格式见 [技能说明](skills/flow-lens/SKILL.md)。`workspace` 使用实际项目根路径，代码引用相对这个根路径。创建和回写时校验引用文件及行号。

本地市场路径是 `~/.agents/plugins/marketplace.json`。本机市场的插件路径解析到 `~/plugins/flow-lens`，该目录链接到当前源代码。安装命令：`codex plugin add flow-lens@personal`。改动源码后重新构建，使用 plugin-creator 的缓存版本更新脚本并重新安装。

状态文件：`~/.local/share/flow-lens/flows/`；服务信息：`endpoint.json`；日志：`server.log`。服务只监听 127.0.0.1，以随机端口和本地令牌保护 API。可以用 `FLOW_LENS_DATA` 指定测试数据目录。服务重启后请用 `url` 命令取得新链接。

## 数据与并发

每张图有 mode（view/edit/compare）、workspace、threadId、revision、baseline、draft、evidence、request 和 history。保存使用 revision 防止覆盖其他编辑者的改动。关联源文件使用 SHA-256 检测变化；代码过时时拒绝提交提案，等待 Codex 重新核对。回写会存档原始图、提案和验证说明。验证说明是会话给出的记录，插件不会独立证明代码正确。

## 官方接口依据

- [插件与技能打包](https://learn.chatgpt.com/docs/build-plugins)
- [内置浏览器的 WebMCP](https://learn.chatgpt.com/docs/webmcp)
- [可选的 MCP UI 与宿主桥接](https://developers.openai.com/plugins/build/chatgpt-ui)
- [React Flow 的连线重接](https://reactflow.dev/api-reference/utils/reconnect-edge)
