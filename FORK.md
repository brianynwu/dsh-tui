# Fork notes — revived `@dsh-tui/dsh-tui`

This is a maintained fork of **`@dsh-tui/dsh-tui` v0.1.2** (`github.com/dsh-tui/dsh-tui`), itself the
MIT-licensed republish of the **original first-party `@deepseek-ai/dsh-tui`** recovered from the
deepseek-harness repository history (see `LICENSE`). DeepSeek later dropped the terminal TUI from the
monorepo in favor of the web UI; this line revives the terminal front-door.

## Why this fork exists

The community successor `@deepseek-harness-tui/dsh-tui` (a pi-Ink port) changed `/model` swaps to **fork the
session** on every switch (pi-agent-core `Session Tree` semantics). That is incompatible with dsh-core /
Olympus, whose model swap is **in-place** (`session.selectModel` / a `ModelSelectionRef` mutation, same
session continues). This fork keeps the original's dsh-core-native **in-place** model selection
(`src/chat/model-command.ts`: mutates `target.current`, "New steps will use it", no fork/reseed) and is an
**in-process cordis `--profile` bundle** — so it composes with a launcher's `--patch` overlays natively.

## Changes vs upstream v0.1.2

- `package.json`: version → `0.1.3-revive.0`; widened all 25 `@deepseek-ai/dsh-*` peer ranges from
  `^0.1.0-rc.6` to `^0.1.0-rc.6 || ^0.1.1-rc.1` so they resolve against the current dsh-core `0.1.1-rc.2`
  (the upstream caret does not span prereleases across patch tuples — the same reason the pi TUI enumerates
  versions; verified with node-semver).

## Verified compatible with current dsh-core `0.1.1-rc.2` (static, 2026-09-08)

All APIs the model controller uses are present in the current core: `ModelSelectionRef` / `ModelSelection`
(`@deepseek-ai/dsh-agent`), `resolveModelInfo().context.contextWindow` (`@deepseek-ai/dsh-llm`), the
`llm/adapters-updated` event; and the cordis base rows it patches (`agent-loop`, `system-prompt`,
`llm-deepseek`) all exist. Renderer is self-contained (`commander`/`diff`/`marked`/`saxes` — no Ink,
OpenTUI, or pi). **Pending:** a live isolated boot + a real turn + a mid-session `/model` swap confirming
in-place behavior end-to-end.

## Publish / identity (deferred decision)

The npm `name` is still `@dsh-tui/dsh-tui` (upstream). If this fork is published, rescope it to an owned
scope; foundry can also consume it via a git pin without republishing.
