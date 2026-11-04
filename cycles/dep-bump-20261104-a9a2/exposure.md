# Advisory exposure — the fork's lock on the dsh 0.2.1-rc.5 line (2026-11-04)

Record for this repo's `dep_decisions.toml` (read by Foundry `tools/dep_audit.py`). Cycle: Foundry
`dep-bump-20261104-a9a2`.

## Rows

`package-lock.json` carries nine advisory rows, all transitive and all pinned exactly inside dsh 0.2.1-rc.5:

- undici 8.11.2 (first patched 8.12.2): GHSA-2m5v-pch6-74hx, GHSA-4qv8-2p9j-2685, GHSA-4w7w-5xrc-9h26,
  GHSA-55wc-3pg8-jfw6, GHSA-9fm3-97px-rjf6, GHSA-f72v-6w45-q472, GHSA-qrxm-fqhp-jwvm, GHSA-xjj6-f33q-929c.
  Path: `npm explain undici` → `dev peer`, via `@deepseek-ai/dsh-subprocess` → `@deepseek-ai/dsh-http-proxy`.
- zod 4.4.3 (first patched 4.6.6): GHSA-mrhx-c7xc-m3w5. Path: `dev peer` of the `@deepseek-ai/dsh-*` devDependencies.

## Why they are not exploitable here

1. **The lock is the dev/test install.** Every `@deepseek-ai/*` package is a peer (the host provides it) and a
   devDependency (so `tsc`, `tsdown` and `vitest` resolve it). This install runs only typecheck, build and the vitest
   suite on in-repo fixtures; it opens no network peer and parses no attacker-supplied input.
2. **The shipped plugin does not carry them.** `tsdown.config.ts` keeps `@deepseek-ai/*` external, and `lib/` bundles
   neither undici nor zod (`grep -c undici lib/*.js` = 0, no `zod` import). At runtime the plugin resolves dsh,
   undici and zod from the host's tree.
3. **Runtime exposure is decided in Foundry.** The host is Foundry's `tools/orch` tree, whose rows for the same IDs are
   decided in Foundry's `dep_decisions.toml`, with the exposure analysis in Foundry
   `cycles/dep-bump-20261104-a9a2/reconcile.md` §3. zod's runtime verdict is Foundry's own; this file does not restate
   it and records only that this repo's own install does not reach the vulnerable paths.

Each entry is `not_affected` / `vulnerable_code_cannot_be_controlled_by_adversary`; `review_by` 2027-02-03, or sooner
when the dsh line moves (a version change invalidates the key).
