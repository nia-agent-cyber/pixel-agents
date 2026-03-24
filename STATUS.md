# STATUS.md — pixel-bridge Project Status

**Last updated:** 2026-03-24  
**Updated by:** pixel-qa  
**Current sprint:** Sprint 2 (M3) — ⚠️ REQUEST CHANGES

---

## Current State: ⚠️ M3 REQUEST CHANGES — 2 Required Fixes Before M4

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
export type WebviewMessage =
  | { type: 'agentToolStart'; agentId: string; tool: string; input: string }
  | { type: 'agentToolDone';  agentId: string; tool: string; result: string }
  | { type: 'agentStatus';    agentId: string; status: 'working' | 'idle' | 'error' };

export function watchOpenClawAgent(
  agentId: string,
  sessionKey: string,
  emit: (msg: WebviewMessage) => void,
): vscode.Disposable;

export async function listOpenClawAgents(): Promise<
  { agentId: string; sessionKey: string }[]
>;
```

**Tool name map (DECISIONS.md D7 as specified):**
| OpenClaw raw | Displayed as |
|---|---|
| `Read` | `read_file` |
| `Write` | `write_file` |
| `Edit` | `edit_file` |
| `exec` | `run_command` |
| `web_search` | `web_search` |
| `web_fetch` | `web_fetch` |
| `browser` | `browser_action` |
| *(any other)* | raw tool name |

**Edge cases noted:**
1. **File doesn't exist yet** — `readNewLinesForSession` swallows `ENOENT`; watcher will catch up when file appears (same as Claude Code polling pattern in `launchNewTerminal`).
2. **Tool result with no `toolCallId`** — safe: `pendingTools.get(undefined)` returns `undefined`, tool name is `''`, result still emitted.
3. **Idle timer with pending tools** — `scheduleIdleTimer` only emits `idle` if `pendingTools.size === 0`; prevents false idle during slow tool execution.
4. **`listOpenClawAgents` on missing directory** — returns `[]` (not an error); safe for fresh installs.
5. **`dispose()` called multiple times** — idempotent: null-checks on `fsWatcher` and `pollInterval` prevent double-close errors.

**What's next:** M4 — `openclawWatcher.ts` (directory scanner + bridge to numeric agent IDs for the existing webview protocol).

---

## Sprint 2 Preview (M4+)

- M4: `openclawWatcher.ts` — watch `~/.openclaw/agents/*/sessions/*.jsonl`, bridge string `agentId` to numeric `AgentState.id`
- M5: `PixelAgentsViewProvider.ts` — "Add OpenClaw" button wires `listOpenClawAgents` + `watchOpenClawAgent`

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
