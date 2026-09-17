/** Read-only child catalog and transcript view for the main agent's durable direct children. */
import { Container, type Component } from '@earendil-works/pi-tui';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent, AgentStatus, AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import { type SessionEvent, type SessionId } from '@deepseek-ai/dsh-session';
import type { SubagentListEntry } from '@deepseek-ai/dsh-subagent';
import { type Palette } from '../components/theme.ts';
import type { ResolvedTuiConfig } from '../config.ts';
export type SubagentOriginType = 'standard' | 'fork' | 'unknown';
export type SubagentRow = SubagentListEntry & {
    readonly execution?: AgentStatus;
    readonly originType?: SubagentOriginType;
};
/** Durable listing is authoritative for lineage; runtime ownership only qualifies active status. */
export declare function projectSubagents(entries: readonly SubagentListEntry[], ctx: Context, main: Agent): SubagentRow[];
/** A separate component tree; its events never pass through the main transcript reducer. */
export declare class ChildTranscript extends Container {
    readonly childId: SessionId;
    private readonly palette;
    private readonly resolved;
    private readonly events;
    private readonly tools;
    private readonly steps;
    private readonly stream;
    private readonly timing;
    private readonly mdTheme;
    private cursor;
    private activePosition;
    constructor(childId: SessionId, label: string | undefined, palette: Palette, resolved: ResolvedTuiConfig);
    get lastSequence(): number;
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