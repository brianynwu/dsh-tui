/**
 * Interactive pi-tui front door for DeepSeek Harness agents. It renders the
 * durable session transcript, drives one configured agent, and provides
 * keyboard-driven user-interaction dialogs without owning agent lifecycle.
 * @module @deepseek-ai/dsh-tui
 */
import { Service, type Context } from '@deepseek-ai/cordis';
import { type Agent } from '@deepseek-ai/dsh-agent';
import type { TuiOverlayRequest, TuiOverlaySession } from './extension/types.ts';
import { type Config } from './config.ts';
import type { TuiRuntime } from './runtime.ts';
export { TuiPromptService } from './prompt.ts';
export { TuiDashboardService, type DashboardGroup, type DashboardMetric } from './dashboard.ts';
export { renderSkillInvocation } from './chat/skill-invocation.ts';
export type { TuiResumeHost, TuiRuntime } from './runtime.ts';
export { resolveTuiConfig, TuiConfigSchema, Config, type ResolvedTuiConfig, type ResolvedTuiThemeConfig, type TuiConfig, type TuiThemeConfig, } from './config.ts';
export { DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES, DEFAULT_FILE_SEARCH_MAX_ENTRIES, DEFAULT_FILE_SEARCH_MAX_RESULTS, } from './chat/file-autocomplete.ts';
export type { TuiComponent, TuiFocusable, TuiOverlayAnchor, TuiOverlayCloseReason, TuiOverlayHost, TuiOverlayMargin, TuiOverlayOptions, TuiOverlayOutcome, TuiOverlayRequest, TuiOverlaySession, TuiOverlayState, TuiTheme, TuiViewport, } from './extension/types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Terminal-only interaction service, available only while a TUI is mounted. */
        tui: TuiExtensionService;
    }
}
export { INITIAL_SKILL_KEY, MAIN_SESSION_ID_KEY, type MainSessionIdentity, } from './runtime.ts';
/**
 * Optional terminal-local interaction service provided by one mounted TUI.
 *
 * The concrete provider retains pi-tui, focus, and terminal lifecycle state.
 * Plugins receive only effect-owned overlay sessions.
 */
export declare abstract class TuiExtensionService extends Service {
    /** Exact agent driven by this terminal instance. */
    abstract readonly agent: Agent;
    /**
     * Queue an interactive overlay owned by the calling plugin fiber.
     *
     * The TUI displays one overlay at a time in FIFO order. Disposing the caller
     * removes a queued overlay or closes an active one before plugin teardown
     * settles. This live presentation is neither logged nor replayed.
     *
     * @param request - component factory, layout constraints, and cancellation.
     * @returns the effect-owned overlay session.
     * @throws when the TUI has begun shutting down.
     */
    abstract openOverlay(request: TuiOverlayRequest): TuiOverlaySession;
}
export declare const name = "ui-tui";
export declare const inject: string[];
/** Model guidance for path-only file references selected through the TUI. */
export declare const FILE_REFERENCE_PROMPT = "Paths prefixed with @ are files explicitly referenced by the user. Use the read tool when their contents are needed; do not claim to have inspected a file before reading it.";
/** Lifecycle handle for a mounted interactive terminal channel. */
export interface TuiController {
    /** Stop rendering, restore the terminal, and reject pending questions. */
    dispose(): Promise<void>;
}
/**
 * Start the interactive pi-tui channel for an already-created target agent.
 * @param ctx - agent, tools, session-event, and user-interaction context.
 * @param config - target agent, banner, and TUI presentation config.
 * @param runtime - terminal and process-exit boundary.
 * @returns lifecycle controller used by the Cordis effect disposer.
 */
export declare function createTuiChat(ctx: Context, config: Config, runtime: TuiRuntime): TuiController;
/**
 * Open the pi-tui channel once its configured agent exists.
 *
 * @param ctx - Context supplying the agent registry, tools, and event stream.
 * @param config - Target agent and presentation configuration.
 * @param runtime - Terminal and process-exit boundary.
 */
export declare function mountTui(ctx: Context, config: Config, runtime: TuiRuntime): void;
/**
 * Dispose the whole application before process exit, with a bounded fallback.
 * @param ctx - The TUI plugin context whose root owns sibling resources.
 * @param code - Process status to report.
 * @param exit - Exit boundary, replaceable by tests.
 */
export declare function disposeRootAndExit(ctx: Context, code: number, exit?: (status: number) => void): void;
/** Cordis entry point using the process terminal; explicit TUI composition requires a TTY pair. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map