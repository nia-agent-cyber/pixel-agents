/**
 * Pixel Office — standalone web dashboard for OpenClaw agent sessions
 * Reads ~/.openclaw/agents/* /sessions/*.jsonl and serves a live dashboard
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = parseInt(process.env.PORT || '3456', 10);

// ── Config ────────────────────────────────────────────────────────────────────

const AGENTS_DIR = path.join(os.homedir(), '.openclaw', 'agents');
const CREDS_FILE = path.join(os.homedir(), '.openclaw', 'office-credentials.json');
const LAYOUT_FILE = path.join(os.homedir(), '.openclaw', 'pixel-office-layout.json');
const SEATS_FILE = path.join(os.homedir(), '.openclaw', 'pixel-office-seats.json');
const POLL_INTERVAL_MS = 2000;
const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — no new bytes → agentRemoved
const FEED_SCAN_MS = 5000; // 5s polling fallback for directory scan
const FEED_HEARTBEAT_MS = 15000; // 15s heartbeat comment on SSE connection

// ── Basic Auth ────────────────────────────────────────────────────────────────

function loadCredentials() {
  try {
    return JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still do comparison to avoid timing leak
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function basicAuth(req, res, next) {
  const creds = loadCredentials();
  if (!creds) {
    // No credentials configured — deny all
    res.set('WWW-Authenticate', 'Basic realm="Pixel Office"');
    return res.status(401).send('Unauthorized: no credentials configured');
  }

  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Pixel Office"');
    return res.status(401).send('Authentication required');
  }

  const b64 = authHeader.slice(6);
  const decoded = Buffer.from(b64, 'base64').toString('utf8');
  const colonIdx = decoded.indexOf(':');
  if (colonIdx < 0) {
    res.set('WWW-Authenticate', 'Basic realm="Pixel Office"');
    return res.status(401).send('Invalid credentials');
  }

  const user = decoded.slice(0, colonIdx);
  const pass = decoded.slice(colonIdx + 1);

  const expectedHash = creds.passwordHash;
  const inputHash = crypto.createHash('sha256').update(pass).digest('hex');

  if (user === creds.username && timingSafeEqual(inputHash, expectedHash)) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Pixel Office"');
  return res.status(401).send('Invalid credentials');
}

app.use(basicAuth);
app.use(express.json());

// ── Standalone UI (M7) ────────────────────────────────────────────────────────
// Serve the standalone Vite build from public/ui/ behind basicAuth.
// Must be declared before API routes so static assets are matched first.
app.use('/ui', express.static(path.join(__dirname, 'public/ui')));

// ── JSONL Parser ──────────────────────────────────────────────────────────────

const TOOL_NAME_MAP = {
  Read: 'Read',
  Write: 'Write',
  Edit: 'Edit',
  exec: 'Bash',
  web_search: 'WebSearch',
  web_fetch: 'WebFetch',
  browser: 'Browser',
  sessions_spawn: 'Task',
  memory_search: 'Search',
  message: 'Message',
  image: 'Image',
  tts: 'TTS',
  canvas: 'Canvas',
  nodes: 'Nodes',
  process: 'Process',
  subagents: 'Subagents',
};

function mapToolName(raw) {
  return TOOL_NAME_MAP[raw] || raw;
}

function parseJsonlFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());
    const events = [];
    let sessionInfo = null;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'session') {
          sessionInfo = entry;
        } else if (entry.type === 'message') {
          const msg = entry.message;
          if (!msg) continue;

          if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'tool_use') {
                let inputStr = '';
                if (block.input) {
                  const inp = block.input;
                  inputStr =
                    inp.command ||
                    inp.file_path ||
                    inp.path ||
                    inp.query ||
                    inp.url ||
                    inp.message ||
                    inp.action ||
                    JSON.stringify(inp).slice(0, 80);
                }
                events.push({
                  type: 'toolStart',
                  tool: mapToolName(block.name),
                  input: inputStr,
                  timestamp: entry.timestamp,
                  toolCallId: block.id,
                });
              } else if (block.type === 'text' && block.text) {
                events.push({
                  type: 'text',
                  text: block.text.slice(0, 200),
                  timestamp: entry.timestamp,
                });
              }
            }
          } else if (msg.role === 'toolResult' || msg.role === 'tool') {
            const toolCallId = msg.toolCallId || msg.tool_call_id;
            const resultContent = Array.isArray(msg.content)
              ? msg.content
                  .map((c) => (typeof c === 'string' ? c : c.text || ''))
                  .join('')
                  .slice(0, 120)
              : typeof msg.content === 'string'
                ? msg.content.slice(0, 120)
                : '';
            events.push({
              type: 'toolDone',
              toolCallId,
              result: resultContent,
              timestamp: entry.timestamp,
            });
          }
        }
      } catch {
        // skip malformed lines
      }
    }

    return { sessionInfo, events };
  } catch {
    return { sessionInfo: null, events: [] };
  }
}

// ── Session Scanner ────────────────────────────────────────────────────────────

// Load sessionId → label map from sessions.json (OpenClaw subagent labels)
function loadSessionLabels(agentId) {
  try {
    const p = path.join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const labels = {};
    for (const meta of Object.values(data)) {
      if (meta.sessionId && meta.label) {
        labels[meta.sessionId] = meta.label;
      }
    }
    return labels;
  } catch {
    return {};
  }
}

function scanAgents() {
  const agents = [];
  try {
    const agentDirs = fs
      .readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const agentId of agentDirs) {
      const sessionsDir = path.join(AGENTS_DIR, agentId, 'sessions');
      try {
        const sessionLabels = loadSessionLabels(agentId);
        const sessionFiles = fs
          .readdirSync(sessionsDir)
          .filter((f) => f.endsWith('.jsonl'))
          .map((f) => {
            const filePath = path.join(sessionsDir, f);
            const stat = fs.statSync(filePath);
            return { file: f, mtime: stat.mtime, size: stat.size, filePath };
          })
          .sort((a, b) => b.mtime - a.mtime);

        for (const sf of sessionFiles) {
          const sessionKey = sf.file.replace('.jsonl', '');
          // For named agent dirs (bakkt-coder, voice-pm etc.) use dir name as label.
          // For 'main' dir, only show sessions with explicit labels (actual subagents).
          const label = sessionLabels[sessionKey] || (agentId !== 'main' ? agentId : null);
          if (!label) continue; // skip raw chat sessions
          agents.push({
            agentId,
            sessionKey,
            label,
            mtime: sf.mtime.toISOString(),
            size: sf.size,
            filePath: sf.filePath,
          });
        }
      } catch {
        // no sessions dir
      }
    }
  } catch {
    // agents dir not found
  }

  return agents;
}

// ── Live Agent Feed (M6) ──────────────────────────────────────────────────────
//
// Broadcasts events from all active OpenClaw sessions to every connected
// /api/agents/events SSE client.  One reader per session (shared state),
// multiplexed to N clients.

/** Set of all open /api/agents/events SSE responses */
const feedClients = new Set();

/**
 * Map<"agentId:sessionKey", { agentId, sessionKey }>
 * Sessions currently considered active (not yet stale-expired).
 */
const knownSessions = new Map();

/**
 * Map<"agentId:sessionKey", {
 *   lastByteMs: number,
 *   staleTimer: NodeJS.Timeout|null,
 *   offset: number,
 *   lineBuffer: string,
 *   watcher: fs.FSWatcher|null,
 *   pollTimer: NodeJS.Timeout|null
 * }>
 */
const activeSessions = new Map();

let feedDirWatcher = null;
let feedScanTimer = null;

function broadcastFeedEvent(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of feedClients) {
    res.write(payload);
  }
}

function resetStaleTimer(agentId, sessionKey) {
  const key = `${agentId}:${sessionKey}`;
  const state = activeSessions.get(key);
  if (!state) return;
  if (state.staleTimer) clearTimeout(state.staleTimer);
  state.staleTimer = setTimeout(() => {
    broadcastFeedEvent({ type: 'agentRemoved', agentId, sessionKey });
    stopSessionFeed(agentId, sessionKey);
    knownSessions.delete(key);
  }, STALE_TIMEOUT_MS);
}

function pollSessionFeed(agentId, sessionKey) {
  const key = `${agentId}:${sessionKey}`;
  const state = activeSessions.get(key);
  if (!state) return;

  const filePath = path.join(AGENTS_DIR, agentId, 'sessions', `${sessionKey}.jsonl`);
  try {
    const stat = fs.statSync(filePath);
    if (stat.size <= state.offset) return;

    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(stat.size - state.offset);
    fs.readSync(fd, buf, 0, buf.length, state.offset);
    fs.closeSync(fd);
    state.offset = stat.size;
    state.lastByteMs = Date.now();

    const chunk = state.lineBuffer + buf.toString('utf8');
    const parts = chunk.split('\n');
    state.lineBuffer = parts.pop() || '';

    for (const rawLine of parts) {
      if (!rawLine.trim()) continue;
      try {
        const entry = JSON.parse(rawLine);
        if (entry.type !== 'message') continue;
        const msg = entry.message;
        if (!msg) continue;

        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'tool_use') {
              let inputStr = '';
              if (block.input) {
                const inp = block.input;
                inputStr =
                  inp.command ||
                  inp.file_path ||
                  inp.path ||
                  inp.query ||
                  inp.url ||
                  inp.message ||
                  inp.action ||
                  JSON.stringify(inp).slice(0, 80);
              }
              broadcastFeedEvent({
                type: 'toolStart',
                agentId,
                sessionKey,
                tool: mapToolName(block.name),
                input: inputStr,
                toolCallId: block.id,
                timestamp: entry.timestamp,
              });
              resetStaleTimer(agentId, sessionKey);
            } else if (block.type === 'text' && block.text) {
              broadcastFeedEvent({
                type: 'text',
                agentId,
                sessionKey,
                text: block.text.slice(0, 300),
                timestamp: entry.timestamp,
              });
              resetStaleTimer(agentId, sessionKey);
            }
          }
        } else if (msg.role === 'toolResult' || msg.role === 'tool') {
          broadcastFeedEvent({
            type: 'toolDone',
            agentId,
            sessionKey,
            toolCallId: msg.toolCallId || msg.tool_call_id,
            timestamp: entry.timestamp,
          });
          resetStaleTimer(agentId, sessionKey);
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // file may not exist yet
  }
}

function startSessionFeed(agentId, sessionKey) {
  const key = `${agentId}:${sessionKey}`;
  if (activeSessions.has(key)) return;

  const filePath = path.join(AGENTS_DIR, agentId, 'sessions', `${sessionKey}.jsonl`);
  const state = {
    lastByteMs: Date.now(),
    staleTimer: null,
    offset: 0,
    lineBuffer: '',
    watcher: null,
    pollTimer: null,
  };
  activeSessions.set(key, state);

  // fs.watch for low-latency delivery
  try {
    const watcher = fs.watch(filePath, () => {
      pollSessionFeed(agentId, sessionKey);
    });
    watcher.on('error', () => {
      /* ignore — 5s poll fallback handles it */
    });
    state.watcher = watcher;
  } catch {
    // fs.watch unavailable; rely on polling
  }

  // 5s polling fallback (always active as belt-and-suspenders)
  state.pollTimer = setInterval(() => pollSessionFeed(agentId, sessionKey), FEED_SCAN_MS);

  // Start stale timer from now
  resetStaleTimer(agentId, sessionKey);

  // Replay last 8KB to surface current tool state; then continue from there live
  const REPLAY_BYTES = 8 * 1024;
  try {
    const stat = fs.statSync(filePath);
    state.offset = Math.max(0, stat.size - REPLAY_BYTES);
  } catch {
    // file doesn't exist yet; offset stays at 0
  }
}

function stopSessionFeed(agentId, sessionKey) {
  const key = `${agentId}:${sessionKey}`;
  const state = activeSessions.get(key);
  if (!state) return;
  if (state.staleTimer) clearTimeout(state.staleTimer);
  if (state.watcher) {
    try {
      state.watcher.close();
    } catch {
      /* ignore */
    }
  }
  if (state.pollTimer) clearInterval(state.pollTimer);
  activeSessions.delete(key);
}

const RECENT_SESSION_MS = 60 * 60 * 1000; // only track sessions active in last 1h

function scanForNewSessions() {
  const sessions = scanAgents();
  const cutoff = Date.now() - RECENT_SESSION_MS;

  // Deduplicate: only the most recent session per label
  const seenLabels = new Set();

  for (const s of sessions) {
    // Skip sessions older than 30 minutes
    if (new Date(s.mtime).getTime() < cutoff) continue;
    // Skip duplicate labels — sessions are sorted newest-first so first wins
    if (seenLabels.has(s.label)) continue;
    seenLabels.add(s.label);
    const key = `${s.agentId}:${s.sessionKey}`;
    if (knownSessions.has(key)) continue;
    knownSessions.set(key, {
      agentId: s.agentId,
      sessionKey: s.sessionKey,
      label: s.label || s.agentId,
    });
    broadcastFeedEvent({
      type: 'agentAdded',
      agentId: s.agentId,
      sessionKey: s.sessionKey,
      label: s.label || s.agentId,
    });
    startSessionFeed(s.agentId, s.sessionKey);
  }
}

function startFeedWatcher() {
  // Scan existing sessions immediately
  scanForNewSessions();

  // Periodic scan fallback for new sessions
  feedScanTimer = setInterval(scanForNewSessions, FEED_SCAN_MS);

  // fs.watch on agents dir for faster detection of new sessions
  try {
    feedDirWatcher = fs.watch(AGENTS_DIR, { recursive: true }, () => {
      scanForNewSessions();
    });
    feedDirWatcher.on('error', () => {
      /* ignore — periodic scan fallback handles it */
    });
  } catch {
    // agents dir doesn't exist yet; periodic scan will catch new sessions
  }
}

// ── Layout & Seats Persistence (M7) ──────────────────────────────────────────

app.get('/api/layout', async (req, res) => {
  try {
    const data = await fs.promises.readFile(LAYOUT_FILE, 'utf8');
    const layout = JSON.parse(data);
    // Only return layout if it has a valid tiles array; otherwise null → client uses default
    if (!layout || !Array.isArray(layout.tiles)) {
      return res.json(null);
    }
    res.json(layout);
  } catch {
    res.json(null);
  }
});

app.put('/api/layout', async (req, res) => {
  try {
    await fs.promises.writeFile(LAYOUT_FILE, JSON.stringify(req.body), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/seats', async (req, res) => {
  try {
    const data = await fs.promises.readFile(SEATS_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch {
    res.json({});
  }
});

app.put('/api/seats', async (req, res) => {
  try {
    await fs.promises.writeFile(SEATS_FILE, JSON.stringify(req.body), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── REST API ──────────────────────────────────────────────────────────────────

app.get('/api/agents', (req, res) => {
  const sessions = scanAgents();

  // Group by agentId, get last activity
  const agentMap = {};
  for (const s of sessions) {
    if (!agentMap[s.agentId]) {
      agentMap[s.agentId] = { agentId: s.agentId, sessions: [] };
    }
    agentMap[s.agentId].sessions.push({
      sessionKey: s.sessionKey,
      mtime: s.mtime,
      size: s.size,
    });
  }

  const result = Object.values(agentMap).map((agent) => {
    // Sort sessions newest first
    agent.sessions.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    return {
      agentId: agent.agentId,
      sessionCount: agent.sessions.length,
      lastActive: agent.sessions[0]?.mtime || null,
      sessions: agent.sessions,
    };
  });

  // Sort by lastActive
  result.sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));
  res.json(result);
});

app.get('/api/agents/:agentId/sessions/:sessionKey', (req, res) => {
  const { agentId, sessionKey } = req.params;
  const filePath = path.join(AGENTS_DIR, agentId, 'sessions', `${sessionKey}.jsonl`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const { sessionInfo, events } = parseJsonlFile(filePath);
  res.json({ sessionInfo, events });
});

// SSE endpoint — multiplexed live feed from ALL active sessions (M6)
// MUST be declared before /api/agents/:agentId/sessions/:sessionKey/events to avoid
// Express routing collision (Express matches in order; without this, 'events' would
// be captured by :agentId).
app.get('/api/agents/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  feedClients.add(res);

  // Replay agentAdded only for sessions currently being watched (active in last 2h)
  for (const key of activeSessions.keys()) {
    const colonIdx = key.indexOf(':');
    const agentId = key.slice(0, colonIdx);
    const sessionKey = key.slice(colonIdx + 1);
    const known = knownSessions.get(key);
    const label = known?.label || agentId;
    res.write(`data: ${JSON.stringify({ type: 'agentAdded', agentId, sessionKey, label })}\n\n`);
  }

  // Heartbeat comment every 15s to keep the connection alive
  const heartbeatInterval = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, FEED_HEARTBEAT_MS);

  req.on('close', () => {
    feedClients.delete(res);
    clearInterval(heartbeatInterval);
  });
});

// SSE endpoint — streams live events from a session file
app.get('/api/agents/:agentId/sessions/:sessionKey/events', (req, res) => {
  const { agentId, sessionKey } = req.params;
  const filePath = path.join(AGENTS_DIR, agentId, 'sessions', `${sessionKey}.jsonl`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let fileOffset = 0;
  let lineBuffer = '';

  function sendEvent(data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  function poll() {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size <= fileOffset) return; // no new data

      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(stat.size - fileOffset);
      fs.readSync(fd, buf, 0, buf.length, fileOffset);
      fs.closeSync(fd);
      fileOffset = stat.size;

      const chunk = lineBuffer + buf.toString('utf8');
      const lines = chunk.split('\n');
      lineBuffer = lines.pop() || ''; // last (potentially incomplete) line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'message') {
            const msg = entry.message;
            if (!msg) continue;

            if (msg.role === 'assistant' && Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (block.type === 'tool_use') {
                  let inputStr = '';
                  if (block.input) {
                    const inp = block.input;
                    inputStr =
                      inp.command ||
                      inp.file_path ||
                      inp.path ||
                      inp.query ||
                      inp.url ||
                      inp.message ||
                      inp.action ||
                      JSON.stringify(inp).slice(0, 80);
                  }
                  sendEvent({
                    type: 'toolStart',
                    tool: mapToolName(block.name),
                    input: inputStr,
                    timestamp: entry.timestamp,
                  });
                } else if (block.type === 'text' && block.text) {
                  sendEvent({
                    type: 'text',
                    text: block.text.slice(0, 300),
                    timestamp: entry.timestamp,
                  });
                }
              }
            } else if (msg.role === 'toolResult' || msg.role === 'tool') {
              const resultContent = Array.isArray(msg.content)
                ? msg.content
                    .map((c) => (typeof c === 'string' ? c : c.text || ''))
                    .join('')
                    .slice(0, 150)
                : typeof msg.content === 'string'
                  ? msg.content.slice(0, 150)
                  : '';
              sendEvent({
                type: 'toolDone',
                toolCallId: msg.toolCallId || msg.tool_call_id,
                result: resultContent,
                timestamp: entry.timestamp,
              });
            }
          }
        } catch {
          // skip malformed
        }
      }
    } catch {
      // file may not exist yet
    }
  }

  // Send a heartbeat comment every 15s to keep connection alive
  const heartbeatInterval = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  const pollInterval = setInterval(poll, POLL_INTERVAL_MS);

  req.on('close', () => {
    clearInterval(pollInterval);
    clearInterval(heartbeatInterval);
  });
});

// ── Static ─────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[pixel-office] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[pixel-office] Watching: ${AGENTS_DIR}`);
  const creds = loadCredentials();
  if (creds) {
    console.log(`[pixel-office] Basic auth enabled for user: ${creds.username}`);
  } else {
    console.warn(
      `[pixel-office] WARNING: No credentials found at ${CREDS_FILE} — all requests will be denied`,
    );
  }
  // Start live-agent-feed watcher (M6)
  startFeedWatcher();
  console.log('[pixel-office] Live agent feed active on /api/agents/events');
});
