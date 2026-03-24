/**
 * openclawWatcher.ts  — M4 bridge layer
 *
 * Scans `~/.openclaw/agents/` for session files, registers OpenClaw agents
 * into the shared `PixelAgentsViewProvider` state, and translates
 * `OpenClawParserEvent`s into the webview wire protocol.
 *
 * Design notes
 * ─────────────
 * • OpenClaw agent IDs start at `OPENCLAW_ID_BASE` (100 000) so they never
 *   collide with Claude Code agent IDs (which start at 1 and grow slowly).
 * • `persistAgents` is not called here; persistence is deferred to a future
 *   milestone.  On every VS Code restart `startOpenClawWatcher` re-discovers
 *   all sessions from disk, matching DECISIONS.md D6.
 * • The existing Claude Code `fileWatcher.ts` path is completely unaffected.
 *
 * See DECISIONS.md D5, D6, D8.
 */

import * as path from 'path';
import * as vscode from 'vscode';

import { OPENCLAW_AGENT_DIR, OPENCLAW_ID_BASE, PROJECT_SCAN_INTERVAL_MS } from './constants.js';
import type { OpenClawParserEvent } from './openclawTranscriptParser.js';
import { listOpenClawAgents, watchOpenClawAgent } from './openclawTranscriptParser.js';
import { PixelAgentsViewProvider } from './PixelAgentsViewProvider.js';
import { formatToolStatus } from './transcriptParser.js';
import type { AgentState } from './types.js';

// ── Stable agentKey → numeric ID mapping ─────────────────────────────────────
// Module-level map ensures the same agentId+sessionKey always maps to the same
// numeric ID within a VS Code session, even across multiple rescans.
const openclawIdMap = new Map<string, number>();
let openclawIdCounter = OPENCLAW_ID_BASE;

function makeAgentKey(agentId: string, sessionKey: string): string {
  return `${agentId}:${sessionKey}`;
}

function getOrAssignNumericId(key: string): number {
  const existing = openclawIdMap.get(key);
  if (existing !== undefined) return existing;
  const id = openclawIdCounter++;
  openclawIdMap.set(key, id);
  return id;
}

// ── Per-agent tool-ID queues ──────────────────────────────────────────────────
// The webview wire protocol requires a unique `toolId` string per active tool
// invocation.  `OpenClawParserEvent` only carries a tool name, not a unique ID.
// We generate stable toolIds per start event and queue them per tool name so
// the corresponding done event can dequeue the oldest outstanding invocation.
//
//   toolIdQueues: numeric agentId → (toolName → FIFO queue of generated toolIds)

const toolIdQueues = new Map<number, Map<string, string[]>>();
let toolIdCounter = 0;

function nextToolId(toolName: string): string {
  return `openclaw-${toolName}-${++toolIdCounter}`;
}

function enqueueToolId(numericId: number, toolName: string, toolId: string): void {
  let agentQueues = toolIdQueues.get(numericId);
  if (!agentQueues) {
    agentQueues = new Map<string, string[]>();
    toolIdQueues.set(numericId, agentQueues);
  }
  const arr = agentQueues.get(toolName) ?? [];
  arr.push(toolId);
  agentQueues.set(toolName, arr);
}

function dequeueToolId(numericId: number, toolName: string): string | undefined {
  const agentQueues = toolIdQueues.get(numericId);
  if (!agentQueues) return undefined;
  const arr = agentQueues.get(toolName);
  if (!arr || arr.length === 0) return undefined;
  return arr.shift();
}

function clearToolQueues(numericId: number): void {
  toolIdQueues.delete(numericId);
}

// ── AgentState builder ────────────────────────────────────────────────────────

function buildOpenClawAgent(numericId: number, agentId: string, sessionKey: string): AgentState {
  const jsonlFile = path.join(OPENCLAW_AGENT_DIR, agentId, 'sessions', `${sessionKey}.jsonl`);
  return {
    id: numericId,
    source: 'openclaw',
    agentId,
    sessionKey,
    projectDir: path.join(OPENCLAW_AGENT_DIR, agentId),
    jsonlFile,
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
  };
}

// ── Event bridge ──────────────────────────────────────────────────────────────
//
// Translates an `OpenClawParserEvent` (M3 output) → webview wire protocol (M4).
//
//   Parser field / value   →   Webview protocol field / value
//   ─────────────────────────────────────────────────────────
//   agentId  (string)      →   id  (number)           via stable openclawIdMap
//   status: 'working'      →   status: 'active'
//   status: 'idle'         →   status: 'waiting'
//   agentToolStart         →   { type:'agentToolStart', id, toolId, status }
//   agentToolDone          →   { type:'agentToolDone',  id, toolId }
//
// Agent state (`activeToolStatuses`, `isWaiting`) is updated even when the
// webview is not yet ready, so `sendCurrentAgentStatuses` will reflect the
// correct live state when the webview eventually connects.

function handleParserEvent(
  event: OpenClawParserEvent,
  numericId: number,
  agent: AgentState,
  webview: vscode.Webview | undefined,
): void {
  if (event.type === 'agentStatus') {
    if (event.status === 'working') {
      agent.isWaiting = false;
      webview?.postMessage({ type: 'agentStatus', id: numericId, status: 'active' });
    } else if (event.status === 'idle') {
      agent.isWaiting = true;
      webview?.postMessage({ type: 'agentStatus', id: numericId, status: 'waiting' });
    }
    // 'error' has no direct webview equivalent — silently ignored for now
    return;
  }

  if (event.type === 'agentToolStart') {
    // Parse the JSON-serialised input back to a plain object for formatToolStatus
    let parsedInput: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(event.input);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedInput = parsed as Record<string, unknown>;
      }
    } catch {
      /* keep empty object on parse failure */
    }

    const status = formatToolStatus(event.tool, parsedInput);
    const toolId = nextToolId(event.tool);

    // Update agent state (used by sendCurrentAgentStatuses for replay on reconnect)
    agent.activeToolStatuses.set(toolId, status);
    agent.activeToolNames.set(toolId, event.tool);
    enqueueToolId(numericId, event.tool, toolId);

    webview?.postMessage({ type: 'agentToolStart', id: numericId, toolId, status });
    return;
  }

  if (event.type === 'agentToolDone') {
    // Dequeue the oldest outstanding toolId for this tool name
    const toolId = dequeueToolId(numericId, event.tool);
    if (!toolId) {
      // No outstanding invocation — orphan done event, safe to ignore
      return;
    }

    agent.activeToolStatuses.delete(toolId);
    agent.activeToolNames.delete(toolId);

    webview?.postMessage({ type: 'agentToolDone', id: numericId, toolId });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start watching all OpenClaw agent sessions under `OPENCLAW_AGENT_DIR`.
 *
 * Behaviour
 * ─────────
 * - Performs an initial async scan immediately on call.
 * - Rescans every `PROJECT_SCAN_INTERVAL_MS` to discover new sessions.
 * - For each discovered `{ agentId, sessionKey }` pair:
 *     1. Assigns a stable numeric ID (≥ `OPENCLAW_ID_BASE`) via `openclawIdMap`.
 *     2. Creates an `AgentState` with `source: 'openclaw'` and registers it
 *        in `provider.agents`.
 *     3. Posts `{ type: 'agentCreated', id }` to the webview (if ready).
 *     4. Starts a `watchOpenClawAgent` watcher that bridges parser events to
 *        the webview wire protocol via `handleParserEvent`.
 * - Returns a `vscode.Disposable`; calling `dispose()` stops all watching and
 *   cleans up resources.  The existing Claude Code watcher is unaffected.
 *
 * ID partitioning
 * ───────────────
 * Claude Code agents use IDs 1, 2, 3 … (from `nextAgentId`).
 * OpenClaw agents use IDs 100 000, 100 001 … (from `openclawIdCounter`).
 * This prevents collisions when `restoreAgents()` replays persisted claude-code
 * agents into `provider.agents` on `webviewReady`.
 *
 * @param provider The shared `PixelAgentsViewProvider` instance.
 * @returns        A `vscode.Disposable` that stops the watcher when disposed.
 */
export function startOpenClawWatcher(provider: PixelAgentsViewProvider): vscode.Disposable {
  const sessionDisposables = new Map<string, vscode.Disposable>();
  let disposed = false;

  function registerSession(agentId: string, sessionKey: string): void {
    const key = makeAgentKey(agentId, sessionKey);
    if (sessionDisposables.has(key)) return; // already watching

    const numericId = getOrAssignNumericId(key);
    const agent = buildOpenClawAgent(numericId, agentId, sessionKey);
    provider.agents.set(numericId, agent);

    // Post agentCreated only if the webview is already connected.
    // If not yet ready, sendExistingAgents() will broadcast it later.
    provider.webviewView?.webview.postMessage({ type: 'agentCreated', id: numericId });

    const disposable = watchOpenClawAgent(agentId, sessionKey, (event: OpenClawParserEvent) => {
      handleParserEvent(event, numericId, agent, provider.webviewView?.webview);
    });
    sessionDisposables.set(key, disposable);

    console.log(
      `[Pixel Agents/OpenClaw] Registered ${agentId}/${sessionKey} → numeric id ${numericId}`,
    );
  }

  function scan(): void {
    void listOpenClawAgents().then((sessions) => {
      if (disposed) return;
      for (const { agentId, sessionKey } of sessions) {
        registerSession(agentId, sessionKey);
      }
    });
  }

  // Kick off the first scan immediately
  scan();

  // Periodic rescan — picks up new sessions created while VS Code is open
  const scanTimer = setInterval(scan, PROJECT_SCAN_INTERVAL_MS);

  return {
    dispose(): void {
      disposed = true;
      clearInterval(scanTimer);

      for (const [key, disposable] of sessionDisposables) {
        disposable.dispose();
        // Clean up module-level tool queues for this session
        const numericId = openclawIdMap.get(key);
        if (numericId !== undefined) {
          clearToolQueues(numericId);
        }
      }
      sessionDisposables.clear();

      console.log('[Pixel Agents/OpenClaw] Watcher disposed');
    },
  };
}
