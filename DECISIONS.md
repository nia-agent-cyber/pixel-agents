# DECISIONS.md — Architectural Decisions

**Project:** pixel-bridge (OpenClaw adapter for Pixel Agents)  
**Format:** Decision → Context → Choice → Rationale → Consequences

Once a decision is recorded here, **don't relitigate it** — open a new decision if circumstances change.

---

## D1: Zero changes to OpenClaw

**Date:** 2026-03-24  
**Status:** Decided (Remi constraint)

**Context:** We need OpenClaw sub-agents to appear in Pixel Agents.

**Choice:** Pixel Agents adapts to OpenClaw's native format. OpenClaw is not modified.

**Rationale:** OpenClaw is a production tool. Changes introduce risk. Adapters are the correct abstraction.

**Consequences:** We must parse OpenClaw's `pi-coding-agent` JSONL format natively. No hooks, no wrappers.

---

## D2: Fork pablodelucca/pixel-agents (not standalone extension)

**Date:** 2026-03-24  
**Status:** Decided

**Context:** Options were (a) fork, (b) standalone extension, (c) upstream PR only.

**Choice:** Fork at `nia-agent-cyber/pixel-agents`. Upstream PR as Phase 2.

**Rationale:** Fastest path to working MVP. Lets us ship before upstream review cycle. Upstream PR is still the goal.

**Consequences:** Must keep fork's `main` mergeable with upstream. Avoid gratuitous divergence.

---

## D3: Add `source` discriminator to AgentState (not a separate agent type)

**Date:** 2026-03-24  
**Status:** Decided

**Context:** Two options for making AgentState work for both Claude Code and OpenClaw:
- (a) Add `source: 'claude-code' | 'openclaw'` field, make `terminalRef` optional
- (b) Create a separate `OpenClawAgentState` type, use union everywhere

**Choice:** Option (a) — single `AgentState` with `source` discriminator.

**Rationale:** Minimizes blast radius. Fewer files to change. Existing code reads `agent.terminalRef` — add `if (!agent.terminalRef) return;` guards. Option (b) would require changes throughout `fileWatcher.ts`, `agentManager.ts`, and `PixelAgentsViewProvider.ts`.

**Consequences:** Need source-gating at 4 call sites. Must ensure `terminalRef` guards are added everywhere it's accessed.

**Changed fields in AgentState:**
```typescript
source: 'claude-code' | 'openclaw';   // new required field
terminalRef?: vscode.Terminal;          // was required, now optional
agentId?: string;                       // new — OpenClaw agent ID (e.g., 'bakkt-coder')
sessionKey?: string;                    // new — OpenClaw session key
```

---

## D4: New file `openclawTranscriptParser.ts` (not modifying `transcriptParser.ts`)

**Date:** 2026-03-24  
**Status:** Decided

**Context:** OpenClaw's JSONL format is structurally different from Claude Code's. We could either:
- (a) Modify `transcriptParser.ts` to handle both formats
- (b) Create a separate `openclawTranscriptParser.ts` that emits the same webview messages

**Choice:** Option (b) — separate file.

**Rationale:** Keeps upstream's `transcriptParser.ts` pristine (no diff noise in upstream PR). Cleaner separation. Easier to test in isolation. The webview message protocol is the common interface.

**Consequences:** Some code duplication (timer logic, `formatToolStatus`). Acceptable — the parsers have fundamentally different input shapes.

---

## D5: New file `openclawWatcher.ts` (not modifying `fileWatcher.ts`)

**Date:** 2026-03-24  
**Status:** Decided

**Context:** Same rationale as D4. `fileWatcher.ts` is tightly coupled to Claude Code's project directory structure (`~/.claude/projects/<hash>/`). OpenClaw uses `~/.openclaw/agents/<agentId>/sessions/`.

**Choice:** New `openclawWatcher.ts`.

**Rationale:** `fileWatcher.ts`'s `readNewLines()` is generic (reads bytes from any JSONL file) and **can** be reused. But `ensureProjectScan()` and `adoptTerminalForFile()` are Claude Code-specific and must not be touched.

**Consequences:** `openclawWatcher.ts` will import `readNewLines` from `fileWatcher.ts` for file reading, but do its own directory scanning logic. Upstream `fileWatcher.ts` is unchanged.

---

## D6: OpenClaw agents are NOT persisted by terminal name

**Date:** 2026-03-24  
**Status:** Decided

**Context:** Claude Code agents are persisted to `workspaceState` by `terminalName` so they survive VS Code restarts. OpenClaw agents have no terminal.

**Choice:** Persist OpenClaw agents by `agentId + sessionKey`. On restore, scan `~/.openclaw/agents/` to find active sessions rather than matching terminals.

**Rationale:** Terminal names don't exist for OpenClaw sessions. Session files still exist on disk and can be re-found.

**Consequences:** `PersistedAgent` needs a `source` field + optional `agentId`/`sessionKey`. `restoreAgents()` needs source-gating.

---

## D7: Tool name mapping via lookup table (not class hierarchy)

**Date:** 2026-03-24  
**Status:** Decided

**Context:** OpenClaw tool names (`exec`, `web_fetch`, `Read`) need to map to Claude Code tool names (`Bash`, `WebFetch`, `Read`) for the existing `formatToolStatus()` animation logic to work.

**Choice:** Simple lookup map in `openclawTranscriptParser.ts`:
```typescript
const OPENCLAW_TOOL_MAP: Record<string, string> = {
  exec: 'Bash',
  web_fetch: 'WebFetch',
  web_search: 'WebSearch',
  sessions_spawn: 'Task',
  memory_search: 'Grep',
  message: 'Write',
  browser: 'WebFetch',
  image: 'Read',
  tts: 'Write',
};
// Read, Write, Edit pass through unchanged
```

**Rationale:** Simplest approach. No new abstractions needed. `formatToolStatus()` is reused as-is.

**Consequences:** If OpenClaw adds new tools, update the map. Minor maintenance burden.

---

## D8: "Add OpenClaw" button in VS Code panel (no terminal spawning)

**Date:** 2026-03-24  
**Status:** Decided

**Context:** Claude Code's "+ Agent" button spawns a terminal and runs `claude --session-id ...`. For OpenClaw, there's nothing to spawn — sessions already exist on disk.

**Choice:** "Add OpenClaw" button starts watching `~/.openclaw/agents/*/sessions/` and auto-discovers active sessions. No terminal created.

**Rationale:** OpenClaw sessions are created by the OpenClaw runtime, not by Pixel Agents. We're observers only.

**Consequences:** UX difference: Claude Code button = creates new agent, OpenClaw button = attaches to existing agents. Both result in characters appearing in the office.

---

## D9: macOS only for Phase 1

**Date:** 2026-03-24  
**Status:** Decided (Remi constraint)

**Context:** Remi's development machine is macOS (arm64). The existing `fileWatcher.ts` already accounts for macOS `fs.watch` unreliability with triple-redundant watching.

**Choice:** Ship Phase 1 targeting macOS only. Windows/Linux is Phase 2.

**Rationale:** Reduces scope. The same triple-redundant pattern will work cross-platform.

**Consequences:** No Windows path separators needed. `~/.openclaw/` paths use `os.homedir()` which is cross-platform anyway.
