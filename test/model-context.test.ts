/**
 * Regression for the context-window resolution race in createModelController.
 *
 * The adapter can register AFTER the TUI mounts (service-driven activation), so
 * the initial resolveModelInfo rejects NO_ADAPTER. Resolution must recover on a
 * later `llm/adapters-updated` commit — INCLUDING the commit that fires before
 * the initial rejection has landed, which the previous `awaitingAdapter` gate
 * dropped (leaving `${context}` blank for the whole session).
 */
import { describe, it, expect, vi } from 'vitest'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import { createModelController, type ModelControllerDeps } from '../src/chat/model-command.ts'

const WINDOW = 1_048_576

/** Flush pending microtasks so `.then` chains settle. */
const flush = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await Promise.resolve() }

function harness(resolveModelInfo: (p: string, m: string) => Promise<{ context?: { contextWindow?: number } }>) {
  let adaptersUpdated: () => void = () => {}
  const target: ModelSelectionRef = { current: { provider: 'openrouter', model: 'm' }, assembled: undefined }
  const ctx = {
    llm: { resolveModelInfo },
    on: (event: string, handler: () => void) => {
      if (event === 'llm/adapters-updated') adaptersUpdated = handler
      return () => {}
    },
  }
  const deps = {
    ctx,
    target,
    appendNotice: vi.fn(),
    requestRender: vi.fn(),
    isDisposed: () => false,
  } as unknown as ModelControllerDeps
  const controller = createModelController(deps)
  return { controller, fireAdaptersUpdated: () => adaptersUpdated(), deps }
}

describe('createModelController context-window resolution', () => {
  it('recovers on a later adapters-updated after an initial NO_ADAPTER', async () => {
    let calls = 0
    const { controller, fireAdaptersUpdated } = harness(async () => {
      calls += 1
      if (calls === 1) throw new LlmError('no adapter yet', 'NO_ADAPTER')
      return { context: { contextWindow: WINDOW } }
    })
    await flush()
    expect(controller.contextWindow()).toBeUndefined() // still awaiting the adapter

    fireAdaptersUpdated()
    await flush()
    expect(controller.contextWindow()).toBe(WINDOW)
  })

  it('does not drop an adapters-updated that fires before the initial rejection lands', async () => {
    // The race: the commit that registers the adapter arrives while the first
    // resolveModelInfo is still pending. The fix retries whenever the window is
    // unresolved, so this event is honored rather than gated out.
    let calls = 0
    let releaseFirst: (v: { context?: { contextWindow?: number } }) => void = () => {}
    let rejectFirst: (e: unknown) => void = () => {}
    const { controller, fireAdaptersUpdated } = harness((_p, _m) => {
      calls += 1
      if (calls === 1) return new Promise((res, rej) => { releaseFirst = res; rejectFirst = rej })
      return Promise.resolve({ context: { contextWindow: WINDOW } })
    })
    // Fire the topology commit BEFORE the first call settles.
    fireAdaptersUpdated()
    await flush()
    // The second (post-commit) resolution supersedes and populates the window…
    expect(controller.contextWindow()).toBe(WINDOW)
    // …even if the first call later rejects: its stale `.then` is dropped.
    rejectFirst(new LlmError('late', 'NO_ADAPTER'))
    releaseFirst({ context: { contextWindow: 1 } })
    await flush()
    expect(controller.contextWindow()).toBe(WINDOW)
  })

  it('surfaces a hard error once and stops auto-retrying on topology churn', async () => {
    const { controller, fireAdaptersUpdated, deps } = harness(async () => {
      throw new LlmError('boom', 'AUTH')
    })
    await flush()
    expect(controller.contextWindow()).toBeUndefined()
    expect(deps.appendNotice).toHaveBeenCalledTimes(1)
    fireAdaptersUpdated()
    await flush()
    expect(deps.appendNotice).toHaveBeenCalledTimes(1) // not re-emitted
  })
})
