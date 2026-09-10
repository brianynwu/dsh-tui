/**
 * Bottom dashboard pane (viability spike): a pinned, bordered panel that renders
 * the {@link TuiDashboardService} snapshot as side-by-side metric columns and
 * repaints on the same cadence as the status line. Pure presentation of the
 * metrics — it holds no metric state, re-reading the service on every render —
 * plus one bit of view state: a click-to-toggle collapse for reclaiming screen
 * rows (mobile). Width comes from the layout each render, so the pane reflows
 * and re-clamps automatically on a terminal resize.
 * @module @deepseek-ai/dsh-tui/components/dashboard-pane
 */
import { type Component, type TuiMouseEvent, type TuiMouseEventResult } from '@earendil-works/pi-tui';
import type { DashboardGroup } from '../dashboard.ts';
import type { Palette } from './theme.ts';
/**
 * The runtime metrics pane. Reads {@link DashboardGroup}s from a getter each
 * render so a producer's mid-turn update shows on the next repaint, and derives
 * every line from the layout-supplied width so a resize reflows it with no
 * resize listener of its own.
 *
 * A left click anywhere on the pane toggles a one-line collapsed bar
 * ({@link handleMouse}); the whole pane is the tap target so a coarse touch
 * (mobile SSH) hits it. Collapse is local view state — it never touches the
 * metric service — so a click repaints only.
 */
export declare class DashboardPane implements Component {
    private readonly groups;
    private readonly palette;
    private collapsed;
    constructor(groups: () => readonly DashboardGroup[], palette: Palette);
    invalidate(): void;
    /**
     * Toggle collapse on a left click anywhere on the pane. Non-left / non-click
     * events return `undefined` so they keep propagating (the pane never captures
     * scroll or selection).
     */
    handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined;
    render(width: number): string[];
}
//# sourceMappingURL=dashboard-pane.d.ts.map