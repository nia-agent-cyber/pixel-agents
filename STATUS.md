# STATUS.md — pixel-bridge Project Status

**Last updated:** 2026-03-24  
**Updated by:** pixel-pm  
**Current sprint:** Sprint 1 (M1 + M2)

---

## Current State: 🟡 Setup Complete — Ready for Implementation

The fork is live and fully understood. PM has done a complete codebase audit. Sprint 1 tasks are defined and ready for pixel-coder.

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

---

## What's Next (Sprint 1)

### M1 — Fork + Dev Environment (pixel-coder)
- [ ] Verify `npm run build` passes on macOS (arm64)
- [ ] Run extension in F5 dev host, confirm existing Claude Code flow works
- [ ] Add `OPENCLAW_AGENT_DIR` constant to `src/constants.ts`
- [ ] Update `package.json` name/description for fork identity

### M2 — AgentState Abstraction (pixel-coder)
- [ ] Add `source: 'claude-code' | 'openclaw'` to `AgentState`
- [ ] Make `terminalRef` optional (`terminalRef?: vscode.Terminal`)
- [ ] Add `agentId?: string` and `sessionKey?: string` to `AgentState`
- [ ] Update `PersistedAgent` to handle both sources
- [ ] Gate `terminalRef.show()` / `terminalRef.dispose()` in `PixelAgentsViewProvider.ts`
- [ ] Gate `terminalRef.name` in `persistAgents()` (agentManager.ts)
- [ ] Gate terminal-match in `restoreAgents()` (agentManager.ts)
- [ ] Confirm build still passes and Claude Code path unchanged

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
