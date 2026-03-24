# STATUS.md — pixel-bridge Project Status

**Last updated:** 2026-03-24  
**Updated by:** pixel-coder  
**Current sprint:** Sprint 1 (M1 + M2)

---

## Current State: 🟢 Sprint 1 Complete — Ready for M3

M1 and M2 implemented and passing build. AgentState now has `source` discriminator; all terminal paths are source-gated. Ready for M3 (OpenClaw JSONL parser).

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
- [x] **M1**: `OPENCLAW_AGENT_DIR` constant added to `src/constants.ts`
- [x] **M2**: `source` discriminator on `AgentState` and `PersistedAgent`
- [x] **M2**: `terminalRef` optional on `AgentState`; `terminalName` optional on `PersistedAgent`
- [x] **M2**: All 5 terminal access sites source-gated (agentManager×2, PixelAgentsViewProvider×4, fileWatcher×1)

---

## What's Next (Sprint 1)

### M1 — Fork + Dev Environment (pixel-coder) ✅ DONE 2026-03-24
- [x] Verify `npm run build` passes on macOS (arm64) — passes after `webview-ui npm install`
- [ ] Run extension in F5 dev host, confirm existing Claude Code flow works (manual, deferred to QA)
- [x] Add `OPENCLAW_AGENT_DIR` constant to `src/constants.ts` (`~/.openclaw/agents`)
- [ ] Update `package.json` name/description for fork identity (deferred — not blocking)

### M2 — AgentState Abstraction (pixel-coder) ✅ DONE 2026-03-24
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

## Sprint 2 Preview (after Sprint 1 ships)

- M3: `openclawTranscriptParser.ts` — parse pi-coding-agent JSONL format
- M4: `openclawWatcher.ts` — watch `~/.openclaw/agents/*/sessions/*.jsonl`
- M5: Tool name mapping (exec→Bash, web_fetch→WebFetch, etc.)

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
