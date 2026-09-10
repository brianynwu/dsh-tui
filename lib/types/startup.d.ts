/**
 * TUI command-line intake: parses the app arguments the dsh launcher hands
 * over, mints or resumes the `main` agent's session identity, and provides the
 * `tuiStartup` service the agent-loop and tui rows inject.
 * @module @brianynwu/dsh-tui/startup
 */
import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session';
/** Service key under which the parsed TUI launch options are provided. */
export declare const TUI_STARTUP_SERVICE = "tuiStartup";
/** Config `id` of the agent-loop entry the TUI drives. */
export declare const MAIN_AGENT_ID = "main";
/** Parsed TUI launch identity. */
export interface TuiStartup {
    /** Exact session id the `main` agent runs under, fresh or resumed. */
    readonly sessionId: SessionId;
    /** Whether the session resumes persisted history. */
    readonly resume: boolean;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        tuiStartup?: TuiStartup;
    }
}
export declare const name = "tui-startup";
export declare const inject: string[];
/**
 * Build the TUI command grammar, then provide the session identity for the
 * agent-loop row ({@link CONFIGURED_AGENT_IDENTITIES_KEY}) and the
 * {@link TuiStartup} service (whose `sessionId` the renderer expands into the
 * config-driven exit resume-hint). On `--help` or a usage error nothing is
 * provided, so the dependent rows never activate and the process exits through
 * the cmdline exit seam.
 * @param ctx - plugin context with `cmdlineArgs` injected
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=startup.d.ts.map