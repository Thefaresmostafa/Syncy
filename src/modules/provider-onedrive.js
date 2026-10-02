import { ensureOk, fx } from './util.js';
const B = 'https://graph.microsoft.com/v1.0/me/drive/special/approot:/', enc = p => p.split('/').map(encodeURIComponent).join('/');
export function create(sec) {
  const H = { Authorization: 'Bearer ' + sec.oauth?.onedrive?.token };
  return {
    async read(p) { const r = await fx(`${B}${enc(p)}:/content`, { headers: H }); if (r.status === 404) return null; ensureOk(r, 'OneDrive read'); return r.text(); },
    async write(p, text) { ensureOk(await fx(`${B}${enc(p)}:/content`, { method: 'PUT', headers: { ...H, 'Content-Type': 'text/plain' }, body: text }), 'OneDrive write'); },
    async remove(p) { const r = await fx(`${B}${enc(p)}`, { method: 'DELETE', headers: H }); if (r.status !== 404) ensureOk(r, 'OneDrive delete'); },
    async list(dir) {
      const r = await fx(`${B}${enc(dir)}:/children`, { headers: H }); if (r.status === 404) return [];
      ensureOk(r, 'OneDrive list'); return (await r.json()).value.filter(v => v.file).map(v => v.name);
    },
    removeAll() { return this.remove('Syncy'); }
  };
}
