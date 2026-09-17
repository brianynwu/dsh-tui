# @brianynwu/dsh-tui

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 智能体的持续维护版终端界面。它作为树外插件运行在官方 `@deepseek-ai/dsh-base` bundle 之上，使用 [pi-tui](https://www.npmjs.com/package/@earendil-works/pi-tui) 渲染。工具、技能、子代理、工作流、审批和会话仍由宿主 Harness 插件体系提供。通过 `/model` 更换模型时，**当前会话会继续**。

## 功能

- **易读的实时记录。** 全屏视口流式呈现 Markdown、思考过程和 LaTeX。可用 PageUp/PageDown 或鼠标滚轮滚动、搜索记录，并用鼠标选取文本。编辑器、问题对话框和指标固定在滚动区域下方。
- **独立的详细程度控制。** Alt+T 在折叠、展开、隐藏三种工具卡片状态间切换；Alt+R 在完整、隐藏、三行预览三种思考过程状态间切换；Alt+C 独立控制注入的上下文卡片（指令、技能、智能体消息、会话引用）。`/details` 可打开选择窗格或直接指定状态；`/quiet` 隐藏这三类内容，`/quiet off` 恢复先前的显示方式。启动默认值分别为 `toolCardVisibility: collapsed`、`reasoningFold: full`、`contextVisibility: collapsed`。
- **随时查看完整工具输出。** `/cards` 或 Ctrl+T 可只读浏览所有工具卡片，即使行内卡片已隐藏。工具卡片按工具的渲染意图显示终端、差异或通用输出。
- **会话与子代理。** `/resume` 搜索可恢复的会话；已提交的提示词保存在 `$DSH_HOME` 下，可跨进程调取。`/agents` 或 Ctrl+G 打开直属子代理弹窗；按 Enter 查看只读子代理记录。按 Esc 先返回弹窗，再返回主视图。子视图打开时继承主视图的详细程度，之后可用 Alt+T/R/C 独立调整工具、思考和上下文显示。输入仍归主智能体。
- **模型与权限。** `/model` 选择提供方、模型和推理力度，不派生新会话。当前权限预设始终可见；Shift+Tab 通过 Harness 的 `/permission` 命令轮换具名预设。自定义权限策略需用 `/permission <name>` 更改。
- **输入与决策。** 支持 `@file` 路径补全、`@session` 会话引用、`/skill:<name>` 调用、审批与用户问题对话框，以及针对明确标记为计划评审的问题的可滚动评审面板。新问题需要答复时可发出 OSC 9 桌面通知；设置 `notifications: false` 可关闭。
- **一眼查看运行状态。** 固定仪表板显示最近一步的耗时、输入/输出 token、缓存命中率、token 吞吐量、上下文用量、工作目录、分支、会话 ID 和模型。todo 面板、会话标题和随阶段变化的提示符展示进度。提供方与费用行仅在其他插件提供数据时出现。

## 操作

| 输入 | 功能 |
| --- | --- |
| Alt+T / Alt+R / Alt+C | 轮换工具卡片 / 思考过程 / 注入的上下文 |
| Ctrl+T 或 `/cards` | 浏览完整工具输出；←/→ 切换卡片，↑/↓ 或 PgUp/PgDn 滚动，Esc 关闭 |
| Ctrl+G 或 `/agents` | 打开子代理弹窗；↑/↓ 选择，Enter 查看，Esc 返回 |
| Shift+Tab | 轮换具名权限预设；在模型选择窗格中轮换推理力度 |
| PageUp / PageDown、鼠标滚轮 | 滚动记录；Home/End 仍由编辑器使用 |
| Esc / Ctrl+C / Ctrl+D | 取消运行中的回合 / 取消、清空输入或退出 / 空闲时退出 |

可用 TUI 的 `keys` 设置重映射快捷键；无效或冲突的整组映射会被拒绝。`/help` 显示当前命令和默认快捷键。本 fork 还提供 `/status`（会话诊断、系统提示词、工具）、`/clear`（仅清空视图）、`/palette`、`/exit`、`/quit` 和实验性的 `/reload`。`/compact`、`/permission` 等 Harness 命令仍由宿主 bundle 和其他已安装插件提供。

## 安装

需要 Node `^22.19 || >=24`。已验证的 Harness CLI 版本线为 `0.1.5-rc.2`。

```sh
npm install -g @deepseek-ai/dsh@0.1.5-rc.2
dsh plugin --profile tui add @brianynwu/dsh-tui@0.2.0
dsh --profile tui
```

也可以从 GitHub 安装同一版本：

```sh
dsh plugin --profile tui add github:brianynwu/dsh-tui#v0.2.0
```

包内已附 `lib/` 构建产物和 Cordis 补丁；安装时无需编译 TypeScript。补丁叠加在 `dsh-base` 上，不固定模型路由。模型回合开始前，请在宿主部署中配置提供方与凭据。使用官方 DeepSeek 适配器时，可通过宿主凭据设置、启动环境，或工作目录及 `$DSH_HOME` 下的 `.env` 文件提供 `DEEPSEEK_API_KEY`。`DEEPSEEK_BASE_URL` 可将该适配器指向兼容端点；也可在 `$DSH_HOME/settings.yaml` 中设置 `llm-deepseek.baseURL`。其他 OpenAI 兼容网关可在宿主 profile 中配置 `llm-pi-ai` 路由并选择其模型。

`/resume` 列出当前工作区的会话；`dsh --profile tui --resume <session-id>` 可直接恢复。退出时默认提示会打印该命令。如果启动器使用不同的会话目录，可设置 `DSH_TUI_RESUME_HINT`；`{session}` 会展开为会话 ID，空值可关闭提示。

## 配置与兼容性

TUI 设置定义在 [`src/config.ts`](src/config.ts)：快捷键、通知开关、记录详细程度的启动值、对话框大小、文件补全上限，以及提示符和颜色设置。`theme.truecolor` 默认通过 `COLORTERM` 检测，也可显式指定。未设置 `reasoningFold` 时，旧版别名 `showReasoning` 仍有效。Cordis 补丁会替换目标行的整个 `config` 块；覆盖 `tui` 行时应保留其他字段。

此版本使用 `@deepseek-ai/dsh-*` `0.1.5-rc.2` 和 `@earendil-works/pi-tui` `0.85.1` 构建及测试。无边框提示词编辑器 vendored 于 `src/vendor/editor.ts`；先前的粘贴、撤销和自动补全缺陷已在本 fork 中修复。宿主 dsh 包仍处于 rc 版本线。TUI 尚未提供本地 `!` shell 模式或会话回退。维护历史见 [`FORK.md`](FORK.md)。

## 开发

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm run build` 根据 `src/` 重新生成已提交的 `lib/` bundle 和类型声明。请使用已提交的 lockfile，不要使用 `--legacy-peer-deps`，否则会漏装必需的 peer 包。

## 来源与许可

MIT。原始 TUI 来自 DeepSeek Harness 仓库历史中的 `packages/ui/tui`（后来被上游移除）。本 fork 在 [LICENSE](LICENSE) 中保留上游版权声明，并增加上述持续维护的功能。
