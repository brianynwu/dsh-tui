/** A narrow UI adapter over the core's permission-preset read side and /permission command. */
import type { Session } from '@deepseek-ai/dsh-session';
import type { Palette } from '../components/theme.ts';
export interface PermissionPresets {
    readonly names: readonly string[];
    current(session: Session): string;
}
export interface PermissionModeController {
    current(): string;
    label(): string;
    cycle(): Promise<void>;
}
/** Never maintain a shadow mode: every read comes from the core's effective state. */
export declare function createPermissionModeController(presets: PermissionPresets, session: Session, palette: Palette, runCommand: (text: string) => Promise<void>, notice: (text: string) => void): PermissionModeController;
//# sourceMappingURL=permission-mode.d.ts.map