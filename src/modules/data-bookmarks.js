import { makePayload, build, threeWay, nowIso } from './util.js';
// Roots are matched by role so Chrome, Edge and Firefox bookmarks line up.
const ROLE = { '1': 'toolbar', '2': 'other', toolbar_____: 'toolbar', unfiled_____: 'other', menu________: 'menu' };
const MENU = 'Bookmarks Menu';
const keyOf = n => n.url !== undefined ? 'b' + n.url + '\u0000' + n.title : 'f' + n.title;
const sortNodes = a => a.map(n => [keyOf(n), n]).sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0).map(x => x[1]);
const strip = (n, f) => {
  if (n.url !== undefined) return f.isUrlExcluded(n.url) ? null : { title: n.title, url: n.url };
  if (f.isFolderExcluded(n.title)) return null;
  return { title: n.title, children: kids(n, f) };
};
const kids = (n, f) => sortNodes((n.children || []).map(c => strip(c, f)).filter(Boolean));
const roleOf = (r, i) => ROLE[r.id] ?? (i === 0 ? 'toolbar' : i === 1 ? 'other' : null);
export async function getLocalState(f) {
  const [root] = await chrome.bookmarks.getTree();
  let toolbar = [], other = [], menu = [];
  root.children.forEach((r, i) => {
    const role = roleOf(r, i); if (!role) return;
    const k = kids(r, f);
    if (role === 'toolbar') toolbar = k; else if (role === 'other') other = k; else menu = k;
  });
  if (menu.length) other = sortNodes([...other, { title: MENU, children: menu }]);
  return makePayload('bookmarks', [{ role: 'toolbar', children: toolbar }, { role: 'other', children: other }]);
}
function mergeNodes(a = [], b = []) {
  const m = new Map();
  for (const n of a) m.set(keyOf(n), n);
  for (const n of b) { const o = m.get(keyOf(n)); if (!o) m.set(keyOf(n), n); else if (n.url === undefined) o.children = mergeNodes(o.children, n.children); }
  return sortNodes([...m.values()]);
}
export async function diffAndMerge(local, remote, base) {
  if (remote && !base && local.hash !== remote.hash) {
    const data = local.data.map(r => ({ role: r.role, children: mergeNodes(r.children, remote.data.find(x => x.role === r.role)?.children) }));
    return { merged: await build('bookmarks', data, nowIso()), source: 'merge' };
  }
  return threeWay(local, remote, base);
}
async function create(parentId, n) {
  if (n.url !== undefined) return chrome.bookmarks.create({ parentId, title: n.title, url: n.url });
  const folder = await chrome.bookmarks.create({ parentId, title: n.title });
  for (const c of n.children || []) await create(folder.id, c);
}
// Minimal diff: only missing items are created and extra items removed (never wipe-and-recreate).
async function reconcile(parent, want, f) {
  const have = new Map();
  for (const c of parent.children || []) {
    if (c.url !== undefined ? f.isUrlExcluded(c.url) : f.isFolderExcluded(c.title)) continue;
    const k = keyOf(c); if (!have.has(k)) have.set(k, []); have.get(k).push(c);
  }
  for (const w of want) {
    const m = have.get(keyOf(w))?.pop();
    if (m) { if (w.url === undefined) await reconcile(m, w.children || [], f); }
    else { try { await create(parent.id, w); } catch {} }
  }
  for (const arr of have.values()) for (const c of arr) {
    try { c.url !== undefined ? await chrome.bookmarks.remove(c.id) : await chrome.bookmarks.removeTree(c.id); } catch {}
  }
}
export async function applyRemoteState(p, f) {
  const [root] = await chrome.bookmarks.getTree(), roots = {};
  root.children.forEach((r, i) => { const role = roleOf(r, i); if (role) roots[role] = r; });
  for (const r of p.data) {
    let want = r.children || [];
    if (r.role === 'other' && roots.menu) {
      const mf = want.find(n => n.url === undefined && n.title === MENU);
      want = want.filter(n => n !== mf);
      await reconcile(roots.menu, mf?.children || [], f);
    }
    if (roots[r.role]) await reconcile(roots[r.role], want, f);
  }
}
