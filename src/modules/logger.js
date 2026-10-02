import { getSettings, getMeta, setMeta } from './storage-adapter.js';
let q = Promise.resolve();
export function log(level, msg) {
  console[level === 'error' ? 'error' : 'log']('[Syncy]', msg);
  q = q.then(async () => {
    const s = await getSettings(), { logs = [] } = await chrome.storage.local.get('logs');
    logs.push({ t: new Date().toISOString(), level, msg });
    await chrome.storage.local.set({ logs: logs.slice(-s.logMax) });
  }).catch(() => {});
  return q;
}
export async function getLogs() { return (await chrome.storage.local.get('logs')).logs || []; }
export const clearLogs = () => chrome.storage.local.set({ logs: [] });
export async function refreshBadge() {
  try {
    const m = await getMeta(), { conflicts = [] } = await chrome.storage.local.get('conflicts');
    let text = '', color = '#7aa2ff';
    if (m.health === 'error' || m.offline) { text = '!'; color = '#e5484d'; }
    else if (conflicts.length) { text = String(conflicts.length); color = '#f5a524'; }
    else if (m.health === 'warn') { text = '!'; color = '#f5a524'; }
    else if (m.unread > 0) { text = String(Math.min(m.unread, 99)); color = '#3dd68c'; }
    await chrome.action.setBadgeText({ text }); await chrome.action.setBadgeBackgroundColor({ color });
  } catch {}
}
export async function setHealth(h) { await setMeta({ health: h }); await refreshBadge(); }
