import { ensureOk, fx } from './util.js';
const API = 'https://api.github.com/gists', DESC = 'Syncy sync data', flat = p => p.replace(/\//g, '__');
export function create(sec) {
  const tk = sec.github?.token; if (!tk) throw new Error('GitHub token is not configured');
  const H = { Authorization: 'Bearer ' + tk, Accept: 'application/vnd.github+json' };
  let gist = null;
  async function load(make) {
    if (gist) return gist;
    const { gistId } = await chrome.storage.local.get('gistId');
    if (gistId) { const r = await fx(`${API}/${gistId}`, { headers: H }); if (r.ok) return gist = await r.json(); }
    const found = (await ensureOk(await fx(API + '?per_page=100', { headers: H }), 'GitHub list').json()).find(g => g.description === DESC);
    if (found) { await chrome.storage.local.set({ gistId: found.id }); return gist = await (await fx(found.url, { headers: H })).json(); }
    if (!make) return null;
    gist = await ensureOk(await fx(API, { method: 'POST', headers: H, body: JSON.stringify({ description: DESC, public: false, files: { 'Syncy__README.txt': { content: 'Syncy sync data' } } }) }), 'GitHub create').json();
    await chrome.storage.local.set({ gistId: gist.id }); return gist;
  }
  const patch = async files => {
    const g = await load(true);
    gist = await ensureOk(await fx(`${API}/${g.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ files }) }), 'GitHub write').json();
  };
  return {
    async read(p) { const f = (await load(false))?.files?.[flat(p)]; if (!f) return null; return f.truncated ? (await fx(f.raw_url)).text() : f.content; },
    write: (p, text) => patch({ [flat(p)]: { content: text || ' ' } }),
    async remove(p) { if ((await load(false))?.files?.[flat(p)]) await patch({ [flat(p)]: null }); },
    async list(dir) {
      const g = await load(false), pre = flat(dir) + '__';
      return Object.keys(g?.files || {}).filter(n => n.startsWith(pre) && !n.slice(pre.length).includes('__')).map(n => n.slice(pre.length));
    },
    async removeAll() {
      const g = await load(false); if (!g) return;
      const files = {}; for (const n of Object.keys(g.files)) if (n.startsWith('Syncy__') && n !== 'Syncy__README.txt') files[n] = null;
      if (Object.keys(files).length) await patch(files);
    }
  };
}
