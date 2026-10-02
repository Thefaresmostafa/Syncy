import { ensureOk, fx } from './util.js';
const PROPFIND = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>';
export function create(sec) {
  const w = sec.webdav || {};
  let base = (w.url || '').trim();
  if (!base) throw new Error('WebDAV endpoint is not configured');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(base)) base = 'https://' + base;
  base = base.replace(/\/+$/, '');
  try { new URL(base); } catch { throw new Error('WebDAV endpoint URL is not valid'); }
  const root = (w.folder || '').replace(/^\/+|\/+$/g, '');
  const auth = 'Basic ' + btoa(unescape(encodeURIComponent((w.user || '') + ':' + (w.pass || ''))));
  const rel = p => [root, p].filter(Boolean).join('/').split('/').filter(Boolean);
  const url = (p, dir) => base + '/' + rel(p).map(encodeURIComponent).join('/') + (dir ? '/' : '');
  // One request at a time with a short gap: some WebDAV hosts reset connections when hit in parallel.
  let chain = Promise.resolve();
  const gate = fn => { const r = chain.then(fn, fn); chain = r.then(() => new Promise(x => setTimeout(x, 80)), () => new Promise(x => setTimeout(x, 80))); return r; };
  const f = (p, o = {}, dir) => gate(() => fx(url(p, dir), { ...o, headers: { Authorization: auth, ...o.headers } }));
  const made = new Set();
  async function mk(dir) {
    const parts = rel(dir);
    for (let i = 0; i < parts.length; i++) {
      const key = parts.slice(0, i + 1).join('/'); if (made.has(key)) continue;
      const r = await gate(() => fx(base + '/' + parts.slice(0, i + 1).map(encodeURIComponent).join('/') + '/', { method: 'MKCOL', headers: { Authorization: auth } }));
      if (r.status === 401) ensureOk(r, 'WebDAV');
      if (![200, 201, 204, 301, 302, 405].includes(r.status)) throw new Error('WebDAV could not create folder: HTTP ' + r.status);
      made.add(key);
    }
  }
  return {
    async read(p) { const r = await f(p); if (r.status === 404) return null; ensureOk(r, 'WebDAV read'); return r.text(); },
    async write(p, text) {
      let r = await f(p, { method: 'PUT', body: text });
      if (r.status === 409 || r.status === 404 || r.status === 403) { await mk(p.split('/').slice(0, -1).join('/')); r = await f(p, { method: 'PUT', body: text }); }
      ensureOk(r, 'WebDAV write');
    },
    async remove(p, dir) { const r = await f(p, { method: 'DELETE' }, dir); if (r.status !== 404) ensureOk(r, 'WebDAV delete'); },
    async list(dir) {
      const r = await f(dir, { method: 'PROPFIND', headers: { Depth: '1', 'Content-Type': 'application/xml' }, body: PROPFIND }, true);
      if (r.status === 404) return [];
      ensureOk(r, 'WebDAV list');
      const out = [];
      for (const b of (await r.text()).match(/<(?:\w+:)?response[\s>][\s\S]*?<\/(?:\w+:)?response>/gi) || []) {
        if (/<(?:\w+:)?collection/i.test(b)) continue;
        const m = b.match(/<(?:\w+:)?href[^>]*>([^<]+)</i); if (m) out.push(decodeURIComponent(m[1]).split('/').pop());
      }
      return out;
    },
    removeAll() { return this.remove('Syncy', true); }
  };
}
