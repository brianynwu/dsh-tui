/**
 * Structured metric registry for the runtime dashboard pane (viability spike).
 *
 * A producer publishes one named GROUP of label/value metrics; the pane reads
 * the current snapshot and repaints on a coalesced change notification, so a
 * value that changes on its own schedule (a streaming turn, an out-of-band
 * provider stat) still redraws without a UI event. Unlike {@link TuiPromptService}
 * — flat string fragments interpolated into a template line — this carries the
 * grouped, multi-field shape a panel needs, and is the seam a Foundry-side
 * plugin (the orproxy provider/cost bridge) pushes into.
 * @module @deepseek-ai/dsh-tui/dashboard
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { errorChain } from '@deepseek-ai/dsh-llm'

export const name = 'tui-dashboard'

/** One metric: a label and its current rendered value (undefined = unavailable). */
export interface DashboardMetric {
  readonly label: string
  readonly value: string | undefined
}

/** One named group of metrics rendered as a column of the pane. */
export interface DashboardGroup {
  readonly title: string
  readonly metrics: readonly DashboardMetric[]
}

/** Removes a change subscription registered with {@link TuiDashboardService.subscribe}. */
export type TuiDashboardUnsubscribe = () => void

declare module '@deepseek-ai/cordis' {
  interface Context {
    dashboard: TuiDashboardService
  }
}

/**
 * Context-global structured metric groups the dashboard pane renders. A set or
 * clear schedules one coalesced notification to the pane subscribed with
 * {@link TuiDashboardService.subscribe}. Groups render in first-set order, so a
 * producer's column position is stable across value churn.
 */
export class TuiDashboardService extends Service {
  // Insertion-ordered: a group keeps its column once first set, even as its
  // metrics change, so the panel does not reshuffle mid-turn.
  private readonly store = new Map<string, DashboardGroup>()
  private readonly listeners = new Set<{ readonly listener: () => unknown }>()
  private notificationQueued = false

  constructor(ctx: Context) {
    super(ctx, 'dashboard')
  }

  /**
   * Publish or replace one group's metrics; `undefined` clears it. Setting a
   * group to an identical-by-reference value is NOT deduplicated (producers
   * build a fresh record per tick), so callers pass a new object only when
   * something changed, or accept a coalesced redraw.
   * @param key - Stable group identifier (column identity).
   * @param group - The group's title and metrics, or `undefined` to remove it.
   */
  setGroup(key: string, group: DashboardGroup | undefined): void {
    if (group === undefined) {
      if (!this.store.delete(key)) return
    } else {
      this.store.set(key, group)
    }
    this.scheduleChange()
  }

  /** Current groups in first-set order. */
  groups(): readonly DashboardGroup[] {
    return [...this.store.values()]
  }

  /**
   * Observe group changes. The listener runs after a coalesced microtask
   * following any burst of mutations; it is owned by the calling Cordis effect
   * and removed when that fiber disposes. Listener failures are contained.
   * @param listener - Invoked once per coalesced change burst.
   * @returns A disposer that removes the subscription.
   */
  subscribe(listener: () => unknown): TuiDashboardUnsubscribe {
    const record = { listener }
    const disposeEffect = this.ctx.effect(() => {
      this.listeners.add(record)
      return () => { this.listeners.delete(record) }
    }, 'tuiDashboard.subscribe')
    return () => { void disposeEffect() }
  }

  private scheduleChange(): void {
    if (this.notificationQueued) return
    this.notificationQueued = true
    queueMicrotask(() => {
      this.notificationQueued = false
      for (const record of [...this.listeners]) {
        if (this.listeners.has(record)) this.notifyOne(record.listener)
      }
    })
  }

  private notifyOne(listener: () => unknown): void {
    let returned: unknown
    try {
      returned = listener()
    } catch (error: unknown) {
      this.ctx.logger.warn(`tui-dashboard change listener threw: ${errorChain(error)}`)
      return
    }
    void Promise.resolve(returned).catch((error: unknown) => {
      this.ctx.logger.warn(`tui-dashboard change listener rejected: ${errorChain(error)}`)
    })
  }
}

export default TuiDashboardService
