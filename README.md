# @brianynwu/dsh-tui

English | [中文](README.zh.md)

An interactive terminal (TUI) front door for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agents — a Claude Code / Codex-style chat interface in your terminal, installed as an out-of-tree dsh plugin bundle. Built on [`@earendil-works/pi-tui`](https://www.npmjs.com/package/@earendil-works/pi-tui).

It composes over the official `@deepseek-ai/dsh-base` bundle, so the whole plugin ecosystem — shell and filesystem tools, skills, subagents, workflows, sandbox approvals — is the same one the official web surface uses. The dsh plugin ecosystem is **not** forked; the only vendored code is the terminal `Editor` widget (see [Compatibility](#compatibility)).

## Features

- Streaming model output and reasoning, rendered as Markdown
- Tool-call cards with terminal / diff / generic render intents; Ctrl+O cycles collapsed → expanded → hidden
- Approval and `ask_user_question` dialogs, plan-mode review included
- `@file` path autocomplete and `@session` reference cards
- Slash commands: `/model` (with reasoning-effort selection), `/resume`, `/compact`, `/details`, `/help`, and every command other plugins register
- Standing todo panel, token usage and context-pressure status line, session titles
- Configurable theme; truecolor detected from `COLORTERM`
- In-place `/model` switching (mutates the selection ref — the same session continues, no fork/reseed)

## Install

Requires Node `^22.19 || >=24` and the `dsh` CLI (`npm i -g @deepseek-ai/dsh`).

This fork is consumed **from GitHub** (it is not published to the npm `@dsh-tui` scope). It ships a prebuilt
`lib/` and has no `prepare` script, so installs use the committed build directly — no build step, no
`allowBuilds` prompt:

```sh
# a release tag (recommended) or an exact commit — both are immutable
dsh plugin --profile tui add github:brianynwu/dsh-tui#v0.1.3-revive.1
dsh --profile tui                                      # start a session in the current directory
dsh --profile tui --resume <session-id>                # resume a persisted session
```

Set `DEEPSEEK_API_KEY` in your environment (or a `.env` in the launch directory or `$DSH_HOME`).

## Local / self-hosted DeepSeek endpoints

No code changes needed — pick one:

1. **Environment**: `DEEPSEEK_BASE_URL=http://localhost:8000/v1` alongside `DEEPSEEK_API_KEY`.
2. **Settings (hot-reloaded)**: `$DSH_HOME/settings.yaml`

   ```yaml
   llm-deepseek:
     baseURL: http://localhost:8000/v1
   ```

3. **OpenAI-compatible gateways** (vLLM, SGLang, …): declare an `llm-pi-ai` route in your profile patch (`$DSH_HOME/profiles/tui/cordis.patch.yml`) and point the default model at it — see the dsh providers guide.

## Compatibility

- **Pinned to dsh-core `0.1.1-rc.2`.** `package.json` `overrides` + a committed `package-lock.json` pin the
  whole `@deepseek-ai/*` base to the exact tested set; a fresh `npm ci` + `npm run build` regenerates `lib/`
  deterministically (byte-identically). Do not bump dsh-core to `0.1.2` — its `/resume` persistence seam is
  buggy on the currently-released line.
- **Vendored `Editor`.** The frameless prompt-gutter `Editor` this TUI needs came from a pnpm-*patched*
  `@earendil-works/pi-tui@0.80.7` that was never published. It is vendored as `src/vendor/editor.ts` (recovered
  from this package's own MIT bundle, behavior-preserving), so the fork depends only on pi-tui 0.80.7's
  published primitives. See `FORK.md` for the full maintenance record — including three pre-existing upstream
  editor defects (paste-undo metadata, paste-id renumber, autocomplete rejection) carried faithfully and
  deferred to a dedicated editor-hardening pass.
- **In-place model swap.** `/model` mutates the model-selection ref (`src/chat/model-command.ts`), so a switch
  continues the same session — no child-session fork (unlike the pi-Ink community port). This is what makes it
  compose with dsh-core / automated orchestration.

## Development

```sh
npm ci          # exact base from the committed lockfile (do NOT use --legacy-peer-deps: it omits the peers)
npm run build   # cleans lib/, tsc declarations -> lib/types, tsdown runtime bundle -> lib/
npm run typecheck
npm test        # vitest — renderer regression tests (test/editor.test.ts)
```

The build is deterministic: a clean clone + `npm ci` + `npm run build` reproduces the committed `lib/` exactly.

## Status and known limitations

- Tracks the pre-release `@deepseek-ai/dsh` rc line (pinned at `0.1.1-rc.2`); expect churn until upstream
  stabilizes.
- A real model turn requires a reachable DeepSeek-compatible endpoint; everything up to the request
  (composition, rendering, approvals, resume) works keyless.
- Known editor-behavior debt is tracked in `FORK.md` (interactive paste/undo/autocomplete paths).

## Provenance and license

MIT. The TUI implementation was recovered from the DeepSeek Harness repository history (`packages/ui/tui`, removed upstream) and ported to the published rc API; upstream copyright is preserved in [LICENSE](LICENSE). This fork adds the rebuildable-compatibility work described above; see `FORK.md`.
