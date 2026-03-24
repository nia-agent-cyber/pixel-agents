# PROTOCOL.md — How We Work on pixel-bridge

**Project:** pixel-bridge (OpenClaw adapter for pablodelucca/pixel-agents)  
**Repo:** https://github.com/nia-agent-cyber/pixel-agents  
**Upstream:** https://github.com/pablodelucca/pixel-agents  
**Team:** pixel-pm, pixel-coder, pixel-qa, pixel-ba  
**Telegram:** group -1003841191118, topic 6798  

---

## Core Constraint

**Zero changes to OpenClaw itself.** We modify Pixel Agents to read OpenClaw's native format.

---

## Branching Strategy

- `main` — stable, always compiles, CI green
- `feature/<name>` — feature branches from main (e.g. `feature/openclaw-parser`)
- `fix/<name>` — bug fix branches
- PRs squash-merged into main (upstream convention)
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat:` new capability
  - `fix:` bug fix
  - `refactor:` internal restructuring (non-breaking)
  - `chore:` tooling/config/docs
  - `test:` tests only

---

## Dev Environment

### Prerequisites
- Node.js v22+
- VS Code v1.105.0+
- npm workspaces (root + `webview-ui/`)

### Setup
```bash
git clone https://github.com/nia-agent-cyber/pixel-agents
cd pixel-agents
npm install
cd webview-ui && npm install && cd ..
npm run build
```

Press **F5** in VS Code to open Extension Dev Host.

### TypeScript constraints (from upstream)
- No `enum` — use `as const` objects
- `import type` required for type-only imports
- `noUnusedLocals` / `noUnusedParameters` strict
- All magic numbers/strings go in `src/constants.ts` (never inline)

---

## File Ownership

| File | Owner | Rules |
|------|-------|-------|
| `PROTOCOL.md` | pixel-pm | Rarely changes |
| `STATUS.md` | pixel-pm | Updated every session |
| `DECISIONS.md` | pixel-pm | Architectural decisions, never revisit |
| `src/openclawTranscriptParser.ts` | pixel-coder | New file — OpenClaw JSONL parser |
| `src/openclawWatcher.ts` | pixel-coder | New file — watches `~/.openclaw/agents/` |
| `src/types.ts` | pixel-coder | Add `source` discriminator, make `terminalRef` optional |
| `src/agentManager.ts` | pixel-coder | Source-gate terminal operations |
| `src/PixelAgentsViewProvider.ts` | pixel-coder | Add "Add OpenClaw" button logic |
| `src/constants.ts` | pixel-coder | Add OpenClaw constants |
| All existing Claude Code paths | upstream | **Do not touch without strong reason** |

---

## PR Process

1. **Branch** from `main` with descriptive name
2. **Build locally**: `npm run build` (type-check + lint + esbuild + vite)
3. **PR** against `nia-agent-cyber/pixel-agents:main`
4. **pixel-qa** reviews and tests before merge
5. After MVP: open upstream PR to `pablodelucca/pixel-agents`

---

## Testing

- Run `npm run build` — type-check must pass
- Manually test Claude Code path first (regression check)
- Manually test OpenClaw path with a live session file
- Unit tests for `openclawTranscriptParser.ts` (parse known JSONL → expected messages)

---

## Communication

- All updates to Telegram topic 6798, prefix `[PIXEL]`
- Role prefixes: `[PM]`, `[CODER]`, `[QA]`, `[BA]`
- Blockers: escalate to Remi immediately

---

## Upstream Relationship

- We are a fork of `pablodelucca/pixel-agents`
- Follow upstream's CONTRIBUTING.md conventions
- Before making architectural decisions, open a GitHub Discussion on upstream to align
- Goal: get our OpenClaw adapter merged upstream as Phase 2

---

## Key Reference Files

- **PID:** `/Users/nia/.openclaw/workspace/projects/pixel-bridge/PID.md`
- **Upstream architecture:** `CLAUDE.md` in repo root (comprehensive reference)
- **Upstream contributing guide:** `CONTRIBUTING.md`
