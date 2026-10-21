# Flow Lens for Codex

在 Codex 右侧查看代码的主要步骤和关键分支。点击节点查看详情，流程随任务更新，数据保存在本机。

[下载最新安装包](https://github.com/SSF0/flow-lens-codex-plugin/releases/latest/download/flow-lens-portable.zip)

## 安装

需要 macOS、Codex CLI 和 Node.js 22+。解压安装包，在该目录运行：

```sh
./install.sh
```

重启 Codex，新建任务，在技能选择器中选择 **流程图**。首次使用按 Codex 提示审阅并信任 Hook。

## 使用

- **查看**：直接描述任务，例如“显示登录的主要流程”。
- **展开**：点击节点查看说明与源码；需要更细的流程时告诉 Codex。
- **修改**：说“编辑流程图”，调整节点或分支，点“提交并复制”，把指令粘贴到当前会话。

说“只查看”返回画布，说“停止流程跟踪”暂停更新。每个会话使用独立流程图。

## 开发

```sh
cd flow-lens
npm ci
npm run build
npm test
```

首次运行浏览器测试前执行 `npx playwright install chromium`。

在仓库根目录打包：

```sh
python3 scripts/package_release.py --version 0.2.0
```

[开发说明](flow-lens/README.md) · [更新记录](CHANGELOG.md)

## Contributors

- [SSF0](https://github.com/SSF0)：项目维护者。
- [Codex](https://github.com/codex)：AI 协作，参与代码实现、测试与文档优化。
