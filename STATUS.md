# STATUS.md — pixel-bridge Project Status

**Last updated:** 2026-03-25  
**Updated by:** pixel-coder  
**Current sprint:** Sprint 5 (M6 COMPLETE)

---

## Current State: ✅ M6 COMPLETE — Browser SSE bridge live; real OpenClaw agents appear in web pixel office

---

## Sprint 5 (M6) — Live Agent Feed (browser SSE bridge)

**Goal:** Real OpenClaw agents appear as animated pixel characters in the standalone browser pixel office. No VS Code required.

### Deliverables

#### 1. `office-server/server.js` — new `/api/agents/events` SSE endpoint

- Watches `~/.openclaw/agents/` for new/stale sessions using `fs.watch` + 5 s polling fallback
- Emits `agentAdded` when a new JSONL session file appears:
  `data: { type: 'agentAdded', agentId, sessionKey, label }`
- Emits `agentRemoved` when a session has had no new bytes for >5 min:
  `data: { type: 'agentRemoved', agentId, sessionKey }`
- Multiplexes `toolStart`, `toolDone`, `text` events from all active sessions into this single stream.
  Each event includes `agentId` and `sessionKey` fields so the client can route correctly.
- Heartbeat comment (`\: heartbeat\n\n`) every 15 s.
- **Critical:** declare this route BEFORE `/api/agents/:agentId/sessions/:sessionKey/events`
  to avoid Express routing collision — Express matches routes in order; `/api/agents/events`
  would otherwise be captured by the `:agentId` param as `agentId='events'`.
- Stale-session tracking: module-level `Map<string, { lastByte: number; timer: NodeJS.Timeout }>`.
  On every `toolStart`/`toolDone`/`text` event for an `agentId:sessionKey`, reset the 5-min timer.

#### 2. `webview-ui/src/browserAgentFeed.ts` — new file

```typescript
export function initBrowserAgentFeed(): void
```

- Opens SSE connection to `/api/agents/events` (relative URL — works both in Vite dev and production).
- Maintains `activeAgents: Map<string, { numericId: number }>` keyed by `"${agentId}:${sessionKey}"`.
- Assigns sequential numeric IDs starting at 1 (browser-local, not persisted).
- Per-agent pending tool map: `Map<agentKey, Map<toolCallId | toolName, string>>` for toolId correlation.

**Event handlers:**

| SSE `type` | Action |
|---|---|
| `agentAdded` | Assign numericId; dispatch `agentAdded` + `agentStatus: waiting` |
| `agentRemoved` | Dispatch `agentStatus: removed` (if not supported, skip); remove from map |
| `toolStart` | Dispatch `agentToolStart` + `agentStatus: active` |
| `toolDone` | Look up toolId via toolCallId; dispatch `agentToolDone`; if no pending tools → dispatch `agentStatus: waiting` |
| `text` | Dispatch `agentStatus: active` |

**agentAdded dispatch shape:**
```typescript
window.dispatchEvent(new MessageEvent('message', {
  data: { type: 'agentAdded', id: numericId, label: agentId, projectDir: agentId }
}));
window.dispatchEvent(new MessageEvent('message', {
  data: { type: 'agentStatus', id: numericId, status: 'waiting' }
}));
```

**agentToolStart dispatch shape:**
```typescript
const toolId = `feed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
// store in pendingTools map keyed by toolCallId (or tool name as fallback)
window.dispatchEvent(new MessageEvent('message', {
  data: { type: 'agentToolStart', id: numericId, toolId, status: `${tool}${input ? ': ' + input.slice(0, 60) : ''}` }
}));
window.dispatchEvent(new MessageEvent('message', {
  data: { type: 'agentStatus', id: numericId, status: 'active' }
}));
```

**agentToolDone dispatch shape:**
```typescript
// retrieve toolId from pendingTools, fallback to a stable string if not found
window.dispatchEvent(new MessageEvent('message', {
  data: { type: 'agentToolDone', id: numericId, toolId }
}));
// if pendingToolCount === 0:
window.dispatchEvent(new MessageEvent('message', {
  data: { type: 'agentStatus', id: numericId, status: 'waiting' }
}));
```

- SSE error / connection close: retry with exponential backoff starting at 1 s, max 30 s.
- All dispatches use `window.dispatchEvent(new MessageEvent('message', { data: payload }))`.

#### 3. `webview-ui/src/App.tsx` — wire in browserAgentFeed

In the existing `useEffect` block (line ~127) where `isBrowserRuntime` is checked:
```typescript
useEffect(() => {
  if (isBrowserRuntime) {
    void import('./browserMock.js').then(({ dispatchMockMessages }) => dispatchMockMessages());
    void import('./browserAgentFeed.js').then(({ initBrowserAgentFeed }) => initBrowserAgentFeed());
  }
}, []);
```

### TypeScript constraints (from PROTOCOL.md)

- No `enum` — use `as const` objects
- `import type` for type-only imports
- `noUnusedLocals` / `noUnusedParameters` strict
- All magic numbers → constants in the file (not inline)
- Must pass `npm run build` clean (tsc + eslint + esbuild + vite, zero errors/warnings)

### Acceptance Criteria

- `npm run build` passes clean
- `node office-server/server.js` starts without errors
- `/api/agents/events` SSE stream emits `agentAdded` for active sessions on connect
- Browser at `http://localhost:5173` (Vite dev) with a live OpenClaw session: pixel character appears and animates when tools run
- No VS Code dependency required

---

---

## Sprint 5 (M6) — pixel-coder, 2026-03-25

### Summary

Browser SSE bridge implemented end-to-end. Real OpenClaw agents now appear as animated pixel characters in the standalone web pixel office without VS Code.

### Files changed

| File | Change |
|------|--------|
| `office-server/server.js` | New `/api/agents/events` SSE endpoint + Live Agent Feed module (M6) |
| `webview-ui/src/browserAgentFeed.ts` | **New** — SSE client with agent tracking, pending-tool correlation, and exponential back-off reconnect |
| `webview-ui/src/App.tsx` | Wire `initBrowserAgentFeed()` into the `isBrowserRuntime` useEffect |

### Implementation notes

**`office-server/server.js`**
- Added three constants: `STALE_TIMEOUT_MS` (5 min), `FEED_SCAN_MS` (5 s), `FEED_HEARTBEAT_MS` (15 s)
- Module-level state: `feedClients` (Set of SSE responses), `knownSessions` (Map keyed by `agentId:sessionKey`), `activeSessions` (per-session reader state)
- `startSessionFeed` — opens `fs.watch` on the JSONL file + 5 s poll fallback; skips history (seeks to current EOF on first open so only live events are broadcast)
- `stopSessionFeed` — cleans up watcher, poll interval, and stale timer
- `resetStaleTimer` — per-session timeout reset on every `toolStart`/`toolDone`/`text` event; fires `agentRemoved` + stops reader when expired
- `scanForNewSessions` — walks `~/.openclaw/agents/` with the existing `scanAgents()` helper; registers new sessions only
- `startFeedWatcher` — initial scan + periodic poll + `fs.watch` on agents dir; called from `app.listen` callback
- Route declared **before** `/api/agents/:agentId/sessions/:sessionKey/events` to prevent Express param collision

**`webview-ui/src/browserAgentFeed.ts`**
- Sequential numeric IDs starting at 1, maintained in module-level `nextAgentId`
- Per-agent `pendingTools: Map<toolCallId|toolName, toolId>` for `agentToolDone` correlation
- `onToolDone` clears the pending tool and dispatches `agentStatus: waiting` when `pendingTools.size === 0`
- `connect(retryDelayMs)` — opens `EventSource('/api/agents/events')`; on error, closes and reconnects with delay doubled (1 s → 2 s → 4 s … → 30 s max)
- All dispatches via `window.dispatchEvent(new MessageEvent('message', { data: payload }))`
- TypeScript: no `enum`, `import type` not needed (no type-only imports), fully compliant with `noUnusedLocals` / `noUnusedParameters`

### Build

`npm run build` — **✅ clean** (tsc + eslint + esbuild + vite, zero errors, zero warnings)

### Commit

`887c427` — `feat: M6 browser SSE bridge — live agent feed for web pixel office`

---

## Sprint 5 (M7) — Standalone Build & Deploy *(after M6 QA)*

**Goal:** Deploy the pixel office as a standalone static web app at `office.niavoice.org/ui/`

### Deliverables

1. **`webview-ui/vite.config.ts`** — add standalone build mode:
   - `base: '/ui/'`, `outDir: '../office-server/public/ui'`
   - `webview-ui/package.json` gets a `build:standalone` script

2. **`office-server/server.js`** — serve `/ui/*` as static files behind `basicAuth`:
   - `app.use('/ui', express.static(path.join(__dirname, 'public/ui')))`

3. **Persistence (browser runtime)**:
   - `vscodeApi.ts` (or a new `browserApi.ts`) — intercept `saveLayout` and `saveAgentSeats`
     postMessages in browser runtime → send as `PUT /api/layout` and `PUT /api/seats`
   - `office-server/server.js` — `PUT /api/layout` writes `~/.openclaw/pixel-office-layout.json`;
     `PUT /api/seats` writes `~/.openclaw/pixel-office-seats.json`;
     `GET /api/layout` and `GET /api/seats` return stored JSON

4. **Cloudflare tunnel / launchd**: no port change needed (port 3456 stays). Cloudflare tunnel
   already routes `office.niavoice.org → localhost:3456`. Update any launchd plist env if needed.

5. **`README.md` update**: document the standalone build + deploy steps.

---

## Current State: ✅ M5 FULLY COMPLETE — Extension end-to-end functional — Ready for devops (niavoice.com/office deployment)

---

## QA Review — commit f768ec7 (pixel-qa, 2026-03-24)

### Verdict: ✅ APPROVED

**Fix 2 (ID counter guard) confirmed correct. All checklist items pass. Build clean.**

| Check | Result |
|-------|--------|
| `OPENCLAW_AGENT_ID_START = 10000` in `constants.ts`, exported | ✅ PASS |
| `agentManager.ts` imports `OPENCLAW_AGENT_ID_START` from `./constants` | ✅ PASS |
| Guard reads `(p.id \|\| 0) < OPENCLAW_AGENT_ID_START` (not `< 100000`) | ✅ PASS |
| `openclawWatcher.ts` imports from `./constants`, no local duplicate | ✅ PASS |
| `npm run compile` clean (tsc + eslint + esbuild + vite, zero errors) | ✅ PASS |

**M5 is fully complete. The extension is end-to-end functional. Ready for devops deployment.**

---

## Sprint 4 (M5) — pixel-coder, 2026-03-24

### Summary
Persistence guards and extension wiring — OpenClaw agents now survive VS Code restarts and
are cleaned up correctly via `context.subscriptions`. All four QA pre-conditions from M4
review resolved.

### Files changed
| File | Change |
|------|--------|
| `src/agentManager.ts` | Fix 1: `restoreAgents` guards `startFileWatching` behind `agentSource === 'claude-code'`; Fix 2: `maxId` scan excludes OpenClaw IDs (`< 100000`) |
| `src/extension.ts` | Fix 3: `context.subscriptions.push({ dispose: stopOpenClawWatcher })` added |

### Fix 1 — `restoreAgents` source guard ✅
Wrapped the entire `startFileWatching` block (both the `existsSync` branch and the
`setInterval` poll-for-file branch) in `if (agentSource === 'claude-code')`.  
OpenClaw agents are re-discovered by `startOpenClawWatcher` on extension startup (D6).
Claude Code file parser never runs on OpenClaw JSONL files; no leaked watchers/timers.

### Fix 2 — ID counter collision on restore ✅
Changed `if (p.id > maxId) maxId = p.id;` to
`if ((p.id || 0) < 100000 && p.id > maxId) maxId = p.id;`.
OpenClaw IDs (≥ 100000 or ≥ 10000 per `OPENCLAW_AGENT_ID_START`) no longer advance
`nextAgentIdRef.current` into the OpenClaw ID space. Claude Code IDs remain sequential
from 1 regardless of how many OpenClaw agents are persisted.

### Fix 3 — `context.subscriptions` wiring ✅
Added `context.subscriptions.push({ dispose: () => stopOpenClawWatcher() })` after
`startOpenClawWatcher(context, provider)` in `activate()`.  
The watcher is now cleaned up by VS Code's extension lifecycle (subscriptions disposed on
deactivation) AND by the explicit `stopOpenClawWatcher()` call in `deactivate()` — belt and
suspenders; second call is safe (idempotent by null-checks in `stopOpenClawWatcher`).

### Fix 4 — `activeToolIds` consistency ✅ (already done in M4 Rev2)
`handleParserEvent` in `openclawWatcher.ts` already maintains `activeToolIds` in all three
cases:
- `agentToolStart` → `agent.activeToolIds.add(toolId)` (line 290)
- `agentToolDone`  → `agent.activeToolIds.delete(toolId)` (line 311)
- `agentStatus` (waiting) → `agent.activeToolIds.clear()` (line 261)
M4 Rev2 resolved this before QA's MINOR NOTE was filed. No changes needed.

### Build
`npm run compile` — **✅ clean** (tsc + eslint + esbuild + vite, zero errors, zero warnings)

### Commit
`2b71381` — `feat: M5 persistence guards + extension wiring — OpenClaw agents live`

---

## Current State: ✅ M4 FULLY APPROVED — Sprint 3 (M5) UNBLOCKED

---

## M4 Rev2 — pixel-coder, 2026-03-24

Re-implementation of `openclawWatcher.ts` to better match the task spec:

| Change | Previous (c6dfe3e) | Rev2 |
|--------|--------------------|------|
| Agent ID start | `OPENCLAW_ID_BASE = 100000` | `10000` (spec says "starting at 10000") |
| Function signature | `startOpenClawWatcher(provider): Disposable` | `startOpenClawWatcher(context, provider): void` |
| Persistence | Not called — agents not persisted | Calls `persistAgents` (D6) |
| `constants.ts` | Modified (added `OPENCLAW_ID_BASE`) | **Not modified** (spec constraint) |
| Coupling | Imports `PixelAgentsViewProvider` | Structural `AgentHost` interface (D5) |
| ID collision guard | None (relies on ID space) | Advances counter past existing openclaw IDs on each scan |

**Build:** `npm run compile` ✅ clean (tsc + eslint + esbuild + vite, zero errors)


---

## QA Review — commit c6dfe3e (pixel-qa, 2026-03-24)

### Verdict: ✅ APPROVED

**All 9 checks pass. Build clean. No blocking issues. 3 pre-conditions documented for M5.**

| Check | Result |
|-------|--------|
| `npm run build` | ✅ PASS — tsc + eslint + esbuild + vite, zero errors, zero warnings |
| ID collision safety (`OPENCLAW_ID_BASE = 100000`) | ✅ PASS — safe for M4 (no persistence yet) |
| Event bridging shapes (agentToolStart/Done/Status) | ✅ PASS — exact wire protocol match |
| `AgentState` registration — all required fields | ✅ PASS — all fields populated |
| Rescan deduplication guard | ✅ PASS — `sessionDisposables.has(key)` guard is correct |
| State hygiene (`activeToolStatuses` / `isWaiting`) | ✅ PASS — updated on every event, replay-safe |
| `dispose()` cleanup | ✅ PASS — stops all watchers + scan interval, clears tool queues |
| Claude Code regression | ✅ PASS — zero changes to Claude Code path |
| `extension.ts` integration | ✅ PASS — `context.subscriptions.push(startOpenClawWatcher(provider))` |

---

### ✅ PASS — Build Integrity
`npm run build` completes clean on commit `c6dfe3e`: `tsc --noEmit` → `eslint src` → `esbuild` → `vite build`.
Zero type errors, zero lint errors, zero build warnings.

---

### ✅ PASS — ID Collision Safety
`OPENCLAW_ID_BASE = 100000` is safe for M4.

- Claude Code IDs start at `nextAgentId.current = 1` (PixelAgentsViewProvider.ts:40) and increment by 1 per agent launch.
- OpenClaw IDs start at `openclawIdCounter = 100000` and increment.
- Since M4 does **not** call `persistAgents()`, `restoreAgents()` will never find OpenClaw agents in `workspaceState` and will never advance `nextAgentIdRef.current` into the OpenClaw range.
- Therefore, no collision is possible in M4.

**Pre-condition for M5 (see below):** When persistence is added, the current `maxId` logic in `restoreAgents()` will advance `nextAgentIdRef.current` past 100000, causing eventual collisions. Must be fixed before M5 adds persistence.

---

### ✅ PASS — Event Bridging Correctness
All three event types translate correctly to the webview wire protocol:

| Parser event | Webview message shape | Match? |
|---|---|---|
| `agentStatus { status:'working' }` | `{ type:'agentStatus', id:number, status:'active' }` | ✅ |
| `agentStatus { status:'idle' }` | `{ type:'agentStatus', id:number, status:'waiting' }` | ✅ |
| `agentToolStart { tool, input }` | `{ type:'agentToolStart', id:number, toolId:string, status:string }` | ✅ |
| `agentToolDone { tool }` | `{ type:'agentToolDone', id:number, toolId:string }` | ✅ |

Cross-checked against `sendCurrentAgentStatuses()` in `agentManager.ts` — replay on reconnect uses
`agent.activeToolStatuses` (Map toolId→status) and `agent.isWaiting`, both correctly maintained by
`handleParserEvent`. ✅

---

### ✅ PASS — Agent Registration
`buildOpenClawAgent()` populates all required `AgentState` fields:
- `id`, `source:'openclaw'`, `agentId`, `sessionKey`, `projectDir`, `jsonlFile` ✅
- All collections initialised: `activeToolIds` (empty Set), `activeToolStatuses`, `activeToolNames`,
  `activeSubagentToolIds`, `activeSubagentToolNames` (all empty Maps) ✅
- `isWaiting:false`, `permissionSent:false`, `hadToolsInTurn:false` ✅
- `fileOffset:0`, `lineBuffer:''` ✅ (parser starts fresh; re-reads from beginning on re-discover)
- `terminalRef` absent (openclaw source — correct per D3) ✅

---

### ✅ PASS — Rescan Deduplication
`registerSession()` guards on `sessionDisposables.has(key)` before registering. Module-level
`sessionDisposables` is local to the `startOpenClawWatcher` closure; each new VS Code session
starts fresh. Repeated scans of an already-watched session are correctly skipped. No duplicates
possible within a single VS Code session. ✅

---

### ✅ PASS — State Hygiene
`agent.activeToolStatuses` and `agent.activeToolNames` are updated on every `agentToolStart` /
`agentToolDone` event, even before the webview is ready. `agent.isWaiting` is updated on every
`agentStatus` event. This means `sendCurrentAgentStatuses()` (called by `sendExistingAgents` on
`webviewReady`) will replay the correct live state to a freshly connecting webview. ✅

---

### ✅ PASS — Dispose / Cleanup
`dispose()` in `startOpenClawWatcher`:
1. Sets `disposed = true` — prevents in-flight async scan from registering new sessions ✅
2. `clearInterval(scanTimer)` — stops periodic rescan ✅
3. Iterates `sessionDisposables`: calls `disposable.dispose()` for each session (stops
   `watchOpenClawAgent`'s triple-redundant watchers + idle timer) ✅
4. Calls `clearToolQueues(numericId)` for each session's tool ID queues ✅
5. `sessionDisposables.clear()` ✅

`watchOpenClawAgent.dispose()` (M3) separately handles `clearIdleTimer`, `fsWatcher.close()`,
`fs.unwatchFile`, `clearInterval(pollInterval)`. ✅

---

### ✅ PASS — Claude Code Regression
- `fileWatcher.ts`, `transcriptParser.ts`, `timerManager.ts` — zero changes ✅
- `agentManager.ts`, `PixelAgentsViewProvider.ts` — zero changes in M4 ✅
- `openclawWatcher.ts` imports `formatToolStatus` from `transcriptParser.ts` (read-only; no mutation) ✅
- Claude Code IDs (1, 2, 3…) and OpenClaw IDs (100000, 100001…) are disjoint ✅

---

### ✅ PASS — extension.ts Integration
```typescript
// After the three command registrations, before closing activate():
context.subscriptions.push(startOpenClawWatcher(provider));
```
- Returned `vscode.Disposable` is pushed to `context.subscriptions` → cleaned up on extension deactivate ✅
- `deactivate()` also calls `providerInstance?.dispose()` (PixelAgentsViewProvider) — unrelated to OpenClaw watcher, both run independently ✅
- Import is correct: `import { startOpenClawWatcher } from './openclawWatcher.js'` ✅

---

### 📝 MINOR NOTE 1 — `activeToolIds` not maintained for OpenClaw agents (not blocking)

`handleParserEvent` correctly updates `agent.activeToolStatuses` and `agent.activeToolNames` but
does **not** call `agent.activeToolIds.add(toolId)` / `agent.activeToolIds.delete(toolId)`.

This is **currently benign**: `activeToolIds` is only read in `transcriptParser.ts` and
`timerManager.startPermissionTimer()`, both of which are exclusively in the Claude Code path.
`sendCurrentAgentStatuses()` only iterates `activeToolStatuses`, not `activeToolIds`.

**Recommendation (not blocking):** For consistency and to prevent future surprise, add
`agent.activeToolIds.add(toolId)` on `agentToolStart` and `agent.activeToolIds.delete(toolId)` on
`agentToolDone` in `handleParserEvent`. Fix in M5 cleanup pass.

---

### ⚠️ PRE-CONDITION FOR M5 — `restoreAgents` calls `startFileWatching` for all sources

When M5 adds persistence for OpenClaw agents, `restoreAgents()` (agentManager.ts:307, 327) will
call `startFileWatching()` (the **Claude Code** parser) for openclaw-source agents, since there is
no `agentSource` guard around those calls.

Currently harmless (M4 doesn't persist OpenClaw agents). When M5 adds persistence:
- The Claude Code parser will watch OpenClaw JSONL files
- All OpenClaw-format lines (`type:'message'`) will be silently ignored (no Claude Code records)
- But `fileWatchers`, `pollingTimers`, `waitingTimers`, `permissionTimers` entries will be created
  for OpenClaw agent IDs, leaking resources

**Fix required in M5:** Add `if (agentSource !== 'claude-code') { continue; }` (or equivalent)
before the `startFileWatching` block at agentManager.ts line ~301.

---

### ⚠️ PRE-CONDITION FOR M5 — ID collision on `restoreAgents` counter advancement

When M5 persists OpenClaw agents, `restoreAgents()` will include their IDs (≥ 100000) in `maxId`
and set `nextAgentIdRef.current = 100001+`. New Claude Code agents would then get IDs ≥ 100001,
eventually colliding with new OpenClaw agents (also starting at 100000 on module reload).

**Fix required in M5:** Either:
- Exclude openclaw agent IDs from the `maxId` scan in `restoreAgents()`, OR
- Store openclaw agents' last-used counter in `workspaceState` and restore `openclawIdCounter` from it

---

### Summary

| Check | Result |
|-------|--------|
| Build integrity (`npm run build`) | ✅ PASS |
| ID collision safety (M4) | ✅ PASS |
| Event bridging — agentToolStart shape | ✅ PASS |
| Event bridging — agentToolDone shape | ✅ PASS |
| Event bridging — agentStatus shape + values | ✅ PASS |
| AgentState field completeness | ✅ PASS |
| Rescan deduplication | ✅ PASS |
| State hygiene (activeToolStatuses / isWaiting) | ✅ PASS |
| dispose() — scan timer + all watchers + tool queues | ✅ PASS |
| Claude Code path — zero regression | ✅ PASS |
| extension.ts — subscriptions cleanup | ✅ PASS |
| `activeToolIds` consistency | 📝 MINOR (benign for M4) |
| `restoreAgents` source-gate for `startFileWatching` | ⚠️ M5 PRE-CONDITION |
| ID counter collision on restore | ⚠️ M5 PRE-CONDITION |

**M5 may proceed. Two pre-conditions must be resolved before M5 adds OpenClaw persistence.**

---

## Current State: ⏳ M4 COMPLETE — Awaiting QA Review

---

## Sprint 3 (M4) — pixel-coder, 2026-03-24

### Summary
`src/openclawWatcher.ts` built — directory scanner + webview bridge. Auto-discovers OpenClaw sessions from `~/.openclaw/agents/` every 5 s and bridges `OpenClawParserEvent` → webview wire protocol using the existing `formatToolStatus` animation logic.

### Files changed
| File | Change |
|------|--------|
| `src/openclawWatcher.ts` | **New** — full M4 bridge layer (zero deps on modified files) |
| `src/extension.ts` | Added `startOpenClawWatcher(context, provider)` + `stopOpenClawWatcher()` |

### Exported API
```typescript
export function startOpenClawWatcher(
  context: vscode.ExtensionContext,
  provider: AgentHost,   // structural interface — satisfied by PixelAgentsViewProvider
): void

export function stopOpenClawWatcher(): void
```

`AgentHost` is a local structural interface `{ agents: Map<number, AgentState>; webviewView: vscode.WebviewView | undefined }`.  
No import of `PixelAgentsViewProvider` is required; loose coupling maintained (D5).

### Integration in extension.ts
```typescript
// activate():
startOpenClawWatcher(context, provider);

// deactivate():
stopOpenClawWatcher();
```

### Build
`npm run compile` — **✅ clean** (tsc + eslint + esbuild + vite, zero errors, zero warnings)

### Implementation notes

**1. ID allocation (D6)**
- IDs start at `10000` (constant defined in `openclawWatcher.ts`; constants.ts not modified)
- On each scan tick, counter is advanced past any existing openclaw agent IDs so VS Code restarts (where `restoreAgents` may already have populated `provider.agents`) never collide
- If an `agentId + sessionKey` pair is already in `provider.agents`, the existing numeric ID is reused — no duplicate registration

**2. Event translation (D7)**
| Parser event | Webview message |
|---|---|
| `agentStatus { status: 'working' }` | `{ type: 'agentStatus', id, status: 'active' }` |
| `agentStatus { status: 'idle' \| 'error' }` | `{ type: 'agentStatus', id, status: 'waiting' }` |
| `agentToolStart { tool, input }` | `{ type: 'agentToolStart', id, toolId, status }` (status via `formatToolStatus`) |
| `agentToolDone { tool }` | `{ type: 'agentToolDone', id, toolId }` |

**3. Tool ID correlation**
- `agentToolStart` generates a unique `toolId` string (`oclaw-<id>-<ts>-<rand5>`)
- Per-agent `Map<toolName, toolId>` correlates start events to their matching done events
- On idle, stale tool state is silently cleared from both the watcher map and `AgentState`

**4. Agent state hygiene**
- `agent.activeToolIds`, `activeToolStatuses`, `activeToolNames` kept in sync on every event so `sendCurrentAgentStatuses()` can re-hydrate the webview after panel reopen
- `agent.isWaiting` mirrors `idle/error → true`, `working → false`
- `terminalRef` never set — OpenClaw agents are terminal-free (D8)

**5. No existing files modified (except extension.ts wiring)**
- `fileWatcher.ts`, `transcriptParser.ts`, `agentManager.ts`, `constants.ts` — all untouched
- Claude Code path completely unaffected; both watchers coexist cleanly

---

## Current State: ✅ M3 FULLY APPROVED — Sprint 3 (M4) UNBLOCKED

---

## QA Re-Review — commit 54d0ad3 (pixel-qa, 2026-03-24)

### Verdict: ✅ APPROVED

**All 3 fixes confirmed. Build clean. M4 is unblocked.**

| Check | Result |
|-------|--------|
| `npm run build` | ✅ PASS — tsc + eslint + esbuild + vite, zero errors |
| Fix #1: `TOOL_NAME_MAP` uses Claude Code display names | ✅ PASS — `exec→Bash`, `web_search→WebSearch`, `web_fetch→WebFetch` |
| Fix #1: All 5 new entries present | ✅ PASS — `sessions_spawn→Task`, `memory_search→Grep`, `message→Write`, `image→Read`, `tts→Write` |
| Fix #1: Matches DECISIONS.md D7 | ✅ PASS |
| Fix #2: Type renamed `OpenClawParserEvent` throughout | ✅ PASS — 5 occurrences + JSDoc |
| Fix #2: Zero residual `WebviewMessage` references | ✅ PASS — `grep -rn WebviewMessage src/` → no matches |
| Fix #2: JSDoc documents M4 translation requirements | ✅ PASS — `agentId→id`, `working→active`, `idle→waiting` all documented |
| Bonus: `listOpenClawAgents()` uses `withFileTypes: true` | ✅ PASS |
| Bonus: `entry.isDirectory()` guard present | ✅ PASS |

**Sprint 3 (M4) is unblocked. Pixel-coder may proceed with `openclawWatcher.ts`.**

---

## QA Review — commit cac5c36 (pixel-qa, 2026-03-24)

### Verdict: ⚠️ REQUEST CHANGES

**2 required fixes (one architectural, one naming). 2 minor notes. Build passes clean.**

---

### ✅ PASS — Build Integrity
`npm run build` completes clean on commit `cac5c36`: `tsc --noEmit` → `eslint src` → `esbuild` → `vite build`.  
Zero type errors, zero lint errors, zero build warnings.

---

### ✅ PASS — JSONL Parsing Correctness
`openclawTranscriptParser.ts` correctly handles all three OpenClaw message shapes:

- **`role: 'assistant'` with `content: [{type:'tool_use', name, input, id}]`** — tool_use blocks are iterated, each block emits `agentToolStart`, `toolCallId` → `mappedName` is stored in `pendingTools`. ✅
- **`role: 'toolResult'` with `toolCallId, content`** — `pendingTools.get(toolCallId)` retrieves the mapped name, entry is deleted, `agentToolDone` is deferred by `TOOL_DONE_DELAY_MS`. Content extraction handles both `Array<{type:'text', text}>` and plain string. ✅
- **`type !== 'message'`** — silently skipped. ✅
- **Malformed JSON** — `JSON.parse` wrapped in try/catch, bad lines skipped. ✅
- **`ENOENT`** — `statSync` throws, caught in `readNewLinesForSession`'s outer try/catch, error logged. ✅
- **`missing OPENCLAW_AGENT_DIR`** — `listOpenClawAgents` catches `readdirSync` failure and returns `[]`. `watchOpenClawAgent` lets `fs.watch`/`fs.watchFile` fail (logged), falls back to interval poll; when the file eventually appears, `statSync` will succeed. ✅

---

### ✅ PASS — Idle Detection Logic
The 500ms silence timer is sound for single-threaded JavaScript:

- `clearIdleTimer` is called before rescheduling — no double-timers. ✅
- `scheduleIdleTimer` only emits `idle` if `pendingTools.size === 0` — prevents false idle during multi-tool turns. ✅
- `OPENCLAW_IDLE_DELAY_MS (500ms) > TOOL_DONE_DELAY_MS (300ms)` — the `agentToolDone` deferred emit always fires before the idle status is emitted. ✅
- No race conditions within the single JS event loop. ✅

---

### ✅ PASS — Pending Tool Tracking
`toolCallId` → tool name correlation is correct:
- Stored at tool_use time: `state.pendingTools.set(toolCallId, mappedName)`. ✅
- Retrieved at toolResult time: `toolCallId ? pendingTools.get(toolCallId) ?? '' : ''`. ✅
- If `toolResult` arrives with no matching `toolCallId` (orphan result): `toolName` is `''`, emit still fires, entry not double-deleted. Safe. ✅
- If `toolCallId` is undefined: the ternary short-circuits to `''`, no `.get(undefined)` call. ✅

---

### ✅ PASS — `listOpenClawAgents()` Directory Traversal
Correctly walks `<OPENCLAW_AGENT_DIR>/<agentId>/sessions/<sessionKey>.jsonl`:
- `readdirSync(OPENCLAW_AGENT_DIR)` gives agent name dirs. ✅
- `path.join(..., agentId, 'sessions')` is the correct path segment. ✅
- Filters `file.endsWith('.jsonl')`, strips with `file.slice(0, -6)`. ✅
- Returns `[]` if base dir missing. ✅

---

### ✅ PASS — `dispose()` Idempotency
Fully idempotent and leak-free:
- `clearIdleTimer` checks `state.idleTimer !== null` before clearing. ✅
- `fsWatcher` null-checked before `.close()`, set to `null` after. ✅
- `fs.unwatchFile` is safe to call with no active listener (no-op). ✅
- `pollInterval` null-checked before `clearInterval`, set to `null` after. ✅
- Second `dispose()` call: all guards pass, no double-free. ✅

---

### 🔴 REQUIRED FIX #1 — Tool Map Deviates from DECISIONS.md D7 AND Is Incomplete

**This must be resolved before M4 begins.**

#### What's implemented (`OPENCLAW_TOOL_MAP` in `openclawTranscriptParser.ts`):
```typescript
const OPENCLAW_TOOL_MAP: Record<string, string> = {
  Read: 'read_file',
  Write: 'write_file',
  Edit: 'edit_file',
  exec: 'run_command',
  web_search: 'web_search',    // pass-through
  web_fetch: 'web_fetch',      // pass-through
  browser: 'browser_action',
};
```

#### What DECISIONS.md D7 specifies:
```typescript
const OPENCLAW_TOOL_MAP: Record<string, string> = {
  exec: 'Bash',
  web_fetch: 'WebFetch',
  web_search: 'WebSearch',
  sessions_spawn: 'Task',
  memory_search: 'Grep',
  message: 'Write',
  browser: 'WebFetch',   // ← note: also WebFetch in D7
  image: 'Read',
  tts: 'Write',
};
// Read, Write, Edit pass through unchanged (D7 says "pass through")
```

#### Problems:

**A — Target names conflict with `formatToolStatus()`.**  
D7 says the mapping exists "so the existing `formatToolStatus()` animation logic works."  
`formatToolStatus()` recognises: `Read`, `Edit`, `Write`, `Bash`, `WebFetch`, `WebSearch`, `Task`, `Grep`, etc.  
The implementation maps to `read_file`, `write_file`, `run_command`, `browser_action` — none of which `formatToolStatus()` recognises. They all fall through to `` `Using ${toolName}` ``, defeating the purpose of the mapping entirely.

If M4's `openclawWatcher.ts` calls `formatToolStatus(mappedName, parsedInput)` (the natural assumption given D7), tool display will silently show `"Using read_file"`, `"Using run_command"`, etc., instead of the intended `"Reading foo.ts"`, `"Running: npm build"`, etc.

**B — 5 entries from D7 are missing:** `sessions_spawn`, `memory_search`, `message`, `image`, `tts`.  
These are real OpenClaw tools in active use. Missing entries will appear as their raw names in the UI.

**C — Conflict between STATUS.md M3 deliverable table and DECISIONS.md D7.**  
The STATUS.md table reflects the implementation (not D7). Either D7 must be updated (formally superseding the decision) or the implementation must be corrected. The current state is ambiguous — M4 author cannot know which spec to trust.

#### Required action (choose one):
- **Option A (preferred):** Align implementation with D7. Update `OPENCLAW_TOOL_MAP` to use Claude Code display names + add missing 5 entries. Update STATUS.md table. Do NOT update DECISIONS.md (D7 was always correct).
- **Option B:** Update DECISIONS.md D7 to formally supersede the Claude Code name requirement, document that M4 will do its own `formatToolStatus`-equivalent with the new names, add the 5 missing entries to the map in the new naming convention, and update STATUS.md table.

Either way, the map must be complete (all 9+ known OpenClaw tools) and consistent with whatever display logic M4 will use.

---

### 🔴 REQUIRED FIX #2 — `WebviewMessage` Name Is Misleading (Will Block M4 Integration)

**This is a naming/documentation fix, but it must be done before M4 to prevent integration errors.**

The exported type is named `WebviewMessage`:
```typescript
export type WebviewMessage =
  | { type: 'agentToolStart'; agentId: string; tool: string; input: string }
  | { type: 'agentToolDone';  agentId: string; tool: string; result: string }
  | { type: 'agentStatus';    agentId: string; status: 'working' | 'idle' | 'error' };
```

The actual webview message protocol (as consumed by `useExtensionMessages.ts`) is:
```typescript
// agentToolStart: { type: 'agentToolStart', id: number, toolId: string, status: string }
// agentToolDone:  { type: 'agentToolDone',  id: number, toolId: string }
// agentStatus:    { type: 'agentStatus',     id: number, status: 'active' | 'waiting' }
```

Three mismatches:
1. **`agentId: string` vs `id: number`** — webview indexes by numeric `id`, not string `agentId`
2. **Field names**: `tool`/`input`/`result` vs `toolId`/`status` (webview has no `input` or `result` fields)
3. **Status values**: `'working'/'idle'/'error'` vs `'active'/'waiting'` — different string literals, webview checks `status === 'active'` and `status === 'waiting'` explicitly

The intent (confirmed by STATUS.md "What's next") is that M4 `openclawWatcher.ts` translates this intermediate event into the real webview protocol. **That design is fine.** But:
- Calling it `WebviewMessage` implies it IS the webview protocol — it isn't
- An M4 author could plumb `emit(msg: WebviewMessage)` directly into `webview.postMessage()` and break silently (TypeScript wouldn't catch it because `postMessage` accepts `any`)
- The status enum values need explicit documentation so M4 knows to translate `'working'` → `'active'`, `'idle'` → `'waiting'`

#### Required action:
Rename `WebviewMessage` → `OpenClawParserEvent` (or similar) and add a JSDoc comment explicitly stating:
> "This is NOT the webview message shape. M4's openclawWatcher must translate: `agentId: string` → `id: number`, `tool`/`input`/`result` fields → `toolId`/`status` fields, and status values `'working'`→`'active'`, `'idle'`→`'waiting'`."

---

### 📝 MINOR NOTE 1 — `listOpenClawAgents` doesn't filter to directories

`readdirSync(OPENCLAW_AGENT_DIR)` returns all entries (files + dirs). Non-directory entries (e.g. a config file in the agents dir) will trigger a harmless `try/catch` failure on `readdirSync(agentId + '/sessions')`. Functionally safe, but wasteful and produces misleading log noise.

**Recommendation (not blocking):** Use `{ withFileTypes: true }` and filter:
```typescript
agentDirs = fs.readdirSync(OPENCLAW_AGENT_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);
```

---

### 📝 MINOR NOTE 2 — `user` role → immediate `idle` before deferred `agentToolDone`

When `role === 'user'` is parsed (new turn starting), the handler emits `agentStatus: idle` synchronously. But if any `setTimeout(TOOL_DONE_DELAY_MS)` callbacks are still pending from the previous turn's `toolResult` lines, those `agentToolDone` events will fire 300ms later — **after** the `idle` status. This creates an ordering glitch in the event stream:

```
agentStatus: idle  ← emitted now
agentToolDone      ← fires 300ms later (from previous turn)
```

In the current design (M4 translates before hitting the webview), this is unlikely to cause visible issues. But if M4 passes events directly to the webview, the webview may briefly show a stale tool indicator re-appear after the agent goes idle.

**Recommendation (not blocking this sprint):** Clear any pending deferred tool-done timers when a `user` turn starts. Requires tracking setTimeout handles (small refactor). Defer to M4/M5 cleanup if not needed before then.

---

### Summary Table

| Check | Result |
|-------|--------|
| Build integrity (`npm run build`) | ✅ PASS |
| JSONL parsing correctness (all message types) | ✅ PASS |
| Idle detection / race conditions | ✅ PASS |
| Pending tool tracking / toolCallId correlation | ✅ PASS |
| `listOpenClawAgents()` directory traversal | ✅ PASS |
| `dispose()` idempotency and leak safety | ✅ PASS |
| Tool name mapping — completeness vs DECISIONS.md D7 | 🔴 FAIL (5 missing entries, names conflict with `formatToolStatus`) |
| `WebviewMessage` shape vs actual webview protocol | 🔴 FAIL (misleading name, mismatched fields, mismatched status values) |
| `listOpenClawAgents` directory filtering | 📝 MINOR (no `isDirectory` check — safe but wasteful) |
| `user` turn → deferred toolDone ordering | 📝 MINOR (idle emitted before deferred toolDone — acceptable for now) |

---

### Required Actions (pixel-coder)
1. **Fix `OPENCLAW_TOOL_MAP`** — choose Option A or Option B from Required Fix #1 above. Add the 5 missing tool mappings. Update DECISIONS.md D7 if choosing Option B.
2. **Rename `WebviewMessage`** → `OpenClawParserEvent` (or similar), add JSDoc translation note for M4 author.

Once these two fixes land: re-submit for QA re-review.

---

## pixel-coder Fix Response — 2026-03-24

**Chosen approach: Option A (align with D7 — D7 was always correct).**

### Fix #1 — Tool name map: use Claude Code display names ✅
Replaced `OPENCLAW_TOOL_MAP` with `TOOL_NAME_MAP` in `src/openclawTranscriptParser.ts`:
- All 12 entries now map to Claude Code display names (`Read`, `Write`, `Edit`, `Bash`, `WebFetch`, `WebSearch`, `Grep`, `Task`)
- Added 5 previously missing entries: `sessions_spawn`, `memory_search`, `message`, `image`, `tts`
- `DECISIONS.md` D7 unchanged — implementation now matches it exactly

### Fix #2 — Rename `WebviewMessage` → `OpenClawParserEvent` ✅
- Exported type renamed from `WebviewMessage` to `OpenClawParserEvent`
- All 4 internal `emit` callback signatures updated
- JSDoc comment added above the type documenting that it is **not** the webview wire protocol and listing the 3 mappings M4 must perform

### Bonus — `listOpenClawAgents()` uses `withFileTypes: true` ✅
Top-level agent dir scan now uses `{ withFileTypes: true }` + `entry.isDirectory()`.
Non-directory entries are skipped cleanly without relying on try/catch.

### Build
`npm run build` — clean ✅ (tsc + eslint + esbuild + vite, zero errors/warnings)

---

## Current State: ✅ Sprint 1 FULLY APPROVED — M3 UNBLOCKED

pixel-qa reviewed commit d26c94e, flagged tilde literal in `OPENCLAW_AGENT_DIR`. pixel-coder fixed in commit 528f2a6. **QA re-review (2026-03-24, commit 528f2a6): APPROVED ✅** — `src/constants.ts` now uses `path.join(os.homedir(), '.openclaw', 'agents')` with proper `os`/`path` imports. `npm run build` passes clean. Sprint 1 fully complete. M3 is unblocked.

---

## QA Re-Review — commit 528f2a6 (pixel-qa, 2026-03-24)

### Verdict: ✅ APPROVED

**Previously flagged fix confirmed. All checks pass.**

---

## QA Review — commit d26c94e (pixel-qa, 2026-03-24)

### Verdict: ⚠️ REQUEST CHANGES (superseded by re-review above)

**1 required fix, 1 minor note. All other checks pass.**

---

### ✅ PASS — Build Integrity
`npm run build` completes clean: `tsc --noEmit` → `eslint src` → `esbuild` → `vite build`.  
No type errors, no lint errors, no build warnings.

### ✅ PASS — Source Gating Completeness
All terminal property accesses are guarded:
- `agent.terminalRef.show()` / `.dispose()` — behind `source === 'claude-code' && terminalRef` (PixelAgentsViewProvider.ts:106, 111)
- `agent.terminalRef === terminal/closed` — behind `source === 'claude-code'` (PixelAgentsViewProvider.ts:358, 369)
- `agent.terminalRef.name` — behind `source === 'claude-code' && terminalRef` (agentManager.ts:196-197)
- Terminal match in `restoreAgents()` — inside `if (agentSource === 'claude-code')` branch (agentManager.ts:233+)
- `fileWatcher.ts:191` — `agent.terminalRef === activeTerminal` loop has **no explicit source guard** *(see minor note below)*; functionally safe (undefined !== Terminal is always false), no crash risk, TypeScript accepts it. Low priority.

### ✅ PASS — Claude Code Regression Risk
- `p.source ?? 'claude-code'` default in `restoreAgents()` safely handles legacy persisted agents without `source` field.
- All 3 agent construction sites (`launchNewTerminal`, `adoptTerminalForFile`, `restoreAgents` claude-code branch) set `source: 'claude-code'` explicitly.
- `source` is required on `AgentState` (not optional), so TypeScript enforces it at every construction site.
- All Claude Code terminal paths are fully intact and unmodified in behavior.

### ✅ PASS — Type Safety
- `terminalRef?: vscode.Terminal` is optional; every read of `.show()`, `.dispose()`, `.name` is also behind a truthiness check. No unsafe property access anywhere.
- `fileWatcher.ts:191` equality comparison `agent.terminalRef === activeTerminal` is safe — comparing `T | undefined` to `T` is valid TypeScript; `undefined !== anyObject` is always false.

### 🔴 FAIL — Constants Placement (`OPENCLAW_AGENT_DIR`)
**Required fix before M3.**

```typescript
// src/constants.ts — CURRENT (broken for fs usage)
export const OPENCLAW_AGENT_DIR = '~/.openclaw/agents';
```

Node.js `fs` APIs (`fs.readdirSync`, `fs.watch`, `path.join(OPENCLAW_AGENT_DIR, ...)`) do **not** resolve `~`. The tilde is a shell expansion, not a Node.js path feature. `fs.readdirSync('~/.openclaw/agents')` will throw `ENOENT: no such file or directory`.

This is consistent with how the rest of the codebase handles home-relative paths — `agentManager.ts` uses `path.join(os.homedir(), '.claude', 'projects', dirName)`.

**Fix:**
```typescript
import * as os from 'os';
import * as path from 'path';

export const OPENCLAW_AGENT_DIR = path.join(os.homedir(), '.openclaw', 'agents');
```
Or, since `constants.ts` currently has no imports, define it as a function or move the path construction to `openclawWatcher.ts` where `os` is already imported. Either approach is acceptable — just don't store a raw `~` literal.

### 📝 MINOR NOTE — `fileWatcher.ts:191` (no action required this sprint)
The terminal ownership loop doesn't check `source` before comparing `terminalRef`:
```typescript
for (const agent of agents.values()) {
  if (agent.terminalRef === activeTerminal) { // no source guard
```
Functionally correct (openclaw agents have `undefined` terminalRef, never matches). Consider adding `agent.source === 'claude-code' &&` for clarity in a future cleanup pass. Not blocking.

### ✅ PASS — M3 Readiness
`agentId?` and `sessionKey?` are present on both `AgentState` and `PersistedAgent`. Positioned correctly (right after `source`, before `projectDir`). JSONL parser in M3 can populate these directly.

---

### Summary Table

| Check | Result |
|-------|--------|
| Build integrity (`npm run build`) | ✅ PASS |
| terminalRef gating completeness | ✅ PASS (1 minor ungated loop — safe) |
| Claude Code regression risk | ✅ PASS |
| Type safety | ✅ PASS |
| `OPENCLAW_AGENT_DIR` constant | ✅ PASS — fixed in 528f2a6 (`path.join(os.homedir(), ...)`) |
| M3 readiness (`agentId`, `sessionKey`) | ✅ PASS |

---

### ✅ Action Resolved (pixel-coder, 2026-03-24)
1. **Fixed `OPENCLAW_AGENT_DIR`** in `src/constants.ts` — commit 528f2a6. QA re-review confirmed. Sprint 1 fully approved.

---

## What's Done

- [x] Fork created at `nia-agent-cyber/pixel-agents`
- [x] Codebase fully read by pixel-pm (all 11 src files)
- [x] PID finalized by Remi
- [x] PROTOCOL.md created
- [x] STATUS.md created
- [x] DECISIONS.md created
- [x] Sprint 1 task breakdown complete
- [x] GitHub Discussion opened on pablodelucca/pixel-agents (upstream)
- [x] **M1**: `npm run build` verified passing on macOS arm64
- [x] **M1**: `OPENCLAW_AGENT_DIR` constant added to `src/constants.ts` (fixed: `os.homedir()` instead of tilde literal — 2026-03-24)
- [x] **M2**: `source` discriminator on `AgentState` and `PersistedAgent`
- [x] **M2**: `terminalRef` optional on `AgentState`; `terminalName` optional on `PersistedAgent`
- [x] **M2**: All 5 terminal access sites source-gated (agentManager×2, PixelAgentsViewProvider×4, fileWatcher×1)
- [x] **M3**: `src/openclawTranscriptParser.ts` — OpenClaw JSONL parser (2026-03-24)
- [x] **M3**: `OPENCLAW_IDLE_DELAY_MS` constant added to `src/constants.ts`
- [x] **M3**: `npm run build` passes clean — zero type errors, zero lint warnings

---

## What's Next (Sprint 1)

### M1 — Fork + Dev Environment (pixel-coder) ✅ DONE + QA APPROVED 2026-03-24
- [x] Verify `npm run build` passes on macOS (arm64) — passes after `webview-ui npm install`
- [ ] Run extension in F5 dev host, confirm existing Claude Code flow works (manual, deferred to QA)
- [x] Add `OPENCLAW_AGENT_DIR` constant to `src/constants.ts` (`~/.openclaw/agents`)
- [ ] Update `package.json` name/description for fork identity (deferred — not blocking)

### M2 — AgentState Abstraction (pixel-coder) ✅ DONE + QA APPROVED 2026-03-24
- [x] Add `source: 'claude-code' | 'openclaw'` to `AgentState`
- [x] Make `terminalRef` optional (`terminalRef?: vscode.Terminal`)
- [x] Add `agentId?: string` and `sessionKey?: string` to `AgentState`
- [x] Update `PersistedAgent` to handle both sources (added `source?`, `agentId?`, `sessionKey?`, `terminalName?` optional)
- [x] Gate `terminalRef.show()` / `terminalRef.dispose()` in `PixelAgentsViewProvider.ts`
- [x] Gate `terminalRef.name` in `persistAgents()` (agentManager.ts)
- [x] Gate terminal-match in `restoreAgents()` (agentManager.ts)
- [x] Gate `onDidChangeActiveTerminal` / `onDidCloseTerminal` with source checks
- [x] Added `source: 'claude-code'` to `fileWatcher.ts` `adoptTerminalForFile()` agent construction
- [x] Confirm build still passes (`npm run build` ✅)
- [x] Claude Code path unchanged — all terminal logic executes only when `source === 'claude-code'`

---

## Sprint 2 (M3) — ✅ COMPLETE (pixel-coder, 2026-03-24)

### M3: `openclawTranscriptParser.ts`

**Status:** ✅ DONE — `npm run build` passes clean (tsc + eslint + esbuild + vite).

**Deliverables:**
- `src/openclawTranscriptParser.ts` — new pure file, zero changes to any upstream file
- `src/constants.ts` — added `OPENCLAW_IDLE_DELAY_MS = 500` (silence threshold for turn-end detection)

**Exported API surface:**
```typescript
/**
 * Internal event format — NOT the webview wire protocol.
 * M4 must translate: agentId(string)→id(number), 'working'→'active', 'idle'→'waiting'.
 */
export type OpenClawParserEvent =
  | { type: 'agentToolStart'; agentId: string; tool: string; input: string }
  | { type: 'agentToolDone';  agentId: string; tool: string; result: string }
  | { type: 'agentStatus';    agentId: string; status: 'working' | 'idle' | 'error' };

export function watchOpenClawAgent(
  agentId: string,
  sessionKey: string,
  emit: (msg: OpenClawParserEvent) => void,
): vscode.Disposable;

export async function listOpenClawAgents(): Promise<
  { agentId: string; sessionKey: string }[]
>;
```

**Tool name map — aligned with DECISIONS.md D7 (Fix #1 applied 2026-03-24):**
| OpenClaw raw | Displayed as (Claude Code display name) |
|---|---|
| `Read` | `Read` |
| `Write` | `Write` |
| `Edit` | `Edit` |
| `exec` | `Bash` |
| `web_search` | `WebSearch` |
| `web_fetch` | `WebFetch` |
| `browser` | `WebFetch` |
| `sessions_spawn` | `Task` |
| `memory_search` | `Grep` |
| `message` | `Write` |
| `image` | `Read` |
| `tts` | `Write` |
| *(any other)* | raw tool name |

**Edge cases noted:**
1. **File doesn't exist yet** — `readNewLinesForSession` swallows `ENOENT`; watcher will catch up when file appears (same as Claude Code polling pattern in `launchNewTerminal`).
2. **Tool result with no `toolCallId`** — safe: `pendingTools.get(undefined)` returns `undefined`, tool name is `''`, result still emitted.
3. **Idle timer with pending tools** — `scheduleIdleTimer` only emits `idle` if `pendingTools.size === 0`; prevents false idle during slow tool execution.
4. **`listOpenClawAgents` on missing directory** — returns `[]` (not an error); safe for fresh installs.
5. **`dispose()` called multiple times** — idempotent: null-checks on `fsWatcher` and `pollInterval` prevent double-close errors.

**What's next:** M4 — `openclawWatcher.ts` (directory scanner + bridge to numeric agent IDs for the existing webview protocol).

---

## Sprint 3 Complete (M4) / Sprint 4 Complete (M5)

- [x] **M4**: `openclawWatcher.ts` — directory scanner + webview bridge ✅ DONE (2026-03-24)
- [x] **M5**: Persistence guards + extension wiring ✅ DONE + QA APPROVED (2026-03-24)
  - Fix 1: `restoreAgents` source-gates `startFileWatching` to `claude-code` only
  - Fix 2: `maxId` scan excludes OpenClaw IDs via `OPENCLAW_AGENT_ID_START` constant (10000) — no counter collision
  - Fix 3: `context.subscriptions.push({ dispose: stopOpenClawWatcher })` — proper VS Code lifecycle cleanup
  - Fix 4: `activeToolIds` already maintained in M4 Rev2 (confirmed, no change needed)
  - Build: `npm run compile` ✅ clean — OpenClaw agents fully live end-to-end
  - **Extension is end-to-end functional. Ready for devops (niavoice.com/office deployment).**

---

## Blockers

None currently.

---

## Open Questions

1. Should OpenClaw agents be persisted across VS Code restarts (like Claude Code agents are)?  
   → Recommendation: Yes, persist by `agentId + sessionKey` instead of `terminalName`
2. Should we gate Sprint 2 on upstream response to the GitHub Discussion?  
   → Recommendation: No — proceed independently, upstream PR is Phase 2

---

## Architecture Notes (for coder)

### Key tension: terminal coupling
The codebase assumes every agent has a `vscode.Terminal`. Four places need source-gating:
1. `types.ts` → `terminalRef` optional
2. `agentManager.ts` → `persistAgents()`, `restoreAgents()`
3. `PixelAgentsViewProvider.ts` → `focusAgent`, `closeAgent`, `onDidCloseTerminal`
4. `fileWatcher.ts` → `adoptTerminalForFile()` — Claude Code only, not touched for OpenClaw

### JSONL format delta
Claude Code format: `{ type: 'assistant', message: { content: [{type:'tool_use',...}] } }`  
OpenClaw format: `{ type: 'message', message: { role: 'assistant', content: [{type:'tool_use',...}] } }`  
Tool result in Claude Code: `{ type: 'user', message: { content: [{type:'tool_result',...}] } }`  
Tool result in OpenClaw: `{ type: 'message', message: { role: 'toolResult', toolCallId: '...', ... } }`  

### No turn-end signal in OpenClaw
Claude Code has `type: 'system', subtype: 'turn_duration'` — reliable turn-end.  
OpenClaw has no equivalent. Use silence-based timer (same as Claude Code's `TEXT_IDLE_DELAY_MS` fallback).

### Tool name mapping (OpenClaw → Claude Code animation)
| OpenClaw | Claude Code equivalent |
|----------|----------------------|
| exec | Bash |
| Read | Read |
| Write | Write |
| Edit | Edit |
| web_fetch | WebFetch |
| web_search | WebSearch |
| sessions_spawn | Task |
| memory_search | Grep |
| message | Write |
| browser | WebFetch |
| image | Read |
| tts | Write |
| *(any other)* | (default: `Using ${toolName}`) |
