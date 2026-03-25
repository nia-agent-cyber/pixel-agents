var e = 1e3,
  t = 3e4,
  n = 1,
  r = new Map();
function i(e) {
  window.dispatchEvent(new MessageEvent(`message`, { data: e }));
}
function a(e, t) {
  return `${e}:${t}`;
}
function o(e, t, o) {
  let s = a(e, t);
  if (r.has(s)) return;
  let c = n++;
  (r.set(s, { numericId: c, pendingTools: new Map() }),
    i({ type: `agentAdded`, id: c, label: o, projectDir: e }),
    i({ type: `agentStatus`, id: c, status: `waiting` }));
}
function s(e, t) {
  let n = a(e, t),
    o = r.get(n);
  o && (i({ type: `agentStatus`, id: o.numericId, status: `removed` }), r.delete(n));
}
function c(e, t, n, o, s) {
  let c = a(e, t),
    l = r.get(c);
  if (!l) return;
  let { numericId: u, pendingTools: d } = l,
    f = Math.random().toString(36).slice(2, 7),
    p = `feed-${Date.now().toString()}-${f}`,
    m = s ?? n;
  (d.set(m, p),
    i({
      type: `agentToolStart`,
      id: u,
      toolId: p,
      status: `${n}${o ? `: ` + o.slice(0, 60) : ``}`,
    }),
    i({ type: `agentStatus`, id: u, status: `active` }));
}
function l(e, t, n) {
  let o = a(e, t),
    s = r.get(o);
  if (!s) return;
  let { numericId: c, pendingTools: l } = s,
    u = n ?? ``,
    d = l.get(u) ?? `feed-done-${Date.now().toString()}`;
  (l.delete(u),
    i({ type: `agentToolDone`, id: c, toolId: d }),
    l.size === 0 && i({ type: `agentStatus`, id: c, status: `waiting` }));
}
function u(e, t) {
  let n = a(e, t),
    o = r.get(n);
  o && i({ type: `agentStatus`, id: o.numericId, status: `active` });
}
function d(e) {
  let n = new EventSource(`/api/agents/events`);
  ((n.onmessage = (e) => {
    try {
      let t = JSON.parse(e.data),
        { type: n } = t;
      n === `agentAdded`
        ? o(t.agentId, t.sessionKey, t.label ?? t.agentId)
        : n === `agentRemoved`
          ? s(t.agentId, t.sessionKey)
          : n === `toolStart`
            ? c(t.agentId, t.sessionKey, t.tool, t.input ?? ``, t.toolCallId)
            : n === `toolDone`
              ? l(t.agentId, t.sessionKey, t.toolCallId)
              : n === `text` && u(t.agentId, t.sessionKey);
    } catch {}
  }),
    (n.onerror = () => {
      n.close();
      let r = Math.min(e * 2, t);
      setTimeout(() => {
        d(r);
      }, e);
    }));
}
function f() {
  d(e);
}
export { f as initBrowserAgentFeed };
