import { makePayload, build, nowIso } from './util.js';
import { MAX_HISTORY } from './limits.js';
const hs = d => d.map(x => x.url).sort().join('\n');
const search = () => chrome.history.search({ text: '', maxResults: MAX_HISTORY, startTime: 0 });
export async function getLocalState(f) {
  const data = (await search()).filter(i => /^https?:/.test(i.url) && !f.isUrlExcluded(i.url)).map(i => ({ url: i.url, title: i.title || '', t: Math.round(i.lastVisitTime || 0) }));
  return makePayload('history', data, hs(data));
}
export async function diffAndMerge(local, remote) {
  const map = new Map();
  for (const i of [...(remote?.data || []), ...local.data]) { const o = map.get(i.url); if (!o || i.t > o.t) map.set(i.url, i); }
  const data = [...map.values()].sort((a, b) => b.t - a.t).slice(0, MAX_HISTORY);
  const merged = await build('history', data, nowIso(), hs(data));
  return { merged, source: remote && merged.hash === remote.hash ? 'same' : 'union' };
}
export async function applyRemoteState(p) {
  const have = new Set((await search()).map(i => i.url)); let n = 0;
  for (const i of [...p.data].sort((a, b) => a.t - b.t)) {
    if (have.has(i.url)) continue;
    try { await chrome.history.addUrl({ url: i.url }); } catch {}
    if (++n >= 200) break;
  }
}
