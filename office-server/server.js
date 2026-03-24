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
const POLL_INTERVAL_MS = 2000;

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
          agents.push({
            agentId,
            sessionKey,
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
});
