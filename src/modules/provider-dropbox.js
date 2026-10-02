import { ensureOk, fx } from './util.js';
export function create(sec) {
  const H = { Authorization: 'Bearer ' + sec.oauth?.dropbox?.token }, P = p => '/' + p;
  const rpc = (ep, body) => fx('https://api.dropboxapi.com/2/' + ep, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return {
    async read(p) {
      const r = await fx('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { ...H, 'Dropbox-API-Arg': JSON.stringify({ path: P(p) }) } });
      if (r.status === 409) return null; ensureOk(r, 'Dropbox read'); return r.text();
    },
    async write(p, text) {
      ensureOk(await fx('https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { ...H, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: P(p), mode: 'overwrite', mute: true }) }, body: text }), 'Dropbox write');
    },
    async remove(p) { const r = await rpc('files/delete_v2', { path: P(p) }); if (r.status !== 409) ensureOk(r, 'Dropbox delete'); },
    async list(dir) {
      const r = await rpc('files/list_folder', { path: P(dir) }); if (r.status === 409) return [];
      ensureOk(r, 'Dropbox list'); return (await r.json()).entries.filter(e => e['.tag'] === 'file').map(e => e.name);
    },
    removeAll() { return this.remove('Syncy'); }
  };
}
