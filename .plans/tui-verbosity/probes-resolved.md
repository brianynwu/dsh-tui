# Unknown probes — RESOLVED (2026-09-16, before any code)

All 7 plan Unknowns resolved against `main` @ `34dd9ec` (branch `feat/configurable-verbosity`). Recorded so
the next session implements directly without re-probing.

1. **C4 gate — GO (card retention).** `allToolCards = new Set<ToolCardComponent>()` (`src/index.ts:400`) is a
   persistent registry: cards added at :807 / :1080, cleared ONLY on transcript `.clear()` (:1172).
   `setVisibility('hidden')` (`transcript.ts:522`) sets the field + `dropLines()` — it does NOT discard the
   card's `result`/`callView`/`resultView`. `applyTurnFolding` (`index.ts:817`) only toggles
   `setFoldedContinuation` on the STREAMING step components (folds per-step headers), never destroys cards.
   ⇒ the overlay iterates `allToolCards` and renders each card's full body regardless of visibility. **No
   retained-list addition needed; C4 has no go/no-go blocker.**
2. **Free chord = Ctrl+T.** Taken Ctrl chords: c (dialogs + index exit), o, r, l, d (`index.ts:1831-1858`;
   dialogs :487/:662/:884). Ctrl+T is free. STILL confirm no editor binding (`src/vendor/editor.ts`) + that
   the real terminal delivers it, at attended live-verify.
3. **`preview()` = source-line head/tail** (`src/components/xml-tool-output.ts:115`): head/tail by ARRAY
   ELEMENT, not rendered rows. For a true 3-ROW reasoning budget, render the reasoning Markdown to lines at
   width FIRST, then `preview(renderedRows, 3, omitted)`. (Tool cards apply it to their body lines similarly.)
4. **Schemastery enum/optional.** `z.const<T>(value)` (line 45 of the .d.ts) + `z.union([...])` (line 79)
   exist. `toolCardVisibility: z.union([z.const('hidden'),z.const('collapsed'),z.const('expanded')]).default('collapsed')`.
   `reasoningFold: z.union([z.const('off'),z.const('preview'),z.const('full')])` with NO `.default()` →
   resolves `undefined` when unset (precedent: `truecolor` at `config.ts:89`, `z.boolean()` no default).
5. **Overlay Component contract:** `DetailsDialog` (`src/components/dialogs.ts:444`) is the template —
   `handleInput(data)` (Esc/Ctrl+C close, Tab/keys), `render(width)`, `invalidate()`; opened via
   `overlayManager.open({create, options:{width,anchor,margin}})` (`index.ts:1330`). The Component owns its
   own scroll; confirm exact scroll idiom against an existing scrollable overlay when building C4.
6. **Scripts:** build `npm run build` (= `clean && tsc -p tsconfig.json && tsdown`); typecheck
   `tsc -p tsconfig.typecheck.json`; test `vitest run`. Spec files: `test/<name>.test.ts`.
7. **Reasoning render path is SHARED.** `StreamingAssistantComponent.renderLines` (`transcript.ts:399`) calls
   the SAME `assistantMessageChildren(content, showReasoning, …)` as the settled path (:197). Changing the
   helper's signature to `reasoningFold` updates BOTH; the streaming component's `showReasoning` (:296) +
   `setShowReasoning` (:359) become `reasoningFold` + `setReasoningFold`.
