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
import { Context, Service } from '@deepseek-ai/cordis';
export declare const name = "tui-dashboard";
/** One metric: a label and its current rendered value (undefined = unavailable). */
export interface DashboardMetric {
    readonly label: string;
    readonly value: string | undefined;
}
/** One named group of metrics rendered as a column of the pane. */
export interface DashboardGroup {
    readonly title: string;
    readonly metrics: readonly DashboardMetric[];
    /**
     * Optional column key. Groups sharing a `column` render STACKED (top to
     * bottom) in one pane column, in first-set order; a group with no `column` is
     * its own column (the default). Lets an in-fork group (e.g. session) and an
     * out-of-fork producer's group (e.g. the orproxy provider/cost bridge) share a
     * visual column while each stays owned by its own producer.
     */
    readonly column?: string;
}
/** Removes a change subscription registered with {@link TuiDashboardService.subscribe}. */
export type TuiDashboardUnsubscribe = () => void;
declare module '@deepseek-ai/cordis' {
    interface Context {
        dashboard: TuiDashboardService;
    }
}
/**
 * Context-global structured metric groups the dashboard pane renders. A set or
 * clear schedules one coalesced notification to the pane subscribed with
 * {@link TuiDashboardService.subscribe}. Groups render in first-set order, so a
 * producer's column position is stable across value churn.
 */
export declare class TuiDashboardService extends Service {
    private readonly store;
    private readonly listeners;
    private notificationQueued;
    constructor(ctx: Context);
    /**
     * Publish or replace one group's metrics; `undefined` clears it. Setting a
     * group to an identical-by-reference value is NOT deduplicated (producers
     * build a fresh record per tick), so callers pass a new object only when
     * something changed, or accept a coalesced redraw.
     * @param key - Stable group identifier (column identity).
     * @param group - The group's title and metrics, or `undefined` to remove it.
     */
    setGroup(key: string, group: DashboardGroup | undefined): void;
    /** Current groups in first-set order. */
    groups(): readonly DashboardGroup[];
    /**
     * Observe group changes. The listener runs after a coalesced microtask
     * following any burst of mutations; it is owned by the calling Cordis effect
     * and removed when that fiber disposes. Listener failures are contained.
     * @param listener - Invoked once per coalesced change burst.
     * @returns A disposer that removes the subscription.
     */
    subscribe(listener: () => unknown): TuiDashboardUnsubscribe;
    private scheduleChange;
    private notifyOne;
}
export default TuiDashboardService;
//# sourceMappingURL=dashboard.d.ts.map