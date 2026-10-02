import { makePayload, build, nowIso } from './util.js';
import { ensureDeviceId } from './device-manager.js';
import { getSettings } from './storage-adapter.js';
import { MAX_TABS } from './limits.js';
export async function getLocalState(f) {
  const id = await ensureDeviceId(), s = await getSettings(), all = await chrome.tabs.query({});
  if (all.length > MAX_TABS) { all.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0)); all.length = MAX_TABS; }
  const tabs = all.filter(t => /^https?:/.test(t.url || '') && !f.isUrlExcluded(t.url)).map(t => ({ title: t.title || t.url, url: t.url, pinned: !!t.pinned }));
  return makePayload('tabs', { [id]: { name: s.deviceName, tabs } });
}
export async function diffAndMerge(local, remote) {
  const merged = await build('tabs', { ...(remote?.data || {}), ...local.data }, nowIso());
  return { merged, source: remote && remote.hash === merged.hash ? 'same' : 'local' };
}
export async function applyRemoteState(p) {
  const id = await ensureDeviceId(), { pendingClose = [] } = await chrome.storage.local.get('pendingClose');
  const live = pendingClose.filter(c => Date.now() - c.at < 3600000 && p.data[c.d]?.tabs.some(t => t.url === c.u));
  const others = Object.entries(p.data).filter(([k]) => k !== id)
    .map(([k, v]) => ({ id: k, ...v, tabs: v.tabs.filter(t => !live.some(c => c.d === k && c.u === t.url)) }));
  await chrome.storage.local.set({ remoteTabs: others, pendingClose: live });
}
