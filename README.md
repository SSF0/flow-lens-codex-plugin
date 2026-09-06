# Flow Lens for Codex

Flow Lens 为 Codex 任务提供与会话绑定的代码流程图。Codex 阅读或修改代码时，可以把相关文件、方法、调用关系和逻辑分支同步到右侧浏览器面板。

[下载最新安装包](https://github.com/SSF0/flow-lens-codex-plugin/releases/latest/download/flow-lens-portable.zip)

## 功能

- 每个 Codex 任务使用独立流程图，切换任务时不会混用数据。
- 查看模式保持界面简洁，支持滚轮缩放、拖动画布和点击节点查看源码信息。
- 编辑模式可以调整节点、连线和分支条件，再把修改提案交给当前任务执行。
- 对比模式用于检查流程草稿与当前代码逻辑的差异。
- 自动适配 Codex 的浅色或深色主题。
- 数据只保存在本机，不需要额外的模型 API Key。

## 安装

当前安装包支持 macOS，需要：

- Codex 桌面应用或 Codex CLI
- Node.js 22 或更高版本

下载并解压 `flow-lens-portable.zip`，在终端进入解压后的目录，然后运行：

```sh
./install.sh
```

安装完成后完全退出并重新打开 Codex，创建一个新任务，在输入框的技能选择器中搜索“流程图”或“flow-lens”。第一次启用 Hook 时，Codex 会要求审阅并信任它。

## 使用

选择“流程图”后直接描述任务，例如：

> 阅读登录流程，显示涉及的文件、方法和失败分支。

> 修改订单取消逻辑，并持续更新流程图。

> 我要拖动修改流程分支。

流程图保存在 `~/.local/share/flow-lens/`。不同设备默认各自保存数据。

## 开发

```sh
cd flow-lens
npm ci
npm run build
npm test
```

生成本地发布包：

```sh
python3 scripts/package_release.py --version 0.1.0
```

项目结构和实现说明见 [flow-lens/README.md](flow-lens/README.md)。
