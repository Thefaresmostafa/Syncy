import { ensureOk, fx } from './util.js';
const A = 'https://www.googleapis.com/drive/v3/files', flat = p => p.replace(/\//g, '__');
export function create(sec) {
  const H = { Authorization: 'Bearer ' + sec.oauth?.gdrive?.token };
  async function find(n) {
    const q = encodeURIComponent(`name='${n}' and 'appDataFolder' in parents and trashed=false`);
    return (await ensureOk(await fx(`${A}?spaces=appDataFolder&q=${q}&fields=files(id,name)`, { headers: H }), 'Drive lookup').json()).files[0]?.id;
  }
  return {
    async read(p) { const id = await find(flat(p)); if (!id) return null; return ensureOk(await fx(`${A}/${id}?alt=media`, { headers: H }), 'Drive read').text(); },
    async write(p, text) {
      const name = flat(p), id = await find(name);
      if (id) return void ensureOk(await fx(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'text/plain' }, body: text }), 'Drive write');
      const b = 'syncyb', body = `--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name, parents: ['appDataFolder'] })}\r\n--${b}\r\nContent-Type: text/plain\r\n\r\n${text}\r\n--${b}--`;
      ensureOk(await fx('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { ...H, 'Content-Type': `multipart/related; boundary=${b}` }, body }), 'Drive create');
    },
    async remove(p) { const id = await find(flat(p)); if (id) ensureOk(await fx(`${A}/${id}`, { method: 'DELETE', headers: H }), 'Drive delete'); },
    async list(dir) {
      const pre = flat(dir) + '__', q = encodeURIComponent(`name contains '${pre}' and 'appDataFolder' in parents and trashed=false`);
      const r = await ensureOk(await fx(`${A}?spaces=appDataFolder&pageSize=1000&q=${q}&fields=files(name)`, { headers: H }), 'Drive list').json();
      return r.files.map(f => f.name).filter(n => n.startsWith(pre) && !n.slice(pre.length).includes('__')).map(n => n.slice(pre.length));
    },
    async removeAll() { for (const d of ['Syncy', 'Syncy/data', 'Syncy/devices']) for (const n of await this.list(d)) await this.remove(`${d}/${n}`); }
  };
}
