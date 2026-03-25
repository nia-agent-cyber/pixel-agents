import { r as e } from './index-CVnfRjxH.js';
var t = e({ notifyAgentIdle: () => r, requestNotifyPermission: () => n });
async function n() {
  return typeof Notification > `u`
    ? !1
    : Notification.permission === `granted`
      ? !0
      : Notification.permission === `denied`
        ? !1
        : (await Notification.requestPermission()) === `granted`;
}
function r(e, t) {
  if (
    typeof Notification > `u` ||
    Notification.permission !== `granted` ||
    (!document.hidden && document.hasFocus())
  )
    return;
  let n = `${t ?? e} is idle`;
  new Notification(`Pixel Office`, { body: n });
}
export { r as n, t };
