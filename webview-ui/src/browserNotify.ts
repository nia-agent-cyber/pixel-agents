/**
 * Browser push notifications (M11) — agent idle alerts.
 *
 * Used to notify the user when an OpenClaw agent transitions from active to
 * waiting/idle, so the pixel office is useful in a background tab.
 *
 * Guards:
 *   - typeof Notification === 'undefined'  → SSR / VS Code webview safety
 *   - Only fires when document.hidden or !document.hasFocus() (don't interrupt
 *     the user when the tab is actively visible and focused)
 */

/**
 * Request browser notification permission.
 * Returns true if permission is granted (or was already granted).
 * Returns false if unsupported, denied, or dismissed.
 */
export async function requestNotifyPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * Fire a desktop notification indicating that an agent is now idle.
 *
 * @param agentId  - The raw agent ID (fallback when label is absent)
 * @param label    - Human-readable agent label (e.g. "pixel-coder")
 */
export function notifyAgentIdle(agentId: string, label?: string): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  // Only interrupt the user when the tab is hidden or not focused.
  if (!document.hidden && document.hasFocus()) return;
  const body = `${label ?? agentId} is idle`;
  new Notification('Pixel Office', { body });
}
