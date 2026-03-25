/**
 * AgentDetailPanel (M8) — browser-only overlay showing live agent context.
 *
 * Renders a modal overlay when a pixel character is clicked in the web office.
 * Shows: label, session key (copyable), status badge, recent tool calls, and
 * time since last activity.  Re-renders on agent state changes and every second
 * for the live "time since" display.
 *
 * isBrowserRuntime guard: this component is only rendered in browser runtime
 * (App.tsx gates it behind isBrowserRuntime).  Never imported in VS Code path.
 */

import { useCallback, useEffect, useReducer, useState } from 'react';

import { getAgentDetail, subscribeAgentDetail } from '../browserAgentFeed.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const TICK_INTERVAL_MS = 1000;
const PANEL_Z_INDEX = 200;
const BACKDROP_BG = 'rgba(0, 0, 0, 0.55)';
const PANEL_BG = '#1e1e2e';
const PANEL_BORDER = '2px solid #44475a';
const PANEL_MAX_WIDTH = 480;
const PANEL_PADDING = '20px 24px';
const BADGE_RADIUS = 3;
const COPY_TIMEOUT_MS = 1500;

const STATUS_COLOURS: Record<string, { background: string; color: string }> = {
  active: { background: '#22c55e', color: '#fff' },
  waiting: { background: '#eab308', color: '#fff' },
  removed: { background: '#6b7280', color: '#fff' },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds.toString()}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes.toString()}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours.toString()}h ago`;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface AgentDetailPanelProps {
  agentId: number;
  onClose: () => void;
}

export function AgentDetailPanel({ agentId, onClose }: AgentDetailPanelProps) {
  // useReducer as a forceUpdate mechanism — increments a counter on every tick
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);

  // Subscribe to agent detail changes and set a 1-second tick for "time since"
  useEffect(() => {
    const unsub = subscribeAgentDetail(agentId, forceUpdate);
    const timer = setInterval(forceUpdate, TICK_INTERVAL_MS);
    return (): void => {
      unsub();
      clearInterval(timer);
    };
  }, [agentId]);

  // Escape key to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return (): void => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const detail = getAgentDetail(agentId);

  // If the agent is gone, close automatically
  useEffect(() => {
    if (!detail) onClose();
  }, [detail, onClose]);

  // Copy to clipboard state
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((): void => {
    if (!detail) return;
    void navigator.clipboard.writeText(detail.sessionKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_TIMEOUT_MS);
    });
  }, [detail]);

  if (!detail) return null;

  const badgeColour = STATUS_COLOURS[detail.status] ?? STATUS_COLOURS['waiting'];

  const toolsList = detail.recentTools.length > 0 ? [...detail.recentTools].reverse() : null;

  return (
    // Backdrop
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Agent details: ${detail.label}`}
      style={{
        position: 'fixed',
        inset: 0,
        background: BACKDROP_BG,
        zIndex: PANEL_Z_INDEX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      {/* Panel — stop click from bubbling to backdrop */}
      <div
        style={{
          background: PANEL_BG,
          border: PANEL_BORDER,
          maxWidth: PANEL_MAX_WIDTH,
          width: '90%',
          padding: PANEL_PADDING,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          fontFamily: '"Courier New", Courier, monospace',
          color: '#cdd6f4',
        }}
        onClick={(e): void => e.stopPropagation()}
      >
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#cba6f7',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '55%',
            }}
          >
            {detail.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                background: badgeColour.background,
                color: badgeColour.color,
                padding: '2px 10px',
                borderRadius: BADGE_RADIUS,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
                display: 'inline-block',
              }}
            >
              {detail.status}
            </span>
            <button
              aria-label="Close panel"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6c7086',
                fontSize: 20,
                cursor: 'pointer',
                lineHeight: 1,
                padding: '0 2px',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Session key row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
            fontSize: 11,
            color: '#6c7086',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Session: {detail.sessionKey}
          </span>
          <button
            onClick={handleCopy}
            style={{
              flexShrink: 0,
              background: copied ? '#22c55e' : '#313244',
              border: '1px solid #45475a',
              color: copied ? '#fff' : '#cdd6f4',
              fontSize: 10,
              padding: '2px 7px',
              cursor: 'pointer',
              borderRadius: 2,
              transition: 'background 0.2s',
            }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #313244', marginBottom: 12 }} />

        {/* Activity section */}
        <div style={{ marginBottom: 4 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#a6e3a1', letterSpacing: 1 }}>
              RECENT ACTIVITY
            </span>
            <span style={{ fontSize: 11, color: '#6c7086' }}>
              last active: {timeAgo(detail.lastActivityAt)}
            </span>
          </div>

          {toolsList ? (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {toolsList.map((tool, i) => (
                <li
                  key={i}
                  style={{
                    fontSize: 12,
                    color: i === 0 ? '#cdd6f4' : '#585b70',
                    padding: '3px 0',
                    borderBottom: i < toolsList.length - 1 ? '1px solid #1e1e2e' : 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ color: '#89b4fa', marginRight: 6 }}>›</span>
                  {tool}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 12, color: '#585b70', margin: 0 }}>No tool calls yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
