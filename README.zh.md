# @brianynwu/dsh-tui

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 智能体的交互式终端（TUI）入口——在终端里获得 Claude Code / Codex 同款的对话体验，以树外（out-of-tree）dsh 插件 bundle 的形式安装。基于 [`@earendil-works/pi-tui`](https://www.npmjs.com/package/@earendil-works/pi-tui) 构建。

它组合在官方 `@deepseek-ai/dsh-base` bundle 之上，与官方 web 界面共享同一套插件生态——shell 与文件系统工具、技能、子代理、工作流、沙箱审批。dsh 插件生态**不 fork**；唯一 vendored 的代码是终端 `Editor` 组件（见[兼容性](#兼容性)）。

## 功能

- 模型输出与思考过程的流式 Markdown 渲染
- 工具调用卡片（terminal / diff / generic 三种渲染意图）；Ctrl+O 三档切换：预览 → 展开 → 隐藏
- 工具审批与 `ask_user_question` 对话框，含 plan 模式评审
- `@文件` 路径自动补全与 `@session` 会话引用卡片
- 斜杠命令：`/model`（含推理力度选择）、`/resume`、`/compact`、`/details`、`/help`，以及其他插件注册的全部命令
- 常驻 todo 面板、token 用量与上下文压力状态栏、会话标题
- 可配置主题；从 `COLORTERM` 自动检测真彩色
- `/model` 原地切换（改写 selection ref——同一会话继续，不 fork、不 reseed）

## 安装

需要 Node `^22.19 || >=24` 和 `dsh` CLI（`npm i -g @deepseek-ai/dsh`）。

本 fork **从 GitHub 安装**（未发布到 npm 的 `@dsh-tui` scope）。它随包提供预构建的 `lib/`，且没有 `prepare`
脚本，因此安装直接使用已提交的构建产物——无构建步骤，也不会触发 `allowBuilds` 提示：

```sh
# 用发布 tag（推荐）或精确 commit——两者都不可变
dsh plugin --profile tui add github:brianynwu/dsh-tui#v0.1.3-revive.1
dsh --profile tui                                      # 在当前目录开启会话
dsh --profile tui --resume <session-id>                # 恢复历史会话
```

在环境变量（或启动目录 / `$DSH_HOME` 下的 `.env`）里设置 `DEEPSEEK_API_KEY`。

## 本地 / 自部署 DeepSeek 端点

零代码配置，三选一：

1. **环境变量**：`DEEPSEEK_BASE_URL=http://localhost:8000/v1` 搭配 `DEEPSEEK_API_KEY`。
2. **设置文件（热加载）**：`$DSH_HOME/settings.yaml`

   ```yaml
   llm-deepseek:
     baseURL: http://localhost:8000/v1
   ```

3. **OpenAI 兼容网关**（vLLM、SGLang 等）：在 profile 补丁（`$DSH_HOME/profiles/tui/cordis.patch.yml`）里声明一个 `llm-pi-ai` 路由并把默认模型指过去——参见 dsh 的 providers 指南。

## 兼容性

- **钉在 dsh-core `0.1.1-rc.2`。** `package.json` 的 `overrides` 加上已提交的 `package-lock.json` 把整套
  `@deepseek-ai/*` base 钉到验证过的精确版本；全新 `npm ci` + `npm run build` 可确定性地（逐字节一致）重建
  `lib/`。不要升到 dsh-core `0.1.2`——其 `/resume` 持久化 seam 在当前发布线上有 bug。
- **Vendored `Editor`。** 本 TUI 需要的无边框 prompt-gutter `Editor` 来自一个从未发布的、被 pnpm 打过补丁的
  `@earendil-works/pi-tui@0.80.7`。它以 `src/vendor/editor.ts` vendored（从本包自己的 MIT bundle 恢复、保持行为
  一致），因此 fork 只依赖 pi-tui 0.80.7 已发布的原语。完整维护记录见 `FORK.md`——包括三个忠实保留、延后到专门
  editor 加固轮次处理的上游既有缺陷（paste-undo 元数据、paste-id 重编号、autocomplete 拒绝）。
- **原地模型切换。** `/model` 改写模型 selection ref（`src/chat/model-command.ts`），切换后同一会话继续——不 fork
  子会话（与 pi-Ink 社区移植版不同），因而能与 dsh-core / 自动化编排组合。

## 开发

```sh
npm ci          # 从已提交 lockfile 取精确 base（不要用 --legacy-peer-deps：它会漏掉 peers）
npm run build   # 清空 lib/，tsc 类型声明 -> lib/types，tsdown 运行时打包 -> lib/
npm run typecheck
npm test        # vitest——渲染器回归测试（test/editor.test.ts）
```

构建是确定性的：干净克隆 + `npm ci` + `npm run build` 逐字节重现已提交的 `lib/`。

## 状态与已知限制

- 跟踪 pre-release 的 `@deepseek-ai/dsh` rc 线（钉在 `0.1.1-rc.2`）；上游稳定前会有变动。
- 真实模型回合需要可达的 DeepSeek 兼容端点；请求之前的一切（组合、渲染、审批、resume）无需 key 即可工作。
- 已知的 editor 行为债记录在 `FORK.md`（交互式 paste/undo/autocomplete 路径）。

## 来源与许可

MIT。TUI 实现恢复自 DeepSeek Harness 仓库历史（`packages/ui/tui`，上游已移除），并移植到已发布的 rc API；上游版权声明保留在 [LICENSE](LICENSE) 中。本 fork 增加了上述 rebuildable-compatibility 工作；详见 `FORK.md`。
