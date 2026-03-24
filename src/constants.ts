// ── Timing (ms) ──────────────────────────────────────────────
export const JSONL_POLL_INTERVAL_MS = 1000;
export const FILE_WATCHER_POLL_INTERVAL_MS = 1000;
export const PROJECT_SCAN_INTERVAL_MS = 1000;
export const TOOL_DONE_DELAY_MS = 300;
export const PERMISSION_TIMER_DELAY_MS = 7000;
export const TEXT_IDLE_DELAY_MS = 5000;

// ── Display Truncation ──────────────────────────────────────
export const BASH_COMMAND_DISPLAY_MAX_LENGTH = 30;
export const TASK_DESCRIPTION_DISPLAY_MAX_LENGTH = 40;

// ── User-Level Layout Persistence ─────────────────────────────
export const LAYOUT_FILE_DIR = '.pixel-agents';
export const LAYOUT_FILE_NAME = 'layout.json';
export const CONFIG_FILE_NAME = 'config.json';
export const LAYOUT_FILE_POLL_INTERVAL_MS = 2000;
export const LAYOUT_REVISION_KEY = 'layoutRevision';

// ── Settings Persistence ────────────────────────────────────
export const GLOBAL_KEY_SOUND_ENABLED = 'pixel-agents.soundEnabled';

// ── VS Code Identifiers ─────────────────────────────────────
export const VIEW_ID = 'pixel-agents.panelView';
export const COMMAND_SHOW_PANEL = 'pixel-agents.showPanel';
export const COMMAND_EXPORT_DEFAULT_LAYOUT = 'pixel-agents.exportDefaultLayout';
export const WORKSPACE_KEY_AGENTS = 'pixel-agents.agents';
export const WORKSPACE_KEY_AGENT_SEATS = 'pixel-agents.agentSeats';
export const WORKSPACE_KEY_LAYOUT = 'pixel-agents.layout';
export const TERMINAL_NAME_PREFIX = 'Claude Code';

// ── OpenClaw Integration ────────────────────────────────────
import * as os from 'os';
import * as path from 'path';
export const OPENCLAW_AGENT_DIR = path.join(os.homedir(), '.openclaw', 'agents');
/** Silence threshold (ms) for turn-end detection in OpenClaw sessions (no turn_duration signal). */
export const OPENCLAW_IDLE_DELAY_MS = 500;
/**
 * Numeric ID base for OpenClaw agents.
 * OpenClaw agent IDs are allocated from this floor upward, keeping them
 * well above the Claude Code agent range (which starts at 1 and grows
 * incrementally). This prevents ID collisions when restoreAgents() replays
 * persisted Claude Code agents on webview ready.
 */
export const OPENCLAW_ID_BASE = 100000;
/**
 * Numeric ID floor for OpenClaw agents used by both openclawWatcher (allocation)
 * and agentManager (restoreAgents guard). Single source of truth.
 */
export const OPENCLAW_AGENT_ID_START = 10000;
