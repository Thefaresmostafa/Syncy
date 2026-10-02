import * as sec from './security.js';
const keys = new Map();
async function derive(pw, salt) {
  const id = pw + '|' + salt;
  if (!keys.has(id)) keys.set(id, await sec.deriveKey(pw, sec.saltBytes(salt)));
  return keys.get(id);
}
// AES-GCM-256 key derived locally with PBKDF2. Only a public salt + encrypted check value live in the cloud.
export async function getKey(raw, passphrase, create = false) {
  const txt = await raw.read('Syncy/e2ee.json');
  if (!txt) {
    if (!create) throw new Error('Encryption info is missing on the cloud. Re-enable encryption in Options > Security.');
    const info = { v: 1, salt: sec.newSalt() };
    info.check = await sec.encText(await derive(passphrase, info.salt), 'syncy-ok');
    await raw.write('Syncy/e2ee.json', JSON.stringify(info));
    return derive(passphrase, info.salt);
  }
  const info = JSON.parse(txt), key = await derive(passphrase, info.salt);
  try { if ((await sec.decText(key, info.check)) !== 'syncy-ok') throw 0; } catch { throw new Error('Wrong end-to-end encryption passphrase'); }
  return key;
}
const isEnv = t => t.startsWith('{"e2ee":1,');
export function wrap(raw, key) {
  return {
    raw,
    async read(p) {
      const t = await raw.read(p);
      if (t == null || !isEnv(t)) return t;
      if (!key) throw new Error('Cloud data is encrypted. Enable end-to-end encryption with the shared passphrase.');
      try { return await sec.decText(key, t); } catch { throw new Error('Could not decrypt cloud data. Check the passphrase.'); }
    },
    async write(p, text) { return raw.write(p, key ? await sec.encText(key, text) : text); },
    remove: p => raw.remove(p), list: d => raw.list(d), removeAll: () => raw.removeAll()
  };
}
