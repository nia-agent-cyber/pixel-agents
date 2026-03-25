# STATUS.md — pixel-bridge Project Status

**Last updated:** 2026-03-25  
**Updated by:** pixel-pm  
**Current sprint:** Sprint 6 in progress (M8 + M9)

---

## Current State: ✅ SPRINT 5 COMPLETE — Web pixel office live at office.niavoice.org

---

## Sprint 6 — Agent Detail Panel + README Overhaul

**Goal:** Graduate the pixel office from "demo" to "daily tool" by unlocking agent context on click and making the project self-documenting.  
**Milestones:** M8 (Agent Detail Panel) + M9 (README overhaul)  
**Status:** 🚀 IN PROGRESS  
**Kicked off:** 2026-03-25

---

### M8 — Agent Detail Panel (click → inspect)

**Summary:** Clicking a pixel character in the browser office opens a lightweight overlay panel showing live agent context — label, status, recent tool calls, and time since last activity.

#### Acceptance Criteria (all must pass)

| # | Criterion | How to verify |
|---|-----------|---------------|
| AC1 | Clicking any pixel character opens the detail panel | Click a character in the browser office → panel appears |
| AC2 | Panel shows agent label + session key (copyable) | Panel renders `label` and `sessionKey` fields; click-to-copy works |
| AC3 | Panel shows current status badge (active / waiting / removed) with correct colour | Trigger tool activity → badge turns active (green); tool completes → waiting (yellow) |
| AC4 | Panel shows last 3–5 tool calls with display status strings | Run 3+ tools in a session → panel lists them in reverse chronological order |
| AC5 | Panel shows "X seconds/minutes ago" time since last activity | Check panel after a period of agent inactivity — time updates each render |
| AC6 | Panel is dismissed by clicking outside it or pressing Escape | Click backdrop / press Escape → panel closes |
| AC7 | Panel only renders in browser runtime (isBrowserRuntime guard) | VS Code webview path: no panel component loaded; no JS errors |
| AC8 | `npm run build` passes clean (zero errors/warnings) | Run `cd webview-ui && npm run build` |
| AC9 | Built output copied to `office-server/public/ui/` | Files in `office-server/public/ui/assets/` are newer than source |

#### Files to Create / Modify

| File | Change |
|------|--------|
| `webview-ui/src/browserAgentFeed.ts` | Expose `agentDetailStore` — module-level Map keyed by numericId, tracking `{ label, sessionKey, status, recentTools: string[], lastActivityAt: number }`. Update all event handlers to write into this store alongside existing dispatch calls. Export `subscribeAgentDetail(id, cb)` and `getAgentDetail(id)`. |
| `webview-ui/src/components/AgentDetailPanel.tsx` | **New** — lightweight overlay React component. Props: `agentId: number \| null`, `onClose: () => void`. Reads from `getAgentDetail(agentId)` and re-renders on a 1-second `setInterval` (for live "time since" update). No new npm deps — plain React + inline styles. |
| `webview-ui/src/App.tsx` | Wire click handler on pixel characters (in `isBrowserRuntime` path only). Track `selectedAgentId: number \| null` in local state. Render `<AgentDetailPanel>` when non-null. |

#### Gotchas / Dependencies

- **Data source is already tracked**: `activeAgents` Map in `browserAgentFeed.ts` has numericId, pendingTools. We need to *extend* it with `recentTools` ring buffer (keep last 5) and `lastActivityAt` timestamp. No new SSE events needed.
- **Click target**: Pixel characters are rendered in the canvas/SVG layer. Identify the correct click event attachment point in the existing component tree (likely the character `<div>` or `<img>` in the office renderer). The click handler must pass the agent's numericId.
- **TypeScript strict**: No `enum`, `import type` for type-only, `noUnusedLocals`/`noUnusedParameters` enforced. Use `as const` for status values.
- **isBrowserRuntime guard**: `AgentDetailPanel` must never be imported in the VS Code path. Use dynamic import or conditional rendering gated on `isBrowserRuntime` from `runtime.ts`.
- **Rebuild + copy**: After `npm run build`, copy output to `office-server/public/ui/` (the `build:standalone` script does this automatically).

---

### M9 — README Overhaul

**Summary:** The current README has zero mention of the OpenClaw adapter, the web office, or `office.niavoice.org`. This milestone makes the project self-serve.

#### Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| AC1 | README has `## OpenClaw Web Office` section with self-serve setup steps | Read README — section present with numbered setup instructions |
| AC2 | Setup steps cover: clone → `npm install` → start `office-server` → visit URL | Steps are complete enough that a developer can self-serve without asking |
| AC3 | Features list mentions OpenClaw support + web office | `## Features` section updated |
| AC4 | Screenshot referenced using `office-server/public/ui/Screenshot.jpg` | `![Web Office Screenshot](office-server/public/ui/Screenshot.jpg)` or similar in README |
| AC5 | Install instructions cover both VS Code extension path AND web-only path | Two install paths clearly labelled |
| AC6 | `office.niavoice.org` URL mentioned as the live instance | URL appears in the README |

#### Files to Modify

| File | Change |
|------|--------|
| `README.md` | Add `## OpenClaw Web Office` section; update Features; add screenshot; dual install instructions |

#### Gotchas / Dependencies

- Check existing `README.md` structure before inserting — place new section logically (after Features, before Contributing or at end of setup section).
- Screenshot file exists at `office-server/public/ui/Screenshot.jpg` — use a relative path that renders correctly on GitHub.
- Keep the existing VS Code extension install instructions intact — do not replace, only augment.
- No build step required for this milestone.

---

## Sprint 7 — Upstream PR + Browser Push Notifications

**Goal:** Make the project discoverable via upstream PR and turn the pixel office into a tool you depend on (not just admire) via push notifications.  
**Milestones:** M10 (Upstream PR) + M11 (Browser push notifications)  
**Status:** ⏳ BLOCKED — starts after Sprint 6 QA approval  

---

### M10 — Upstream PR to pablodelucca/pixel-agents

**Summary:** Open the Phase 2 PR to upstream to validate the architecture and create organic discoverability.

#### Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| AC1 | `nia-agent-cyber/pixel-agents:main` rebases cleanly onto `pablodelucca/pixel-agents:main` | `git rebase upstream/main` exits 0 (or manual conflict resolution documented) |
| AC2 | PR opened with a description explaining the OpenClaw adapter design (D1–D9 points) | PR URL exists; description covers architecture decisions |
| AC3 | PR description includes a screenshot of the live web office | `office.niavoice.org` screenshot or `Screenshot.jpg` embedded in PR body |
| AC4 | CI passes on the PR branch | GitHub checks green |
| AC5 | PR receives at least one comment from upstream maintainer (stretch) | pablodelucca leaves a review comment |

#### Files to Create / Modify

| File | Change |
|------|--------|
| None new | Rebase + open PR. May require minor conflict resolution in `package.json` / `CHANGELOG.md` if upstream has diverged. |

#### Gotchas / Dependencies

- **Rebase first**: Check `git log --oneline upstream/main..HEAD` to understand divergence before opening the PR.
- **PR description**: Should explain D1 (zero OpenClaw changes), D2 (fork rationale), D4/D5 (separate parser/watcher files), the browser office architecture — enough that a stranger understands the design intent.
- **upstream remote**: Add `upstream` remote if not present: `git remote add upstream https://github.com/pablodelucca/pixel-agents.git`.
- **Don't force-push `main` after PR**: Create a feature branch `feature/openclaw-adapter` for the upstream PR to avoid disrupting our `main`.

---

### M11 — Browser Push Notifications

**Summary:** When an agent transitions from `active` → `waiting`, fire a browser Notification API alert. Closes the loop for background-tab usage.

#### Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| AC1 | On first load, browser prompts for notification permission | Open `office.niavoice.org` in a fresh browser → `Notification.requestPermission()` dialog appears |
| AC2 | When an agent transitions `active` → `waiting`, a browser notification fires | Trigger a tool run; wait for completion → notification appears (even with tab in background) |
| AC3 | Notification shows agent label + last tool used | Check notification body |
| AC4 | Notification does NOT fire for agents that just connected (status `waiting` from cold `agentAdded`) | Connect to a live session → no notification on initial waiting state |
| AC5 | Notification does NOT fire for `active` → `waiting` transitions within 2s of `agentAdded` | Reconnect replay: agents that appear and immediately go to waiting do not notify |
| AC6 | Only fires in browser runtime (isBrowserRuntime guard) | VS Code webview path: no notification code loaded |
| AC7 | `npm run build` passes clean | `cd webview-ui && npm run build` |

#### Files to Create / Modify

| File | Change |
|------|--------|
| `webview-ui/src/browserNotifications.ts` | **New** — notification manager. `initBrowserNotifications()` requests permission once. `notifyAgentWaiting(label, lastTool)` fires notification if permission granted. Tracks `agentAddedAt: Map<numericId, number>` to filter 2s cooldown. |
| `webview-ui/src/browserAgentFeed.ts` | On `active` → `waiting` transition: call `notifyAgentWaiting(label, lastTool)` from `browserNotifications.ts`. Pass `lastActivityAt` from the detail store for cooldown check. |
| `webview-ui/src/App.tsx` | Call `initBrowserNotifications()` in `isBrowserRuntime` useEffect alongside `initBrowserAgentFeed()`. |

#### Gotchas / Dependencies

- **Browser Notification API availability**: check `'Notification' in window` before calling — Safari has quirks; wrap in guard.
- **Permission must be requested in a user gesture context** (or on first load before tab goes background). Request in a `useEffect` or after a user interaction — not in a background callback.
- **`active` → `waiting` detection**: `browserAgentFeed.ts` currently dispatches `agentStatus: waiting` both on cold `agentAdded` (never active) and on `toolDone` with no pending tools (was active). Need to track `previousStatus` per agent to differentiate. Add `previousStatus` field to the `activeAgents` store entry.
- **2s cooldown**: `Date.now() - agentAddedAt > 2000` before notifying. Store `agentAddedAt` in the detail store when `onAgentAdded` fires.
- **Rebuild + copy** after changes.

---

## Sprint 8 — Session Transcript Viewer

**Goal:** Full in-browser session log for agents that errored or completed. Useful for post-mortem reviews.  
**Milestone:** M12 (Session transcript viewer)  
**Status:** ⏳ ON HOLD — start only if M8 panel is insufficient for daily use after Sprint 6 validation  

---

### M12 — Session Transcript Viewer

**Summary:** Extend the M8 detail panel with an expandable "View full log" link that loads the last N JSONL events as a structured, read-only log panel.

#### Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| AC1 | `GET /api/agents/:agentId/sessions/:sessionKey/transcript?last=30` returns structured JSON | `curl` the endpoint → array of `{ type, tool?, input?, output?, timestamp }` objects |
| AC2 | Endpoint streams last `N` lines (default 30, configurable via query param) | Pass `?last=10` → exactly 10 or fewer entries returned |
| AC3 | Web UI shows a compact read-only log panel expandable from the M8 detail panel | Click "View full log" in the detail panel → transcript panel opens below |
| AC4 | Tool calls shown with tool name + truncated input/output | Each entry shows tool name and ≤120 chars of input/output |
| AC5 | Panel is scrollable and closes without affecting the main office view | Scroll within panel; close → office returns to normal |
| AC6 | Endpoint only reads existing JSONL files — no new state maintained | Server: reads file, parses last N lines, returns, exits. No in-memory state. |
| AC7 | `npm run build` passes clean and `node office-server/server.js` starts without errors | Build + server start checks |

#### Files to Create / Modify

| File | Change |
|------|--------|
| `office-server/server.js` | New `GET /api/agents/:agentId/sessions/:sessionKey/transcript` endpoint. Reads the JSONL file (tail last N lines), parses each line, returns JSON array. Declare BEFORE the existing `/:agentId/sessions/:sessionKey/events` route. |
| `webview-ui/src/components/TranscriptViewer.tsx` | **New** — read-only log component. Fetches from transcript endpoint on mount. Renders list of tool events. Expandable from `AgentDetailPanel`. |
| `webview-ui/src/components/AgentDetailPanel.tsx` | Add "View full log" toggle that mounts/unmounts `TranscriptViewer`. |

#### Gotchas / Dependencies

- **Route order**: New transcript endpoint must be declared BEFORE `/:agentId/sessions/:sessionKey/events` to avoid Express param collision. Double-check route ordering.
- **JSONL tail**: For large files, avoid reading the entire file. Read last N lines efficiently using a seek-to-end approach or a streaming reverse-read (the file can be many MB for long sessions).
- **Hold condition**: Only start M12 if M8 panel proves insufficient for daily use. Validate after 1 week of real Sprint 6 usage. If the panel covers 80%+ of the debugging need, skip M12 this sprint.
- **Dependency on M8**: M12 UI extends the M8 panel — M8 must be merged and stable before M12 begins.

---

## Next Steps

**Analysis by:** pixel-ba, 2026-03-25  
**Post-sprint:** Sprint 5 (M6 live agent feed + M7 standalone web build)

---

### 1. Recommended Priority: **Polish + Validate**

Sprint 5 shipped the product into the world. The pixel office is live, agents appear in real time, layout persists across reloads. The stack is sound.  

But the question is: *does anyone actually use it daily?*  

Right now the office is **visually compelling but informationally thin** — you see characters moving, but you can't tell what any agent is doing without cross-referencing a terminal. Before building more features, we need to (a) unlock daily utility through polish, and (b) open the project to external eyes via the upstream PR. Adding more scope before validating the core value proposition risks building the wrong things.

**Priority order:** Polish → Validate → Build

---

### 2. Top Actions for Sprint 6

---

#### M8 — Agent Detail Panel (click → inspect) 🔥 **HIGHEST IMPACT**

**What:** Clicking a pixel character opens a lightweight overlay/tooltip showing:
- Agent label + session key (copyable)
- Current status badge (active / waiting / removed)
- Last 3–5 tool calls with their display status strings (e.g. "Reading src/App.tsx", "Running: npm build")
- Time since last activity

**Rationale:** The office currently gives you *presence* but not *context*. Presence is fun once; context is what makes you keep the tab open. The client already has all this data — `activeAgents` in `browserAgentFeed.ts` tracks pending tools and statuses. This is mostly a UI-layer addition (no new API endpoints needed). High reward, moderate effort.

**Success signal:** Remi keeps `office.niavoice.org` open in a background tab without being prompted.

---

#### M9 — README overhaul: OpenClaw + Web Office docs 📖

**What:** The current README says "works with Claude Code" and has zero mention of the OpenClaw adapter, the web office, or `office.niavoice.org`. Update to include:
- A "## OpenClaw Web Office" section with self-serve setup steps
- Screenshot or GIF of live agents in the web office
- Brief description of the VS Code extension path vs the web-only path
- Update the Features list to mention OpenClaw support

**Rationale:** The product is distributable but invisible. Anyone landing on the repo sees a Claude Code extension. Our most differentiated work (no-VS-Code browser office) is undocumented. A good README unlocks organic sharing — Remi can paste the link; a colleague can self-serve without a Telegram explanation.

**Success signal:** Someone outside the team visits `office.niavoice.org` and gets it running without asking for help.

---

#### M10 — Upstream PR to pablodelucca/pixel-agents 🔁

**What:** Open the Phase 2 PR to upstream. Even if it takes weeks to merge, this:
1. **Validates the architecture** — upstream maintainer review is the highest-quality external QA we can get. Their feedback will surface integration issues we've normalized.
2. **Creates discoverability** — the upstream has VS Code Marketplace presence and GitHub stars. Our OpenClaw adapter becomes findable by anyone already using Pixel Agents.
3. **Forces cleanup** — the diff must make sense to a stranger. Writing the PR description surfaces any rough edges.

Pre-work: confirm our `main` rebases cleanly onto upstream `main`; write a concise PR description explaining the OpenClaw adapter design (D1–D9 architecture points).

**Success signal:** PR opened, pablodelucca leaves at least one comment (even "needs changes").

---

#### M11 — Browser push notifications (agent idle after active) 🔔

**What:** When an agent transitions from `active` → `waiting`, fire a browser Notification API alert with the agent label and last tool used. Requires a one-time permission prompt; subsequently zero UX friction.

**Rationale:** This is the feature that turns the pixel office from a dashboard you glance at into a tool you depend on. The office is designed to run in a background tab. Notifications close the loop — you kick off a 20-minute build, forget about it, and the browser pings you when it's done. Without notifications, the office is ambient art. With notifications, it's actionable.

**Note:** Only notify on the `waiting` transition when the previous status was `active` (not on initial `agentAdded`). Filter out transitions that happen within 2s of agent creation (avoids noise on reconnect replay).

**Success signal:** Remi reports the office notification fired at least once usefully during a real work session.

---

#### M12 (Stretch) — Session transcript viewer 📜

**What:** New API endpoint `GET /api/agents/:agentId/sessions/:sessionKey/transcript?last=30` that streams the last N JSONL lines as structured JSON. Web UI shows a compact read-only log panel (expandable from the M8 detail panel). Tool calls shown with their full inputs/outputs.

**Rationale:** The M8 panel gives you the last 5 actions. The transcript viewer gives you the full context. Useful when an agent errors and you want to know why without switching windows. Also useful for reviewing what a subagent did after it finished.

**Effort:** Medium. The server already has the JSONL reading infrastructure (used by the VS Code extension path and the SSE feed). Exposing it as a REST endpoint is low-complexity. UI is the main work.

**Hold until M8 is validated.** If the M8 panel is enough for daily use, M12 may not be needed this sprint.

---

### 3. What Success Looks Like for Sprint 6

**Milestone:** The office graduates from "demo" to "daily tool."

| Signal | Target |
|--------|--------|
| `office.niavoice.org` open in at least one person's browser unprompted | ✅ by end of sprint |
| Upstream PR opened on `pablodelucca/pixel-agents` | ✅ by end of sprint |
| Agent detail panel shipped (M8) | ✅ by end of sprint |
| README documents OpenClaw + web office | ✅ by end of sprint |
| Browser notification fires at least once in real use | ✅ by end of sprint |
| Upstream PR receives external comment | 🎯 stretch |

---

### Riskiest Assumption Still Untested

**"The pixel office is useful, not just fun."**  

Every feature built so far has been infrastructure: parsing, wiring, persistence. We haven't tested whether a non-developer wants to stare at pixel characters to monitor agents. The office is architecturally sound. What's unvalidated is the value proposition: does ambient visualization of agent activity actually help Remi (or anyone else) work better, or is it a one-time novelty?

M8 (detail panel) + M11 (notifications) are the two features that turn novelty into utility. They should be validated before M12 or any further infrastructure work.

Secondary risk: **stale session detection may be too aggressive.** The 5-minute no-activity timeout could prematurely remove agents that are paused for long model inference or waiting for permission. Worth monitoring with real multi-agent sessions.

---

---

## QA Review — commits c35be24 + 2b8cab1 (pixel-qa, 2026-03-25)

### Verdict: ✅ APPROVED

**All checks pass. Builds clean. Functional smoke test confirmed. M7 is ready to ship.**

| Check | Result |
|-------|--------|
| `basicAuth` applied globally before `/ui` static route (line 83 before 89) | ✅ PASS |
| `/ui` served via `express.static` behind auth | ✅ PASS |
| `GET /api/layout` — returns `{}` on ENOENT | ✅ PASS |
| `PUT /api/layout` — writes `~/.openclaw/pixel-office-layout.json`, returns `{ok:true}` | ✅ PASS |
| `GET /api/seats` — returns `{}` on ENOENT | ✅ PASS |
| `PUT /api/seats` — writes `~/.openclaw/pixel-office-seats.json`, returns `{ok:true}` | ✅ PASS |
| `/api/agents/events` (L553) declared before `/:agentId/sessions/:sessionKey/events` (L580) | ✅ PASS |
| `initBrowserAgentFeed()` exported from `browserAgentFeed.ts` | ✅ PASS |
| Called in `App.tsx` `isBrowserRuntime` useEffect via dynamic import | ✅ PASS |
| All 5 SSE event types handled: `agentAdded`, `agentRemoved`, `toolStart`, `toolDone`, `text` | ✅ PASS |
| `agentAdded` → `dispatch agentAdded + agentStatus:waiting` | ✅ PASS |
| `toolStart` → `dispatch agentToolStart + agentStatus:active` | ✅ PASS |
| `toolDone` → `dispatch agentToolDone`; if no pending tools → `agentStatus:waiting` | ✅ PASS |
| Exponential backoff: `min(retryDelay*2, 30000)`, initial 1s | ✅ PASS |
| `vscodeApi.ts` browser runtime: `saveLayout` → `PUT /api/layout` | ✅ PASS |
| `vscodeApi.ts` browser runtime: `saveAgentSeats` → `PUT /api/seats` | ✅ PASS |
| `office-server/public/ui/index.html` exists | ✅ PASS |
| `assets/` contains `characters/`, `floors/`, `furniture/`, `browserAgentFeed-*.js` | ✅ PASS |
| `App.tsx` fetches `/api/layout` + `/api/seats` on init; dispatches `existingAgents` then `layoutLoaded` | ✅ PASS |
| `npm run build` (webview-ui) — tsc + vite, zero errors/warnings | ✅ PASS |
| `npm run compile` (root) — tsc + eslint + esbuild + vite, zero errors/warnings | ✅ PASS |
| Functional: `GET /ui/` with auth → HTTP 200 | ✅ PASS |
| Functional: `GET /ui/` without auth → HTTP 401 | ✅ PASS |
| Functional: `PUT /api/layout` roundtrip persists correctly | ✅ PASS |

### Notes

- Route order: `/api/agents/events` (3 path segments, L553) appears AFTER `/api/agents/:agentId/sessions/:sessionKey` (5 segments, L537) in source. This is fine — different segment counts cannot collide. The critical ordering (before the 6-segment `/:agentId/sessions/:sessionKey/events` at L580) is correct.
- `express.json()` middleware added after `basicAuth` and before all routes — correct placement for PUT body parsing.
- `vscodeApi.ts` uses `Record<string, unknown>` cast (no `any`) for TypeScript-compliant message type narrowing — clean.
- `App.tsx` init restore sequence (seats/`existingAgents` first, then layout/`layoutLoaded`) matches the spec ordering requirement for correct desk placement.

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

## QA Review — commits 887c427 + d446b8d (pixel-qa, 2026-03-25)

### Verdict: ✅ APPROVED

**All checks pass. Build clean. Smoke test confirmed. M7 is unblocked.**

| Check | Result |
|-------|--------|
| Route order: `/api/agents/events` before `/:agentId/sessions/:sessionKey/events` (line 507 vs 534) | ✅ PASS |
| `feedClients` Set + `knownSessions`/`activeSessions` Maps — module-level | ✅ PASS |
| `resetStaleTimer` — clears existing, fires `agentRemoved` + `stopSessionFeed` on expiry | ✅ PASS |
| `scanForNewSessions` — deduplicates via `knownSessions.has(key)`, `broadcastFeedEvent` + `startSessionFeed` | ✅ PASS |
| Heartbeat `: heartbeat\n\n` every 15s (`FEED_HEARTBEAT_MS = 15000`) | ✅ PASS (smoke tested) |
| `agentAdded` replayed for all `knownSessions.values()` on new client connect | ✅ PASS (smoke tested) |
| `startFeedWatcher()` called inside `app.listen` callback | ✅ PASS |
| `initBrowserAgentFeed()` → `connect(1000)` → `new EventSource('/api/agents/events')` | ✅ PASS |
| Sequential numeric IDs (`nextAgentId` starts at 1, increments in `onAgentAdded`) | ✅ PASS |
| All 5 SSE event types handled: `agentAdded`, `agentRemoved`, `toolStart`, `toolDone`, `text` | ✅ PASS |
| Exponential backoff: `nextDelay = Math.min(retryDelayMs * 2, 30000)`, initial 1s | ✅ PASS |
| TypeScript strict: no `enum`, no `: any`, no unused locals | ✅ PASS |
| `App.tsx` dynamic import `browserAgentFeed.js` in `isBrowserRuntime` useEffect | ✅ PASS |
| `npm run build` — tsc + vite, zero errors/warnings | ✅ PASS |
| Server smoke test — SSE headers (`text/event-stream`, `no-cache`, `keep-alive`) | ✅ PASS |
| Server smoke test — heartbeat at ~15s, `agentAdded` replay on connect | ✅ PASS |

### Notes

- Route order concern is real but benign for current route set: `/api/agents/events` (3 path segments)
  cannot be captured by `/api/agents/:agentId/sessions/:sessionKey` (5 segments) or its `/events`
  variant (6 segments). Placement before the parameterized routes is correct and future-proof.
- Minor race in `startSessionFeed`: `fs.watch` registered before EOF seek means a file write
  in the ~1ms window could trigger a history replay. Acceptable — same pattern as VS Code extension
  watcher; window is negligible in practice.
- `onToolDone` fallback when `toolCallId` is undefined uses `''` as lookup key rather than tool
  name. In practice OpenClaw always provides `toolCallId`; edge case is benign.
- Build output: `browserAgentFeed-D_eSqtgk.js` (1.64 kB gzip: 0.73 kB) — correctly code-split.

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

## Sprint 5 (M7) — pixel-coder, 2026-03-25

### Summary

Standalone build + layout/seats persistence fully implemented. The pixel office can now be built as a self-contained static app and served directly from the office-server at `/ui/`. Layout and agent seats survive browser restarts via the server-side REST API.

### Files changed

| File | Change |
|------|--------|
| `webview-ui/package.json` | Added `build:standalone` script: `vite build --outDir ../office-server/public/ui --emptyOutDir` |
| `webview-ui/vite.config.ts` | Added `configResolved` hook to `browserMockAssetsPlugin` — dynamically resolves `distAssetsDir` from the Vite output dir so JSON metadata files land in the correct `assets/` subdirectory for both default and standalone builds |
| `office-server/server.js` | Added `LAYOUT_FILE` + `SEATS_FILE` constants; `express.json()` middleware; `app.use('/ui', express.static(...))` behind `basicAuth`; `GET/PUT /api/layout` + `GET/PUT /api/seats` persistence endpoints using `fs.promises` |
| `webview-ui/src/vscodeApi.ts` | Browser mock intercepts `saveLayout` → `PUT /api/layout` and `saveAgentSeats` → `PUT /api/seats`; other messages still logged to console |
| `webview-ui/src/App.tsx` | Browser runtime `useEffect` fetches `/api/layout` + `/api/seats` on init; dispatches `existingAgents` (seats) then `layoutLoaded` (layout) to restore persisted state |
| `office-server/public/ui/` | **New** — standalone build artifact (committed for deploy) |

### Implementation notes

**`vite.config.ts` — `configResolved` hook**
Added a `let distAssetsDir` closure variable (replaces the old `const`). The new `configResolved(config)` hook resolves `config.build.outDir` (which changes when `--outDir` CLI flag is used) to an absolute path and sets `distAssetsDir`. This ensures `furniture-catalog.json` and `asset-index.json` land in `office-server/public/ui/assets/` during `build:standalone`, not in the old `dist/webview/assets/` path.

**`office-server/server.js` — persistence endpoints**
- `express.json()` middleware added immediately after `basicAuth` to enable JSON body parsing for PUT routes.
- `/ui` static route declared BEFORE API routes (but after `basicAuth`) so assets are served efficiently without touching Express routing logic.
- `PUT /api/layout` and `PUT /api/seats` write JSON body to `~/.openclaw/pixel-office-{layout,seats}.json` using `fs.promises.writeFile`.
- `GET /api/layout` returns `{}` on ENOENT; `GET /api/seats` returns `{}` on ENOENT (object format mirrors the `saveAgentSeats` payload shape).

**`vscodeApi.ts` — browser intercept**
The browser mock `postMessage` now pattern-matches on `msg.type` using a safe `Record<string, unknown>` cast (TypeScript-compliant, no `any`). `saveLayout` and `saveAgentSeats` trigger fire-and-forget `fetch` PUTs; all other types fall through to console logging.

**`App.tsx` — init restore**
`Promise.all([fetch('/api/layout'), fetch('/api/seats')])` runs immediately in the `isBrowserRuntime` useEffect. Seats are dispatched as `existingAgents` FIRST (so they buffer in `pendingAgents`), then layout is dispatched as `layoutLoaded` SECOND (which flushes buffered agents with their palette/seatId, then applies the persisted layout). This ordering ensures agents are placed at their saved desks when the layout renders.

### Build

`npm run build` — **✅ clean** (tsc + eslint + esbuild + vite, zero errors, zero warnings)
`npm run build:standalone` — **✅ output confirmed** at `office-server/public/ui/`

### Commit

`2b8cab1` — `feat: M7 standalone build + layout persistence for web pixel office`

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
- [x] **M4**: `src/openclawWatcher.ts` — directory scanner + webview bridge (2026-03-24)
- [x] **M5**: Persistence guards + extension wiring — OpenClaw agents survive VS Code restarts (2026-03-24)
- [x] **M6**: `office-server/server.js` `/api/agents/events` SSE multiplexed live feed (2026-03-25)
- [x] **M6**: `webview-ui/src/browserAgentFeed.ts` — SSE client with agent tracking + exponential backoff (2026-03-25)
- [x] **M7**: `webview-ui/package.json` `build:standalone` script — outputs to `office-server/public/ui/` (2026-03-25)
- [x] **M7**: `office-server/server.js` `/ui` static file serving behind basicAuth (2026-03-25)
- [x] **M7**: `office-server/server.js` `GET/PUT /api/layout` + `GET/PUT /api/seats` persistence (2026-03-25)
- [x] **M7**: `webview-ui/src/vscodeApi.ts` intercepts `saveLayout`/`saveAgentSeats` → PUT to API in browser runtime (2026-03-25)
- [x] **M7**: `webview-ui/src/App.tsx` restores layout + seats from API on browser init (2026-03-25)

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
