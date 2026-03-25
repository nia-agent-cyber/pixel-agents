import { n as e } from './browserNotify-B6UDaXAq.js';
var t = 1e3,
  n = 3e4,
  r = 5,
  i = 1,
  a = new Map(),
  o = new Map();
function s(e) {
  let t = o.get(e);
  t && t.forEach((e) => e());
}
function c(e, t) {
  let n = o.get(e);
  return (
    n || ((n = new Set()), o.set(e, n)),
    n.add(t),
    () => {
      (n.delete(t), n.size === 0 && o.delete(e));
    }
  );
}
function l(e) {
  for (let t of a.values())
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
function u(e) {
  window.dispatchEvent(new MessageEvent(`message`, { data: e }));
}
function d(e, t) {
  return `${e}:${t}`;
}
function f(e, t, n) {
  let r = d(e, t);
  if (a.has(r)) return;
  let o = i++,
    c = Date.now();
  (a.set(r, {
    numericId: o,
    pendingTools: new Map(),
    label: n,
    sessionKey: t,
    status: `waiting`,
    recentTools: [],
    lastActivityAt: c,
    addedAt: c,
  }),
    u({ type: `agentAdded`, id: o, label: n, projectDir: e }),
    u({ type: `agentStatus`, id: o, status: `waiting` }),
    s(o));
}
function p(t, n) {
  let r = d(t, n),
    i = a.get(r);
  if (!i) return;
  let o = i.status === `active`;
  ((i.status = `removed`),
    u({ type: `agentStatus`, id: i.numericId, status: `removed` }),
    s(i.numericId),
    o && e(t, i.label),
    a.delete(r));
}
function m(e, t, n, i, o) {
  let c = d(e, t),
    l = a.get(c);
  if (!l) return;
  let { numericId: f, pendingTools: p } = l,
    m = Math.random().toString(36).slice(2, 7),
    h = `feed-${Date.now().toString()}-${m}`,
    g = o ?? n;
  p.set(g, h);
  let _ = `${n}${i ? `: ` + i.slice(0, 60) : ``}`;
  (l.recentTools.push(_),
    l.recentTools.length > r && l.recentTools.shift(),
    (l.status = `active`),
    (l.lastActivityAt = Date.now()),
    u({ type: `agentToolStart`, id: f, toolId: h, status: _ }),
    u({ type: `agentStatus`, id: f, status: `active` }),
    s(f));
}
function h(t, n, r) {
  let i = d(t, n),
    o = a.get(i);
  if (!o) return;
  let { numericId: c, pendingTools: l } = o,
    f = r ?? ``,
    p = l.get(f) ?? `feed-done-${Date.now().toString()}`;
  (l.delete(f),
    u({ type: `agentToolDone`, id: c, toolId: p }),
    l.size === 0 &&
      ((o.status = `waiting`),
      u({ type: `agentStatus`, id: c, status: `waiting` }),
      s(c),
      e(t, o.label)));
}
function g(e, t) {
  let n = d(e, t),
    r = a.get(n);
  r &&
    ((r.status = `active`),
    (r.lastActivityAt = Date.now()),
    u({ type: `agentStatus`, id: r.numericId, status: `active` }),
    s(r.numericId));
}
function _(e) {
  let t = new EventSource(`/api/agents/events`);
  ((t.onmessage = (e) => {
    try {
      let t = JSON.parse(e.data),
        { type: n } = t;
      n === `agentAdded`
        ? f(t.agentId, t.sessionKey, t.label ?? t.agentId)
        : n === `agentRemoved`
          ? p(t.agentId, t.sessionKey)
          : n === `toolStart`
            ? m(t.agentId, t.sessionKey, t.tool, t.input ?? ``, t.toolCallId)
            : n === `toolDone`
              ? h(t.agentId, t.sessionKey, t.toolCallId)
              : n === `text` && g(t.agentId, t.sessionKey);
    } catch {}
  }),
    (t.onerror = () => {
      t.close();
      let r = Math.min(e * 2, n);
      setTimeout(() => {
        _(r);
      }, e);
    }));
}
function v() {
  _(t);
}
export { l as getAgentDetail, v as initBrowserAgentFeed, c as subscribeAgentDetail };
