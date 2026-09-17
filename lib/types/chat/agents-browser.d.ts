import type { TuiOverlayManager } from '../extension/overlay-manager.ts';
import type { TuiKeymap } from './keymap.ts';
import type { SubagentRow, SubagentSwitcher } from './subagents.ts';
import type { Palette } from '../components/theme.ts';
import type { TranscriptView } from './details.ts';
export interface AgentsBrowserDeps {
    switcher: SubagentSwitcher;
    overlays: TuiOverlayManager;
    keymap: TuiKeymap;
    palette: Palette;
    mainDetails(): TranscriptView;
    viewport(): {
        columns: number;
        rows: number;
    };
    focusChild(): void;
    isDisposed(): boolean;
}
export declare class AgentsBrowser {
    private readonly deps;
    private overlay;
    private picker;
    constructor(deps: AgentsBrowserDeps);
    open(): Promise<void>;
    setRows(rows: readonly SubagentRow[]): void;
    backFromChild(): void;
    private showPicker;
}
//# sourceMappingURL=agents-browser.d.ts.map