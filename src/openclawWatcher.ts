/**
 * openclawWatcher.ts
 *
 * Directory scanner and webview bridge for OpenClaw agent sessions.
 *
 * Periodically scans `~/.openclaw/agents/` for new agent/session combos,
 * registers each session as an AgentState with `source: 'openclaw'`, and
 * bridges OpenClawParserEvents into the webview wire protocol that the
 * existing pixel-agents React UI understands.
 *
 * Design notes (see DECISIONS.md):
 *  D5 — New file; fileWatcher.ts and transcriptParser.ts are untouched.
 *  D6 — OpenClaw agents are persisted by agentId + sessionKey, not terminalName.
 *  D7 — Tool names are already mapped by openclawTranscriptParser; we only need
 *        to call formatToolStatus() here to produce the display string.
 *  D8 — Auto-discovery on startup; no terminal is ever spawned for OpenClaw.
 */

import * as path from 'path';
import * as vscode from 'vscode';

import { persistAgents } from './agentManager.js';
import { OPENCLAW_AGENT_DIR, OPENCLAW_AGENT_ID_START } from './constants.js';
import type { OpenClawParserEvent } from './openclawTranscriptParser.js';
import { listOpenClawAgents, watchOpenClawAgent } from './openclawTranscriptParser.js';
import { formatToolStatus } from './transcriptParser.js';
import type { AgentState } from './types.js';

// ── Module-level constants ────────────────────────────────────────────────────

/**
 * How often (ms) to scan ~/.openclaw/agents/ for new agent/session combos.
 * Would normally live in constants.ts but M4 cannot modify existing files.
 */
const OPENCLAW_SCAN_INTERVAL_MS = 5000;

// ── Minimal host interface ────────────────────────────────────────────────────

/**
 * Subset of PixelAgentsViewProvider that openclawWatcher needs.
 * Structural typing keeps the coupling minimal (D5).
 */
interface AgentHost {
  /** Live map of all registered agents (numeric id → state). */
  agents: Map<number, AgentState>;
  /** The VS Code webview panel; undefined until the user opens the panel. */
  webviewView: vscode.WebviewView | undefined;
}

// ── Module-level state ────────────────────────────────────────────────────────

/** Counter for assigning numeric IDs to newly discovered OpenClaw sessions. */
let nextOpenClawId = OPENCLAW_AGENT_ID_START;

/** Periodic directory-scan timer. */
let scanInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Active JSONL-watcher disposables, keyed by `"${agentId}/${sessionKey}"`.
 * A key present here means we are already watching that session.
 */
const activeWatchers = new Map<string, vscode.Disposable>();

/**
 * Per-agent tool-name → toolId tracking map.
 *
 * The OpenClaw parser emits agentToolStart / agentToolDone events keyed by
 * display tool name (not by toolCallId), so we correlate them here.
 * If two invocations of the same tool overlap (rare), the last started wins.
 *
 * Outer key: numeric agent id.
 * Inner key: display tool name (e.g. 'Bash', 'Read').
 * Value:     the generated toolId string sent to the webview.
 */
const toolIdByAgent = new Map<number, Map<string, string>>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the OpenClaw directory watcher.
 *
 * Performs an immediate scan of `~/.openclaw/agents/`, then repeats every
 * {@link OPENCLAW_SCAN_INTERVAL_MS} ms.  For each newly discovered session the
 * watcher:
 *
 *  1. Allocates a numeric agent ID ≥ {@link OPENCLAW_AGENT_ID_START}.
 *  2. Creates an AgentState with `source: 'openclaw'` (no terminalRef).
 *  3. Persists the agent via agentManager.persistAgents.
 *  4. Starts a per-session JSONL watcher via watchOpenClawAgent.
 *  5. Bridges OpenClawParserEvents → webview wire protocol in real time.
 *
 * If a session is already in `provider.agents` (restored from workspaceState
 * by agentManager.restoreAgents), the existing numeric ID is reused and only
 * the JSONL watcher is started — no duplicate agent is created.
 *
 * @param context  Extension context used for workspaceState persistence.
 * @param provider The PixelAgentsViewProvider instance (satisfies AgentHost).
 */
export function startOpenClawWatcher(context: vscode.ExtensionContext, provider: AgentHost): void {
  void scanAndRegister(context, provider);

  scanInterval = setInterval(() => {
    void scanAndRegister(context, provider);
  }, OPENCLAW_SCAN_INTERVAL_MS);
}

/**
 * Stop all OpenClaw watchers and free all resources.
 *
 * Disposes every active JSONL file watcher, stops the periodic scan timer,
 * and resets per-session tracking.  Safe to call multiple times.
 */
export function stopOpenClawWatcher(): void {
  if (scanInterval !== null) {
    clearInterval(scanInterval);
    scanInterval = null;
  }

  for (const disposable of activeWatchers.values()) {
    disposable.dispose();
  }
  activeWatchers.clear();
  toolIdByAgent.clear();
}

// ── Directory scanner ─────────────────────────────────────────────────────────

async function scanAndRegister(
  context: vscode.ExtensionContext,
  provider: AgentHost,
): Promise<void> {
  let sessions: { agentId: string; sessionKey: string }[];
  try {
    sessions = await listOpenClawAgents();
  } catch (e) {
    console.log(`[Pixel Agents/OpenClaw] Directory scan error: ${e}`);
    return;
  }

  // Advance ID counter past any OpenClaw agents already registered (e.g. restored
  // by agentManager.restoreAgents before this scan tick fires).
  for (const [id, agent] of provider.agents) {
    if (agent.source === 'openclaw' && id >= nextOpenClawId) {
      nextOpenClawId = id + 1;
    }
  }

  for (const { agentId, sessionKey } of sessions) {
    const watchKey = `${agentId}/${sessionKey}`;

    // Skip sessions we are already watching
    if (activeWatchers.has(watchKey)) continue;

    // Re-use an existing numeric ID when the agent was already registered
    // (e.g. by agentManager.restoreAgents on VS Code restart — D6).
    let numericId: number | null = null;
    for (const [id, agent] of provider.agents) {
      if (
        agent.source === 'openclaw' &&
        agent.agentId === agentId &&
        agent.sessionKey === sessionKey
      ) {
        numericId = id;
        break;
      }
    }

    if (numericId === null) {
      // Brand-new session — allocate a numeric ID and create the AgentState.
      numericId = nextOpenClawId++;
      const jsonlFile = path.join(OPENCLAW_AGENT_DIR, agentId, 'sessions', `${sessionKey}.jsonl`);

      const agentState: AgentState = {
        id: numericId,
        source: 'openclaw',
        agentId,
        sessionKey,
        // OpenClaw agents have no terminal (D8); terminalRef intentionally absent.
        projectDir: OPENCLAW_AGENT_DIR,
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

      provider.agents.set(numericId, agentState);
      persistAgents(provider.agents, context);

      // Notify webview — no-op when the panel is not yet open
      provider.webviewView?.webview.postMessage({ type: 'agentCreated', id: numericId });
      console.log(
        `[Pixel Agents/OpenClaw] Registered agent ${numericId}: ${agentId}/${sessionKey}`,
      );
    }

    // Initialise per-agent tool-tracking map (idempotent)
    if (!toolIdByAgent.has(numericId)) {
      toolIdByAgent.set(numericId, new Map());
    }

    // Start the JSONL watcher; capture numericId in closure
    const capturedId = numericId;
    const disposable = watchOpenClawAgent(agentId, sessionKey, (event) => {
      handleParserEvent(event, capturedId, provider);
    });

    activeWatchers.set(watchKey, disposable);
    console.log(`[Pixel Agents/OpenClaw] Watching ${watchKey} (numeric id=${capturedId})`);
  }
}

// ── Event bridge: OpenClawParserEvent → webview wire protocol ─────────────────

/**
 * Translate a single OpenClawParserEvent into the webview wire protocol and
 * post it to the webview.
 *
 * Translation table (see JSDoc on OpenClawParserEvent):
 *
 *   Parser field / value     →   Webview protocol field / value
 *   ─────────────────────────────────────────────────────────────
 *   agentId (string)         →   id (number)
 *   status: 'working'        →   status: 'active'
 *   status: 'idle'           →   status: 'waiting'
 *   status: 'error'          →   status: 'waiting'
 *   agentToolStart           →   agentToolStart { id, toolId, status }
 *   agentToolDone            →   agentToolDone  { id, toolId }
 */
function handleParserEvent(
  event: OpenClawParserEvent,
  numericId: number,
  provider: AgentHost,
): void {
  const webview = provider.webviewView?.webview;
  const agent = provider.agents.get(numericId);

  switch (event.type) {
    case 'agentStatus': {
      // D7: map OpenClaw status values to the two values the webview knows
      const status = event.status === 'working' ? 'active' : 'waiting';

      if (agent) {
        agent.isWaiting = status === 'waiting';

        if (status === 'waiting') {
          // Silently clear any stale tool state so sendCurrentAgentStatuses
          // does not re-send tools that are no longer active.
          agent.activeToolIds.clear();
          agent.activeToolStatuses.clear();
          agent.activeToolNames.clear();
          toolIdByAgent.get(numericId)?.clear();
        }
      }

      webview?.postMessage({ type: 'agentStatus', id: numericId, status });
      break;
    }

    case 'agentToolStart': {
      // Generate a stable, unique toolId for this invocation
      const toolId = `oclaw-${numericId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // The parser JSON-stringifies input; parse it back for formatToolStatus
      let parsedInput: Record<string, unknown>;
      try {
        parsedInput = JSON.parse(event.input) as Record<string, unknown>;
      } catch {
        parsedInput = {};
      }

      // Reuse the same formatToolStatus animation logic as Claude Code path (D7)
      const status = formatToolStatus(event.tool, parsedInput);

      // Update AgentState so sendCurrentAgentStatuses can re-hydrate the webview
      // after a panel close/reopen without losing in-progress tool indicators.
      if (agent) {
        agent.activeToolIds.add(toolId);
        agent.activeToolStatuses.set(toolId, status);
        agent.activeToolNames.set(toolId, event.tool);
        agent.isWaiting = false;
      }

      // Store tool name → toolId so we can correlate the matching agentToolDone
      toolIdByAgent.get(numericId)?.set(event.tool, toolId);

      webview?.postMessage({ type: 'agentToolStart', id: numericId, toolId, status });
      break;
    }

    case 'agentToolDone': {
      const agentToolMap = toolIdByAgent.get(numericId);
      const toolId = agentToolMap?.get(event.tool);

      if (toolId !== undefined) {
        agentToolMap?.delete(event.tool);

        if (agent) {
          agent.activeToolIds.delete(toolId);
          agent.activeToolStatuses.delete(toolId);
          agent.activeToolNames.delete(toolId);
        }

        webview?.postMessage({ type: 'agentToolDone', id: numericId, toolId });
      }
      break;
    }
  }
}
