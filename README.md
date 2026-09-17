# @brianynwu/dsh-tui

English | [中文](README.zh.md)

A maintained terminal interface for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agents. It runs as an out-of-tree plugin over the official `@deepseek-ai/dsh-base` bundle and uses [pi-tui](https://www.npmjs.com/package/@earendil-works/pi-tui) for rendering. The Harness plugin ecosystem stays intact: tools, skills, subagents, workflows, approvals, and sessions come from the host. Model changes through `/model` stay in the **same session**.

## What it does

- **Readable live transcript.** Streamed Markdown, reasoning, and LaTeX appear in a full-screen viewport. Scroll with PageUp/PageDown or the mouse wheel, search the transcript, and select text with the mouse. The editor, questions, and metrics stay visible below the scroll area.
- **Independent detail controls.** Alt+T cycles tool cards through collapsed, expanded, and hidden. Alt+R cycles reasoning through full, off, and a three-line preview. Alt+C cycles injected context cards (instructions, skills, agent messages, session references) separately. `/details` opens a selector or sets these states directly; `/quiet` hides all three and `/quiet off` restores the previous view. Startup defaults are `toolCardVisibility: collapsed`, `reasoningFold: full`, and `contextVisibility: collapsed`.
- **Full tool output on demand.** `/cards` or Ctrl+T opens a read-only browser for every tool card, even when inline cards are hidden. Tool cards show terminal, diff, or generic output according to the tool's render intent.
- **Sessions and child agents.** `/resume` searches resumable sessions. Submitted prompts remain available across processes under `$DSH_HOME`. `/agents` or Ctrl+G opens a popup showing direct child agents; Enter opens a read-only child transcript. Esc returns to the popup, then to the main view. Child views inherit the main detail settings when opened and can then change their own tool, reasoning, and context visibility with Alt+T/R/C. Input remains with the main agent.
- **Models and permissions.** `/model` selects a provider/model and reasoning effort without forking the session. The current permission preset is visible; Shift+Tab cycles named presets through the Harness `/permission` command. A custom policy is changed with `/permission <name>` instead.
- **Input and decisions.** `@file` path completion, `@session` references, `/skill:<name>` invocation, approval and user-question dialogs, and a scrollable plan-review panel for questions that advertise plan-review intent. An OSC 9 desktop notification fires when a new question becomes actionable; `notifications: false` disables it.
- **At-a-glance state.** A pinned dashboard shows latest-step timing, input/output tokens, cache hit rate, token throughput, context use, working directory, branch, session ID, and model. A todo panel, session title, and phase-aware prompt indicator show live progress. Provider and cost rows appear only when another plugin supplies them.

## Controls

| Input | Action |
| --- | --- |
| Alt+T / Alt+R / Alt+C | Cycle tool cards / reasoning / injected context |
| Ctrl+T or `/cards` | Browse full tool outputs; ←/→ changes cards, ↑/↓ or PgUp/PgDn scrolls, Esc closes |
| Ctrl+G or `/agents` | Open the child-agent popup; ↑/↓ selects, Enter views, Esc goes back |
| Shift+Tab | Cycle named permission presets; in the model picker, cycle reasoning effort |
| PageUp / PageDown, mouse wheel | Scroll the transcript; Home/End remain editor keys |
| Esc / Ctrl+C / Ctrl+D | Cancel a running turn / cancel or clear or exit / exit when idle |

Shortcut actions can be remapped with the TUI `keys` setting; invalid or conflicting maps are rejected as a whole. `/help` shows the active commands and default shortcuts. The fork also provides `/status` (session diagnostics, system prompt, tools), `/clear` (view only), `/palette`, `/exit`, `/quit`, and experimental `/reload`. Harness commands such as `/compact` and `/permission` remain available through the host bundle and other installed plugins.

## Install

Requires Node `^22.19 || >=24`. The tested Harness CLI line is `0.1.5-rc.2`.

```sh
npm install -g @deepseek-ai/dsh@0.1.5-rc.2
dsh plugin --profile tui add @brianynwu/dsh-tui@0.2.0
dsh --profile tui
```

You can also install the same release from GitHub:

```sh
dsh plugin --profile tui add github:brianynwu/dsh-tui#v0.2.0
```

The package includes built `lib/` and its Cordis patch; installation does not compile TypeScript. The patch composes over `dsh-base` and does not hardcode a model route. Configure a provider and credentials in the host deployment before a model turn. For the official DeepSeek adapter, supply `DEEPSEEK_API_KEY` through the host credential setup, launch environment, or a `.env` file in the working directory or `$DSH_HOME`. `DEEPSEEK_BASE_URL` can point that adapter at a compatible endpoint; alternatively, set `llm-deepseek.baseURL` in `$DSH_HOME/settings.yaml`. For other OpenAI-compatible gateways, configure a `llm-pi-ai` route in the host profile and select its model.

`/resume` lists this workspace's sessions; `dsh --profile tui --resume <session-id>` opens one directly. On exit, the default hint prints that command. A launcher with a different session root can set `DSH_TUI_RESUME_HINT`; `{session}` expands to the session ID, and an empty value suppresses the hint.

## Configuration and compatibility

The TUI settings are defined in [`src/config.ts`](src/config.ts): shortcut overrides, notification toggle, transcript detail defaults, dialog sizes, file completion limits, and prompt/color settings. `theme.truecolor` auto-detects from `COLORTERM` unless explicitly set. `showReasoning` remains a legacy alias when `reasoningFold` is absent. A Cordis patch replaces a row's whole `config` block, so retain the other `tui` fields when overriding that row.

This release is built and tested with `@deepseek-ai/dsh-*` `0.1.5-rc.2` and `@earendil-works/pi-tui` `0.85.1`. The frameless prompt editor is vendored in `src/vendor/editor.ts`; its earlier paste/undo/autocomplete defects were fixed in this fork. The host's dsh packages are still on an rc line. The TUI does not provide a local `!` shell mode or session rewind. See [`FORK.md`](FORK.md) for the maintenance history.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm run build` regenerates the committed `lib/` bundle and declarations from `src/`. Use the committed lockfile and do not use `--legacy-peer-deps`, which omits required peer packages.

## Provenance and license

MIT. The original TUI came from DeepSeek Harness repository history (`packages/ui/tui`, later removed upstream). This fork retains the upstream copyright in [LICENSE](LICENSE) and adds the maintained features described above.
