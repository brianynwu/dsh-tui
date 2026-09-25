/** Read-only child catalog and transcript view for the main agent's durable direct children. */
import { Container, type Component } from '@earendil-works/pi-tui';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent, AgentStatus, AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import { type SessionEvent, type SessionId } from '@deepseek-ai/dsh-session';
import type { SubagentCatalogEntry, SubagentListEntry } from '@deepseek-ai/dsh-subagent';
import { type Palette } from '../components/theme.ts';
import type { ResolvedTuiConfig } from '../config.ts';
import type { TranscriptView } from './details.ts';
export type SubagentOriginType = 'standard' | 'fork' | 'unknown';
/** One durable direct child, or a diagnostic for a catalog row the picker cannot open. */
export type SubagentEntry = {
    readonly kind: 'child';
    readonly id: SessionId;
    readonly mode: 'one-shot' | 'continuable';
    readonly label?: string;
} | Extract<SubagentListEntry, {
    kind: 'diagnostic';
}>;
export type SubagentRow = SubagentEntry & {
    readonly execution?: AgentStatus;
    readonly originType?: SubagentOriginType;
};
/**
 * Direct-child rows from the parent's durable catalog (`listChildren` returns raw catalog entries since
 * 0.1.7). An unknown mode becomes an `unsupported` diagnostic, as upstream's `listDescendants` maps it.
 */
export declare function catalogEntries(catalog: readonly SubagentCatalogEntry[]): SubagentEntry[];
/** Durable listing is authoritative for lineage; runtime ownership only qualifies active status. */
export declare function projectSubagents(entries: readonly SubagentEntry[], ctx: Context, main: Agent): SubagentRow[];
/** A separate component tree; its events never pass through the main transcript reducer. */
export declare class ChildTranscript extends Container {
    readonly childId: SessionId;
    private readonly palette;
    private readonly resolved;
    private readonly events;
    private readonly tools;
    private readonly allTools;
    private readonly contexts;
    private readonly steps;
    private readonly turnSteps;
    private readonly stream;
    private readonly timing;
    private readonly mdTheme;
    private cursor;
    private activePosition;
    private detailsState;
    constructor(childId: SessionId, label: string | undefined, palette: Palette, resolved: ResolvedTuiConfig, details: TranscriptView);
    get lastSequence(): number;
    setDetails(details: TranscriptView): void;
    private applyTurnFolding;
    /** Append exactly the next durable event; duplicates are harmless, gaps request a fresh observation. */
    addEvent(event: SessionEvent): 'added' | 'duplicate' | 'gap';
    replay(events: readonly SessionEvent[]): void;
    /** Ephemeral live chunks enrich the view; durable assistant/message settles the final content. */
    frame(frame: AssistantStreamFrame): void;
    private ensureStep;
}
export interface SubagentSwitcher {
    readonly rows: readonly SubagentRow[];
    readonly selectedId: SessionId | undefined;
    readonly details: TranscriptView;
    setDetails(details: TranscriptView): void;
    refresh(): Promise<void>;
    select(id: SessionId): boolean;
    back(): void;
    dispose(): void;
}
export interface SubagentSwitcherDeps {
    ctx: Context;
    main: Agent;
    palette: Palette;
    resolved: ResolvedTuiConfig;
    onRows(rows: readonly SubagentRow[], selectedId: SessionId | undefined): void;
    onView(view: Component | undefined): void;
    onRender(): void;
    onError(message: string): void;
}
/** Subscribe before observing, then merge the snapshot with buffered live events by sequence. */
export declare function createSubagentSwitcher(deps: SubagentSwitcherDeps): SubagentSwitcher;
//# sourceMappingURL=subagents.d.ts.map