import { isBrowserRuntime } from './runtime';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

/**
 * In browser runtime, intercept saveLayout / saveAgentSeats postMessages and
 * persist them via the office-server REST API.  All other message types are
 * just logged to the console (the VS Code extension is not present).
 */
function browserPostMessage(msg: unknown): void {
  console.log('[vscode.postMessage]', msg);
  if (typeof msg !== 'object' || msg === null) return;
  const m = msg as Record<string, unknown>;
  if (m['type'] === 'saveLayout') {
    void fetch('/api/layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(m['layout'] ?? {}),
    });
  } else if (m['type'] === 'saveAgentSeats') {
    void fetch('/api/seats', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(m['seats'] ?? {}),
    });
  }
}

export const vscode: { postMessage(msg: unknown): void } = isBrowserRuntime
  ? { postMessage: browserPostMessage }
  : (acquireVsCodeApi() as { postMessage(msg: unknown): void });
