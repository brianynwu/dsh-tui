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

import {
  type Component,
  truncateToWidth,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  visibleWidth,
} from '@earendil-works/pi-tui'
import type { DashboardGroup } from '../dashboard.ts'
import type { Palette } from './theme.ts'

/** Pad a possibly-ANSI string to a visible column width (right-fill with spaces). */
function padVisible(text: string, width: number): string {
  const fill = Math.max(0, width - visibleWidth(text))
  return `${text}${' '.repeat(fill)}`
}

/** Render one group's lines: a title line (omitted when the title is empty) over `label value` rows. */
function groupLines(group: DashboardGroup, palette: Palette): string[] {
  const rows = group.metrics.map(m => `${palette.dim(m.label)} ${m.value ?? palette.dim('—')}`)
  return group.title === '' ? rows : [palette.bold(palette.accent(group.title)), ...rows]
}

/**
 * Partition groups into visual columns: groups sharing a `column` key stack into
 * ONE column, in first-seen order; a group with no `column` is its own column.
 * First-seen order is preserved for BOTH column position and within-column
 * stacking (the service store is insertion-ordered), so a producer's column and
 * row placement stays stable across value churn.
 */
function columnsOf(groups: readonly DashboardGroup[]): DashboardGroup[][] {
  const columns: DashboardGroup[][] = []
  const byKey = new Map<string, DashboardGroup[]>()
  for (const group of groups) {
    if (group.column === undefined) {
      columns.push([group]) // own column
      continue
    }
    let bucket = byKey.get(group.column)
    if (bucket === undefined) {
      bucket = []
      byKey.set(group.column, bucket)
      columns.push(bucket) // reserve this column's position at first sight
    }
    bucket.push(group)
  }
  return columns
}

/** Lay a column (one or more stacked groups) out as fixed-width lines. */
function renderColumn(groupList: DashboardGroup[], palette: Palette): { lines: string[]; width: number } {
  const lines = groupList.flatMap(group => groupLines(group, palette))
  const width = lines.reduce((max, line) => Math.max(max, visibleWidth(line)), 0)
  return { lines: lines.map(line => padVisible(line, width)), width }
}

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
export class DashboardPane implements Component {
  private collapsed = false

  constructor(
    private readonly groups: () => readonly DashboardGroup[],
    private readonly palette: Palette,
  ) {}

  invalidate(): void {}

  /**
   * Toggle collapse on a left click anywhere on the pane. Non-left / non-click
   * events return `undefined` so they keep propagating (the pane never captures
   * scroll or selection).
   */
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type === 'click' && event.button === 'left') {
      this.collapsed = !this.collapsed
      return { handled: true, render: true }
    }
    return undefined
  }

  render(width: number): string[] {
    const palette = this.palette
    // Final clamp: truncate an over-wide line, then pad back to exactly `width`,
    // so every returned line is `width` visible columns on any terminal size —
    // the box chrome can no longer overflow a narrow viewport.
    const fit = (line: string): string => padVisible(truncateToWidth(line, width, ''), width)

    if (this.collapsed) {
      const label = `${palette.dim('▸')} ${palette.bold('runtime')}`
      const hint = palette.dim('tap to expand')
      const gap = ' '.repeat(Math.max(1, width - visibleWidth(label) - visibleWidth(hint)))
      return [fit(`${label}${gap}${hint}`)]
    }

    const groups = this.groups()
    const innerWidth = Math.max(1, width - 4)
    // `▾` marks the pane as collapsible; the whole row (indeed the whole pane) is
    // the click target, so the glyph is a hint, not a hit-box.
    const top = `╭─ ${palette.dim('▾')} ${palette.bold('runtime')} `
    const topRule = fit(`${top}${palette.dim('─'.repeat(Math.max(0, width - visibleWidth(top) - 1)))}${palette.dim('╮')}`)
    const bottomRule = fit(palette.dim(`╰${'─'.repeat(Math.max(0, width - 2))}╯`))
    if (groups.length === 0) {
      const empty = padVisible(palette.dim('no metrics yet'), innerWidth)
      return [topRule, fit(`${palette.dim('│')} ${empty} ${palette.dim('│')}`), bottomRule]
    }
    const columns = columnsOf(groups).map(groupList => renderColumn(groupList, palette))
    const height = columns.reduce((max, col) => Math.max(max, col.lines.length), 0)
    const separator = ` ${palette.dim('│')} `
    const body: string[] = []
    for (let row = 0; row < height; row += 1) {
      const cells = columns.map(col => col.lines[row] ?? ' '.repeat(col.width))
      const joined = truncateToWidth(cells.join(separator), innerWidth, '')
      body.push(fit(`${palette.dim('│')} ${padVisible(joined, innerWidth)} ${palette.dim('│')}`))
    }
    return [topRule, ...body, bottomRule]
  }
}
