/**
 * Browser agent feed (M6) — connects to /api/agents/events SSE endpoint
 * and drives the pixel-office window event bus with live OpenClaw agent events.
 *
 * Dispatches agentAdded, agentStatus, agentToolStart, agentToolDone to window
 * using the same MessageEvent shape that useExtensionMessages consumes.
 *
 * All dispatches: window.dispatchEvent(new MessageEvent('message', { data: payload }))
 *
 * M8 extension: module-level detail store exposed via getAgentDetail /
 * subscribeAgentDetail so the AgentDetailPanel can render live agent context.
 *
 * M11 extension: fires browser push notifications via browserNotify when an
 * agent transitions from active → waiting/removed (idle).
 */

import { notifyAgentIdle } from './browserNotify.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RECENT_TOOLS_MAX = 5;

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Snapshot of an agent's state for the detail panel (M8).
 * Exposed read-only via getAgentDetail().
 */
export type AgentDetail = {
  label: string;
  sessionKey: string;
  status: 'active' | 'waiting' | 'removed';
  recentTools: readonly string[];
  lastActivityAt: number;
  addedAt: number;
};

// ── Module state ───────────────────────────────────────────────────────────────

let nextAgentId = 1;

/**
 * Full per-agent entry.  activeAgents is keyed by "agentId:sessionKey".
 */
type AgentEntry = {
  numericId: number;
  pendingTools: Map<string, string>;
  // detail store fields (M8)
  label: string;
  sessionKey: string;
  status: 'active' | 'waiting' | 'removed';
  recentTools: string[];
  lastActivityAt: number;
  addedAt: number;
};

const activeAgents = new Map<string, AgentEntry>();

/**
 * Subscribers keyed by numericId.  Each Set holds callbacks to call on state change.
 */
const detailSubscribers = new Map<number, Set<() => void>>();

// ── Subscriber helpers (M8) ────────────────────────────────────────────────────

function notifySubscribers(numericId: number): void {
  const subs = detailSubscribers.get(numericId);
  if (subs) {
    subs.forEach((cb) => cb());
  }
}

/**
 * Subscribe to detail updates for a specific agent.
 * Returns an unsubscribe function.
 */
export function subscribeAgentDetail(numericId: number, cb: () => void): () => void {
  let subs = detailSubscribers.get(numericId);
  if (!subs) {
    subs = new Set();
    detailSubscribers.set(numericId, subs);
  }
  subs.add(cb);
  return (): void => {
    subs!.delete(cb);
    if (subs!.size === 0) {
      detailSubscribers.delete(numericId);
    }
  };
}

/**
 * Get the current detail snapshot for an agent by numeric ID.
 * Returns undefined if the agent is not found.
 */
export function getAgentDetail(numericId: number): AgentDetail | undefined {
  for (const entry of activeAgents.values()) {
    if (entry.numericId === numericId) {
      return {
        label: entry.label,
        sessionKey: entry.sessionKey,
        status: entry.status,
        recentTools: [...entry.recentTools],
        lastActivityAt: entry.lastActivityAt,
        addedAt: entry.addedAt,
      };
    }
  }
  return undefined;
}

// ── Dispatch helper ────────────────────────────────────────────────────────────

function dispatch(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

function agentKey(agentId: string, sessionKey: string): string {
  return `${agentId}:${sessionKey}`;
}

// ── Event handlers ─────────────────────────────────────────────────────────────

function onAgentAdded(agentId: string, sessionKey: string, label: string): void {
  const key = agentKey(agentId, sessionKey);
  if (activeAgents.has(key)) return;
  const numericId = nextAgentId++;
  const now = Date.now();
  activeAgents.set(key, {
    numericId,
    pendingTools: new Map(),
    label,
    sessionKey,
    status: 'waiting',
    recentTools: [],
    lastActivityAt: now,
    addedAt: now,
  });
  // useExtensionMessages handles 'agentCreated', not 'agentAdded'
  dispatch({ type: 'agentCreated', id: numericId, folderName: label });
  dispatch({ type: 'agentStatus', id: numericId, status: 'waiting' });
  notifySubscribers(numericId);
}

function onAgentRemoved(agentId: string, sessionKey: string): void {
  const key = agentKey(agentId, sessionKey);
  const entry = activeAgents.get(key);
  if (!entry) return;
  // M11: notify if the agent was active when it was removed
  const wasActive = entry.status === 'active';
  entry.status = 'removed';
  dispatch({ type: 'agentStatus', id: entry.numericId, status: 'removed' });
  notifySubscribers(entry.numericId);
  if (wasActive) {
    notifyAgentIdle(agentId, entry.label);
  }
  activeAgents.delete(key);
}

function onToolStart(
  agentId: string,
  sessionKey: string,
  tool: string,
  input: string,
  toolCallId: string | undefined,
): void {
  const key = agentKey(agentId, sessionKey);
  const entry = activeAgents.get(key);
  if (!entry) return;
  const { numericId, pendingTools } = entry;
  // Use a deterministic toolId when toolCallId is available so that replayed
  // events (e.g. on SSE reconnect) deduplicate correctly in useExtensionMessages.
  // The dedup guard there is `if (list.some((t) => t.toolId === toolId)) return prev`.
  const rand5 = Math.random().toString(36).slice(2, 7);
  const toolId = toolCallId ? `feed-${toolCallId}` : `feed-${Date.now().toString()}-${rand5}`;
  // Key by toolCallId when available; fall back to tool name
  const lookupKey = toolCallId ?? tool;
  // Skip if we're already tracking this tool call (duplicate from replay)
  if (pendingTools.has(lookupKey)) return;
  pendingTools.set(lookupKey, toolId);
  const statusText = `${tool}${input ? ': ' + input.slice(0, 60) : ''}`;

  // Update detail store (M8)
  entry.recentTools.push(statusText);
  if (entry.recentTools.length > RECENT_TOOLS_MAX) {
    entry.recentTools.shift();
  }
  entry.status = 'active';
  entry.lastActivityAt = Date.now();

  dispatch({ type: 'agentToolStart', id: numericId, toolId, status: statusText });
  dispatch({ type: 'agentStatus', id: numericId, status: 'active' });
  notifySubscribers(numericId);
}

function onToolDone(agentId: string, sessionKey: string, toolCallId: string | undefined): void {
  const key = agentKey(agentId, sessionKey);
  const entry = activeAgents.get(key);
  if (!entry) return;
  const { numericId, pendingTools } = entry;
  const lookupKey = toolCallId ?? '';
  const toolId = pendingTools.get(lookupKey) ?? `feed-done-${Date.now().toString()}`;
  pendingTools.delete(lookupKey);
  dispatch({ type: 'agentToolDone', id: numericId, toolId });
  if (pendingTools.size === 0) {
    // M11: only notify if the agent was genuinely active (not a replayed done event)
    const wasActive = entry.status === 'active';
    // Update detail store (M8)
    entry.status = 'waiting';
    dispatch({ type: 'agentStatus', id: numericId, status: 'waiting' });
    notifySubscribers(numericId);
    if (wasActive) {
      notifyAgentIdle(agentId, entry.label);
    }
  }
}

function onText(agentId: string, sessionKey: string): void {
  const key = agentKey(agentId, sessionKey);
  const entry = activeAgents.get(key);
  if (!entry) return;
  // Update detail store (M8)
  entry.status = 'active';
  entry.lastActivityAt = Date.now();
  dispatch({ type: 'agentStatus', id: entry.numericId, status: 'active' });
  notifySubscribers(entry.numericId);
}

// ── SSE connection with exponential back-off ──────────────────────────────────

function connect(retryDelayMs: number): void {
  const es = new EventSource('/api/agents/events');

  es.onmessage = (ev: MessageEvent): void => {
    try {
      const data = JSON.parse(ev.data as string) as Record<string, unknown>;
      const { type } = data;
      if (type === 'agentAdded') {
        onAgentAdded(
          data['agentId'] as string,
          data['sessionKey'] as string,
          (data['label'] as string | undefined) ?? (data['agentId'] as string),
        );
      } else if (type === 'agentRemoved') {
        onAgentRemoved(data['agentId'] as string, data['sessionKey'] as string);
      } else if (type === 'toolStart') {
        onToolStart(
          data['agentId'] as string,
          data['sessionKey'] as string,
          data['tool'] as string,
          (data['input'] as string | undefined) ?? '',
          data['toolCallId'] as string | undefined,
        );
      } else if (type === 'toolDone') {
        onToolDone(
          data['agentId'] as string,
          data['sessionKey'] as string,
          data['toolCallId'] as string | undefined,
        );
      } else if (type === 'text') {
        onText(data['agentId'] as string, data['sessionKey'] as string);
      }
    } catch {
      // ignore malformed events
    }
  };

  es.onerror = (): void => {
    es.close();
    const nextDelay = Math.min(retryDelayMs * 2, RECONNECT_MAX_MS);
    setTimeout(() => {
      connect(nextDelay);
    }, retryDelayMs);
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Initialize the browser agent feed.
 * Opens an SSE connection to /api/agents/events (relative URL — works in both
 * Vite dev and production) and drives the pixel-office window event bus with
 * live OpenClaw agent events.  Reconnects automatically on error.
 */
export function initBrowserAgentFeed(): void {
  connect(RECONNECT_BASE_MS);
}
