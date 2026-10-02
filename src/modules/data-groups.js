import { makePayload, threeWay, build, nowIso } from './util.js';
const key = g => g.title + '|' + g.color;
export async function getLocalState(f) {
  if (!chrome.tabGroups) return makePayload('groups', []);
  const [groups, tabs] = await Promise.all([chrome.tabGroups.query({}), chrome.tabs.query({})]), by = new Map();
  for (const t of tabs) if (t.groupId >= 0 && /^https?:/.test(t.url || '') && !f.isUrlExcluded(t.url)) { if (!by.has(t.groupId)) by.set(t.groupId, []); by.get(t.groupId).push(t.url); }
  const data = groups.map(g => ({ title: g.title || '', color: g.color, collapsed: g.collapsed, urls: by.get(g.id) || [] })).sort((a, b) => key(a).localeCompare(key(b)));
  return makePayload('groups', data);
}
export async function diffAndMerge(local, remote, base) {
  if (remote && !base && local.hash !== remote.hash) {
    const m = new Map(local.data.map(g => [key(g), { ...g }]));
    for (const g of remote.data) { const o = m.get(key(g)); if (o) o.urls = [...new Set([...o.urls, ...g.urls])]; else m.set(key(g), g); }
    return { merged: await build('groups', [...m.values()].sort((a, b) => key(a).localeCompare(key(b))), nowIso()), source: 'merge' };
  }
  return threeWay(local, remote, base);
}
export async function applyRemoteState(p) {
  if (!chrome.tabGroups) return;
  const [groups, tabs] = await Promise.all([chrome.tabGroups.query({}), chrome.tabs.query({})]);
  const want = new Map(p.data.map(g => [key(g), g]));
  for (const g of groups) {
    const k = (g.title || '') + '|' + g.color, w = want.get(k), mine = tabs.filter(t => t.groupId === g.id);
    if (!w) { if (mine.length) try { await chrome.tabs.ungroup(mine.map(t => t.id)); } catch {} continue; }
    const ids = [];
    for (const u of w.urls.filter(u => !mine.some(t => t.url === u))) ids.push((await chrome.tabs.create({ url: u, active: false })).id);
    if (ids.length) try { await chrome.tabs.group({ groupId: g.id, tabIds: ids }); } catch {}
    want.delete(k);
  }
  for (const w of want.values()) {
    if (!w.urls.length) continue;
    const ids = [];
    for (const u of w.urls) ids.push((await chrome.tabs.create({ url: u, active: false })).id);
    try { const gid = await chrome.tabs.group({ tabIds: ids }); await chrome.tabGroups.update(gid, { title: w.title, color: w.color, collapsed: w.collapsed }); } catch {}
  }
}
