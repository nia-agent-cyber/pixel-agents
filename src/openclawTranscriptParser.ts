/**
 * openclawTranscriptParser.ts
 *
 * Parses OpenClaw pi-coding-agent JSONL session files and emits WebviewMessages
 * using the same protocol shape as the Claude Code transcript parser, so the
 * existing pixel-agents webview can animate OpenClaw agents without changes.
 *
 * OpenClaw JSONL format differs from Claude Code's:
 *   - Messages use `{ type: 'message', message: { role, content } }` wrapper
 *   - Tool results use `role: 'toolResult'` with `toolCallId` (not `tool_result` content blocks)
 *   - No `type: 'system', subtype: 'turn_duration'` end-of-turn signal
 *     → turn end is detected by OPENCLAW_IDLE_DELAY_MS of silence
 *
 * See DECISIONS.md D4, D5, D7 for architectural rationale.
 */

import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';

import {
  FILE_WATCHER_POLL_INTERVAL_MS,
  OPENCLAW_AGENT_DIR,
  OPENCLAW_IDLE_DELAY_MS,
  TOOL_DONE_DELAY_MS,
} from './constants.js';

// ── Tool name mapping ─────────────────────────────────────────────────────────
// Maps raw OpenClaw tool names to display names for webview messages (D7).
// Tools not in this map pass through as-is.
const OPENCLAW_TOOL_MAP: Record<string, string> = {
  Read: 'read_file',
  Write: 'write_file',
  Edit: 'edit_file',
  exec: 'run_command',
  web_search: 'web_search',
  web_fetch: 'web_fetch',
  browser: 'browser_action',
};

function mapToolName(raw: string): string {
  return OPENCLAW_TOOL_MAP[raw] ?? raw;
}

// ── Webview message types ─────────────────────────────────────────────────────

/** Messages emitted by watchOpenClawAgent for consumption by the webview layer. */
export type WebviewMessage =
  | { type: 'agentToolStart'; agentId: string; tool: string; input: string }
  | { type: 'agentToolDone'; agentId: string; tool: string; result: string }
  | { type: 'agentStatus'; agentId: string; status: 'working' | 'idle' | 'error' };

// ── Internal parser state ─────────────────────────────────────────────────────

interface ParserState {
  /** Byte offset into the JSONL file — only new bytes are read on each tick. */
  fileOffset: number;
  /** Partial line buffer for incomplete trailing lines. */
  lineBuffer: string;
  /** Active tool calls: toolCallId → mapped display name. */
  pendingTools: Map<string, string>;
  /** Silence-based idle timer handle (null when no timer is running). */
  idleTimer: ReturnType<typeof setTimeout> | null;
}

function createParserState(): ParserState {
  return {
    fileOffset: 0,
    lineBuffer: '',
    pendingTools: new Map(),
    idleTimer: null,
  };
}

function clearIdleTimer(state: ParserState): void {
  if (state.idleTimer !== null) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
}

function scheduleIdleTimer(
  state: ParserState,
  agentId: string,
  emit: (msg: WebviewMessage) => void,
): void {
  clearIdleTimer(state);
  state.idleTimer = setTimeout(() => {
    state.idleTimer = null;
    // Only emit idle if all tool calls have resolved
    if (state.pendingTools.size === 0) {
      emit({ type: 'agentStatus', agentId, status: 'idle' });
    }
  }, OPENCLAW_IDLE_DELAY_MS);
}

// ── Line-level parser ─────────────────────────────────────────────────────────

function processLine(
  line: string,
  agentId: string,
  state: ParserState,
  emit: (msg: WebviewMessage) => void,
): void {
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return; // skip malformed lines
  }

  // OpenClaw JSONL always wraps in `type: 'message'`
  if (record.type !== 'message') return;

  const msg = record.message as Record<string, unknown> | undefined;
  if (!msg) return;

  const role = msg.role as string | undefined;

  if (role === 'assistant') {
    const content = msg.content;
    if (!Array.isArray(content)) return;

    const blocks = content as Array<Record<string, unknown>>;
    const hasToolUse = blocks.some((b) => b.type === 'tool_use');

    if (hasToolUse) {
      // Cancel any pending idle — agent is actively using tools
      clearIdleTimer(state);
      emit({ type: 'agentStatus', agentId, status: 'working' });

      for (const block of blocks) {
        if (block.type !== 'tool_use') continue;

        const toolCallId = block.id as string | undefined;
        const rawName = (block.name as string | undefined) ?? '';
        const mappedName = mapToolName(rawName);
        const input = JSON.stringify(block.input ?? {});

        if (toolCallId) {
          state.pendingTools.set(toolCallId, mappedName);
        }

        emit({ type: 'agentToolStart', agentId, tool: mappedName, input });
      }
    } else {
      // Text-only assistant message — silence timer starts the idle countdown
      scheduleIdleTimer(state, agentId, emit);
    }
  } else if (role === 'toolResult') {
    // OpenClaw tool result: { role: 'toolResult', toolCallId, content }
    const toolCallId = msg.toolCallId as string | undefined;

    // Extract text from result content (may be array of blocks or plain string)
    let resultText = '';
    if (Array.isArray(msg.content)) {
      resultText = (msg.content as Array<Record<string, unknown>>)
        .filter((b) => b.type === 'text')
        .map((b) => String(b.text ?? ''))
        .join('\n');
    } else if (typeof msg.content === 'string') {
      resultText = msg.content;
    }

    const toolName = toolCallId ? (state.pendingTools.get(toolCallId) ?? '') : '';
    if (toolCallId) {
      state.pendingTools.delete(toolCallId);
    }

    // Emit done with a small delay (matches Claude Code parser's TOOL_DONE_DELAY_MS)
    const capturedTool = toolName;
    const capturedResult = resultText;
    setTimeout(() => {
      emit({ type: 'agentToolDone', agentId, tool: capturedTool, result: capturedResult });
    }, TOOL_DONE_DELAY_MS);

    // If all pending tools have resolved, schedule idle
    if (state.pendingTools.size === 0) {
      scheduleIdleTimer(state, agentId, emit);
    }
  } else if (role === 'user') {
    // New user turn — reset turn state; agent will be working or idle shortly
    clearIdleTimer(state);
    state.pendingTools.clear();
    emit({ type: 'agentStatus', agentId, status: 'idle' });
  }
}

// ── File reader ───────────────────────────────────────────────────────────────

function readNewLinesForSession(
  filePath: string,
  agentId: string,
  state: ParserState,
  emit: (msg: WebviewMessage) => void,
): void {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size <= state.fileOffset) return;

    const buf = Buffer.alloc(stat.size - state.fileOffset);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, buf.length, state.fileOffset);
    fs.closeSync(fd);
    state.fileOffset = stat.size;

    const text = state.lineBuffer + buf.toString('utf-8');
    const lines = text.split('\n');
    state.lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      processLine(line, agentId, state, emit);
    }
  } catch (e) {
    console.log(`[Pixel Agents/OpenClaw] Read error for ${agentId}: ${e}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Watch a single OpenClaw agent session JSONL file for new lines.
 *
 * Uses the same triple-redundant watching strategy as fileWatcher.ts:
 *   1. `fs.watch`     — event-based (unreliable on macOS but fast when it works)
 *   2. `fs.watchFile` — stat-based polling (reliable on macOS)
 *   3. `setInterval`  — manual poll as last resort
 *
 * The file is read from:
 *   `OPENCLAW_AGENT_DIR/<agentId>/sessions/<sessionKey>.jsonl`
 *
 * @param agentId    OpenClaw agent identifier (e.g. `'bakkt-coder'`)
 * @param sessionKey Session key — the bare filename without `.jsonl` extension
 * @param emit       Callback invoked for each WebviewMessage produced
 * @returns          A VS Code Disposable; call `.dispose()` to stop watching
 */
export function watchOpenClawAgent(
  agentId: string,
  sessionKey: string,
  emit: (msg: WebviewMessage) => void,
): vscode.Disposable {
  const filePath = path.join(OPENCLAW_AGENT_DIR, agentId, 'sessions', `${sessionKey}.jsonl`);
  const state = createParserState();

  let fsWatcher: fs.FSWatcher | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const onData = (): void => {
    readNewLinesForSession(filePath, agentId, state, emit);
  };

  // Primary: fs.watch (event-driven)
  try {
    fsWatcher = fs.watch(filePath, onData);
  } catch (e) {
    console.log(`[Pixel Agents/OpenClaw] fs.watch failed for ${agentId}/${sessionKey}: ${e}`);
  }

  // Secondary: fs.watchFile (stat-based, macOS-reliable)
  try {
    fs.watchFile(filePath, { interval: FILE_WATCHER_POLL_INTERVAL_MS }, onData);
  } catch (e) {
    console.log(`[Pixel Agents/OpenClaw] fs.watchFile failed for ${agentId}/${sessionKey}: ${e}`);
  }

  // Tertiary: manual interval poll
  pollInterval = setInterval(onData, FILE_WATCHER_POLL_INTERVAL_MS);

  // Initial read — parse any content already in the file
  onData();

  return {
    dispose(): void {
      clearIdleTimer(state);

      if (fsWatcher !== null) {
        try {
          fsWatcher.close();
        } catch {
          /* ignore */
        }
        fsWatcher = null;
      }

      try {
        fs.unwatchFile(filePath);
      } catch {
        /* ignore */
      }

      if (pollInterval !== null) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    },
  };
}

/**
 * List all OpenClaw agents and sessions present in `OPENCLAW_AGENT_DIR`.
 *
 * Scans `~/.openclaw/agents/<agentId>/sessions/*.jsonl` and returns
 * every discovered `{ agentId, sessionKey }` pair.
 *
 * Returns an empty array (not an error) if the directory doesn't exist yet.
 */
export async function listOpenClawAgents(): Promise<{ agentId: string; sessionKey: string }[]> {
  const results: { agentId: string; sessionKey: string }[] = [];

  let agentDirs: string[];
  try {
    agentDirs = fs.readdirSync(OPENCLAW_AGENT_DIR);
  } catch {
    // Directory doesn't exist yet — no agents registered
    return results;
  }

  for (const agentId of agentDirs) {
    const sessionsDir = path.join(OPENCLAW_AGENT_DIR, agentId, 'sessions');
    let sessionFiles: string[];
    try {
      sessionFiles = fs.readdirSync(sessionsDir);
    } catch {
      continue; // no sessions sub-directory for this agent
    }

    for (const file of sessionFiles) {
      if (!file.endsWith('.jsonl')) continue;
      const sessionKey = file.slice(0, -6); // strip '.jsonl'
      results.push({ agentId, sessionKey });
    }
  }

  return results;
}
