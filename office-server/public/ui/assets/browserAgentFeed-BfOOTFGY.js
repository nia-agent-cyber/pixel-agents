var e = 1e3,
  t = 3e4,
  n = 5,
  r = 1,
  i = new Map(),
  a = new Map();
function o(e) {
  let t = a.get(e);
  t && t.forEach((e) => e());
}
function s(e, t) {
  let n = a.get(e);
  return (
    n || ((n = new Set()), a.set(e, n)),
    n.add(t),
    () => {
      (n.delete(t), n.size === 0 && a.delete(e));
    }
  );
}
function c(e) {
  for (let t of i.values())
    if (t.numericId === e)
      return {
        label: t.label,
        sessionKey: t.sessionKey,
        status: t.status,
        recentTools: [...t.recentTools],
        lastActivityAt: t.lastActivityAt,
        addedAt: t.addedAt,
      };
}
function l(e) {
  window.dispatchEvent(new MessageEvent(`message`, { data: e }));
}
function u(e, t) {
  return `${e}:${t}`;
}
function d(e, t, n) {
  let a = u(e, t);
  if (i.has(a)) return;
  let s = r++,
    c = Date.now();
  (i.set(a, {
    numericId: s,
    pendingTools: new Map(),
    label: n,
    sessionKey: t,
    status: `waiting`,
    recentTools: [],
    lastActivityAt: c,
    addedAt: c,
  }),
    l({ type: `agentAdded`, id: s, label: n, projectDir: e }),
    l({ type: `agentStatus`, id: s, status: `waiting` }),
    o(s));
}
function f(e, t) {
  let n = u(e, t),
    r = i.get(n);
  r &&
    ((r.status = `removed`),
    l({ type: `agentStatus`, id: r.numericId, status: `removed` }),
    o(r.numericId),
    i.delete(n));
}
function p(e, t, r, a, s) {
  let c = u(e, t),
    d = i.get(c);
  if (!d) return;
  let { numericId: f, pendingTools: p } = d,
    m = Math.random().toString(36).slice(2, 7),
    h = `feed-${Date.now().toString()}-${m}`,
    g = s ?? r;
  p.set(g, h);
  let _ = `${r}${a ? `: ` + a.slice(0, 60) : ``}`;
  (d.recentTools.push(_),
    d.recentTools.length > n && d.recentTools.shift(),
    (d.status = `active`),
    (d.lastActivityAt = Date.now()),
    l({ type: `agentToolStart`, id: f, toolId: h, status: _ }),
    l({ type: `agentStatus`, id: f, status: `active` }),
    o(f));
}
function m(e, t, n) {
  let r = u(e, t),
    a = i.get(r);
  if (!a) return;
  let { numericId: s, pendingTools: c } = a,
    d = n ?? ``,
    f = c.get(d) ?? `feed-done-${Date.now().toString()}`;
  (c.delete(d),
    l({ type: `agentToolDone`, id: s, toolId: f }),
    c.size === 0 &&
      ((a.status = `waiting`), l({ type: `agentStatus`, id: s, status: `waiting` }), o(s)));
}
function h(e, t) {
  let n = u(e, t),
    r = i.get(n);
  r &&
    ((r.status = `active`),
    (r.lastActivityAt = Date.now()),
    l({ type: `agentStatus`, id: r.numericId, status: `active` }),
    o(r.numericId));
}
function g(e) {
  let n = new EventSource(`/api/agents/events`);
  ((n.onmessage = (e) => {
    try {
      let t = JSON.parse(e.data),
        { type: n } = t;
      n === `agentAdded`
        ? d(t.agentId, t.sessionKey, t.label ?? t.agentId)
        : n === `agentRemoved`
          ? f(t.agentId, t.sessionKey)
          : n === `toolStart`
            ? p(t.agentId, t.sessionKey, t.tool, t.input ?? ``, t.toolCallId)
            : n === `toolDone`
              ? m(t.agentId, t.sessionKey, t.toolCallId)
              : n === `text` && h(t.agentId, t.sessionKey);
    } catch {}
  }),
    (n.onerror = () => {
      n.close();
      let r = Math.min(e * 2, t);
      setTimeout(() => {
        g(r);
      }, e);
    }));
}
function _() {
  g(e);
}
export { c as getAgentDetail, _ as initBrowserAgentFeed, s as subscribeAgentDetail };
