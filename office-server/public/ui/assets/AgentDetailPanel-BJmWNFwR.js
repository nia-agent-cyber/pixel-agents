import { n as e, r as t, t as n } from './index-Cg1ESQQc.js';
import { getAgentDetail as r, subscribeAgentDetail as i } from './browserAgentFeed-BfOOTFGY.js';
var a = t(e(), 1),
  o = n(),
  s = 1e3,
  c = 200,
  l = `rgba(0, 0, 0, 0.55)`,
  u = `#1e1e2e`,
  d = `2px solid #44475a`,
  f = 480,
  p = `20px 24px`,
  m = 3,
  h = 1500,
  g = {
    active: { background: `#22c55e`, color: `#fff` },
    waiting: { background: `#eab308`, color: `#fff` },
    removed: { background: `#6b7280`, color: `#fff` },
  };
function _(e) {
  let t = Math.floor((Date.now() - e) / 1e3);
  if (t < 5) return `just now`;
  if (t < 60) return `${t.toString()}s ago`;
  let n = Math.floor(t / 60);
  return n < 60 ? `${n.toString()}m ago` : `${Math.floor(n / 60).toString()}h ago`;
}
function v({ agentId: e, onClose: t }) {
  let [, n] = (0, a.useReducer)((e) => e + 1, 0);
  ((0, a.useEffect)(() => {
    let t = i(e, n),
      r = setInterval(n, s);
    return () => {
      (t(), clearInterval(r));
    };
  }, [e]),
    (0, a.useEffect)(() => {
      let e = (e) => {
        e.key === `Escape` && t();
      };
      return (
        window.addEventListener(`keydown`, e),
        () => window.removeEventListener(`keydown`, e)
      );
    }, [t]));
  let v = r(e);
  (0, a.useEffect)(() => {
    v || t();
  }, [v, t]);
  let [y, b] = (0, a.useState)(!1),
    x = (0, a.useCallback)(() => {
      v &&
        navigator.clipboard.writeText(v.sessionKey).then(() => {
          (b(!0), setTimeout(() => b(!1), h));
        });
    }, [v]);
  if (!v) return null;
  let S = g[v.status] ?? g.waiting,
    C = v.recentTools.length > 0 ? [...v.recentTools].reverse() : null;
  return (0, o.jsx)(`div`, {
    role: `dialog`,
    'aria-modal': `true`,
    'aria-label': `Agent details: ${v.label}`,
    style: {
      position: `fixed`,
      inset: 0,
      background: l,
      zIndex: c,
      display: `flex`,
      alignItems: `center`,
      justifyContent: `center`,
    },
    onClick: t,
    children: (0, o.jsxs)(`div`, {
      style: {
        background: u,
        border: d,
        maxWidth: f,
        width: `90%`,
        padding: p,
        boxShadow: `0 8px 32px rgba(0,0,0,0.6)`,
        fontFamily: `"Courier New", Courier, monospace`,
        color: `#cdd6f4`,
      },
      onClick: (e) => e.stopPropagation(),
      children: [
        (0, o.jsxs)(`div`, {
          style: {
            display: `flex`,
            alignItems: `center`,
            justifyContent: `space-between`,
            marginBottom: 12,
          },
          children: [
            (0, o.jsx)(`span`, {
              style: {
                fontSize: 18,
                fontWeight: 700,
                color: `#cba6f7`,
                overflow: `hidden`,
                textOverflow: `ellipsis`,
                whiteSpace: `nowrap`,
                maxWidth: `55%`,
              },
              children: v.label,
            }),
            (0, o.jsxs)(`div`, {
              style: { display: `flex`, alignItems: `center`, gap: 8 },
              children: [
                (0, o.jsx)(`span`, {
                  style: {
                    background: S.background,
                    color: S.color,
                    padding: `2px 10px`,
                    borderRadius: m,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: `uppercase`,
                    display: `inline-block`,
                  },
                  children: v.status,
                }),
                (0, o.jsx)(`button`, {
                  'aria-label': `Close panel`,
                  onClick: t,
                  style: {
                    background: `transparent`,
                    border: `none`,
                    color: `#6c7086`,
                    fontSize: 20,
                    cursor: `pointer`,
                    lineHeight: 1,
                    padding: `0 2px`,
                  },
                  children: `×`,
                }),
              ],
            }),
          ],
        }),
        (0, o.jsxs)(`div`, {
          style: {
            display: `flex`,
            alignItems: `center`,
            gap: 8,
            marginBottom: 14,
            fontSize: 11,
            color: `#6c7086`,
          },
          children: [
            (0, o.jsxs)(`span`, {
              style: { overflow: `hidden`, textOverflow: `ellipsis`, whiteSpace: `nowrap` },
              children: [`Session: `, v.sessionKey],
            }),
            (0, o.jsx)(`button`, {
              onClick: x,
              style: {
                flexShrink: 0,
                background: y ? `#22c55e` : `#313244`,
                border: `1px solid #45475a`,
                color: y ? `#fff` : `#cdd6f4`,
                fontSize: 10,
                padding: `2px 7px`,
                cursor: `pointer`,
                borderRadius: 2,
                transition: `background 0.2s`,
              },
              children: y ? `✓ Copied` : `Copy`,
            }),
          ],
        }),
        (0, o.jsx)(`div`, { style: { borderTop: `1px solid #313244`, marginBottom: 12 } }),
        (0, o.jsxs)(`div`, {
          style: { marginBottom: 4 },
          children: [
            (0, o.jsxs)(`div`, {
              style: {
                display: `flex`,
                justifyContent: `space-between`,
                alignItems: `baseline`,
                marginBottom: 8,
              },
              children: [
                (0, o.jsx)(`span`, {
                  style: { fontSize: 11, fontWeight: 700, color: `#a6e3a1`, letterSpacing: 1 },
                  children: `RECENT ACTIVITY`,
                }),
                (0, o.jsxs)(`span`, {
                  style: { fontSize: 11, color: `#6c7086` },
                  children: [`last active: `, _(v.lastActivityAt)],
                }),
              ],
            }),
            C
              ? (0, o.jsx)(`ul`, {
                  style: { margin: 0, padding: 0, listStyle: `none` },
                  children: C.map((e, t) =>
                    (0, o.jsxs)(
                      `li`,
                      {
                        style: {
                          fontSize: 12,
                          color: t === 0 ? `#cdd6f4` : `#585b70`,
                          padding: `3px 0`,
                          borderBottom: t < C.length - 1 ? `1px solid #1e1e2e` : `none`,
                          overflow: `hidden`,
                          textOverflow: `ellipsis`,
                          whiteSpace: `nowrap`,
                        },
                        children: [
                          (0, o.jsx)(`span`, {
                            style: { color: `#89b4fa`, marginRight: 6 },
                            children: `›`,
                          }),
                          e,
                        ],
                      },
                      `${t}-${e.slice(0, 20)}`,
                    ),
                  ),
                })
              : (0, o.jsx)(`p`, {
                  style: { fontSize: 12, color: `#585b70`, margin: 0 },
                  children: `No tool calls yet`,
                }),
          ],
        }),
      ],
    }),
  });
}
export { v as AgentDetailPanel };
