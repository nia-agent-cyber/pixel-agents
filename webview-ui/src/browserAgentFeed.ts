/**
 * Browser agent feed (M6) — connects to /api/agents/events SSE endpoint
 * and drives the pixel-office window event bus with live OpenClaw agent events.
 *
 * Dispatches agentAdded, agentStatus, agentToolStart, agentToolDone to window
 * using the same MessageEvent shape that useExtensionMessages consumes.
 *
 * All dispatches: window.dispatchEvent(new MessageEvent('message', { data: payload }))
 */

// ── Constants ──────────────────────────────────────────────────────────────────

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

// ── Module state ───────────────────────────────────────────────────────────────

let nextAgentId = 1;

/**
 * Map keyed by "agentId:sessionKey".
 * Each entry tracks the numeric ID assigned to this agent and its pending tools
 * (toolCallId|toolName → generated toolId) for toolStart/toolDone correlation.
 */
const activeAgents = new Map<string, { numericId: number; pendingTools: Map<string, string> }>();

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
  activeAgents.set(key, { numericId, pendingTools: new Map() });
  dispatch({ type: 'agentAdded', id: numericId, label, projectDir: agentId });
  dispatch({ type: 'agentStatus', id: numericId, status: 'waiting' });
}

function onAgentRemoved(agentId: string, sessionKey: string): void {
  const key = agentKey(agentId, sessionKey);
  const entry = activeAgents.get(key);
  if (!entry) return;
  dispatch({ type: 'agentStatus', id: entry.numericId, status: 'removed' });
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
  const rand5 = Math.random().toString(36).slice(2, 7);
  const toolId = `feed-${Date.now().toString()}-${rand5}`;
  // Key by toolCallId when available; fall back to tool name
  const lookupKey = toolCallId ?? tool;
  pendingTools.set(lookupKey, toolId);
  const statusText = `${tool}${input ? ': ' + input.slice(0, 60) : ''}`;
  dispatch({ type: 'agentToolStart', id: numericId, toolId, status: statusText });
  dispatch({ type: 'agentStatus', id: numericId, status: 'active' });
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
    dispatch({ type: 'agentStatus', id: numericId, status: 'waiting' });
  }
}

function onText(agentId: string, sessionKey: string): void {
  const key = agentKey(agentId, sessionKey);
  const entry = activeAgents.get(key);
  if (!entry) return;
  dispatch({ type: 'agentStatus', id: entry.numericId, status: 'active' });
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
