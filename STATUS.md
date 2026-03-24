# STATUS.md — pixel-bridge Project Status

**Last updated:** 2026-03-24  
**Updated by:** pixel-coder  
**Current sprint:** Sprint 2 (M3) — ✅ COMPLETE

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
