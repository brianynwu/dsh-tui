/** Composer shortcuts owned by dsh-tui. pi-tui's editor and modal bindings stay in their own components. */
import { type KeyId } from '@earendil-works/pi-tui';
export declare const DEFAULT_KEYS: Readonly<{
    readonly cards: "ctrl+t";
    readonly tools: "ctrl+o";
    readonly reasoning: "ctrl+r";
    readonly redraw: "ctrl+l";
    readonly cancel: "escape";
    readonly interruptOrExit: "ctrl+c";
    readonly exit: "ctrl+d";
    readonly cyclePermission: "shift+tab";
    readonly agents: "ctrl+g";
    readonly subagentPrev: "left";
    readonly subagentNext: "right";
    readonly subagentBack: "escape";
}>;
export type TuiAction = keyof typeof DEFAULT_KEYS;
export type TuiKeyBindings = Partial<Record<TuiAction, string>>;
export type ResolvedTuiKeys = Readonly<Record<TuiAction, KeyId>>;
export type TuiKeyContext = 'composer' | 'subagentStrip' | 'modal';
/** Validate and canonicalize pi-tui's KeyId grammar before passing it to matchesKey. */
export declare function parseBinding(value: string): KeyId;
/** Reject an entire replacement map if any binding is invalid or a safety action is unreachable. */
export declare function resolveKeymap(overrides: Record<string, string> | undefined): ResolvedTuiKeys;
/** One atomic in-memory replacement for a config reload. Invalid maps leave the last good map active. */
export declare class TuiKeymap {
    private current;
    constructor(overrides?: Record<string, string>);
    replace(overrides: Record<string, string>): void;
    binding(action: TuiAction): KeyId;
    resolve(data: string, context?: TuiKeyContext): TuiAction | undefined;
}
//# sourceMappingURL=keymap.d.ts.map