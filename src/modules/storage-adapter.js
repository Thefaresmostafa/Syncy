import * as sec from './security.js';
import { nowIso } from './util.js';
export const DEFAULTS = {
  provider: 'webdav', autoSync: true, interval: 15, theme: 'dark', accent: '#7aa2ff',
  sync: { history: true, bookmarks: true, tabs: true, groups: true, settings: true },
  exclude: '', logMax: 500, toast: true, conflictMode: 'ask', syncOnChange: false, prefetch: true, e2ee: false,
  masterEnabled: false, deviceId: null, deviceName: ''
};
export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...settings, sync: { ...DEFAULTS.sync, ...settings?.sync } };
}
export async function setSettings(p) {
  const s = await getSettings(), n = { ...s, ...p, sync: { ...s.sync, ...p.sync } };
  await chrome.storage.local.set({ settings: n }); return n;
}
export async function getMeta() {
  const { meta } = await chrome.storage.local.get('meta');
  return { synced: {}, mutations: {}, health: 'ok', ...meta };
}
export async function setMeta(p) { const m = await getMeta(); await chrome.storage.local.set({ meta: { ...m, ...p } }); }
const sessionPw = async () => (await chrome.storage.session.get('mp')).mp;
export async function getSecrets() {
  const { secrets } = await chrome.storage.local.get('secrets');
  if (!secrets) return {};
  if (secrets.enc) { const mp = await sessionPw(); if (!mp) throw new Error('LOCKED: unlock Syncy in Options'); return sec.decrypt(secrets.enc, mp); }
  return secrets;
}
export async function setSecrets(obj) {
  const s = await getSettings();
  if (s.masterEnabled) {
    const mp = await sessionPw(); if (!mp) throw new Error('LOCKED: unlock Syncy in Options');
    await chrome.storage.local.set({ secrets: { enc: await sec.encrypt(obj, mp) } });
  } else await chrome.storage.local.set({ secrets: obj });
}
export async function isLocked() { return (await getSettings()).masterEnabled && !(await sessionPw()); }
export async function unlock(pw) {
  const { secrets } = await chrome.storage.local.get('secrets');
  if (secrets?.enc) await sec.decrypt(secrets.enc, pw);
  await chrome.storage.session.set({ mp: pw });
}
export const lock = () => chrome.storage.session.remove('mp');
export async function enableMaster(pw) {
  const secrets = await getSecrets();
  await chrome.storage.session.set({ mp: pw }); await setSettings({ masterEnabled: true }); await setSecrets(secrets);
}
export async function disableMaster() {
  const secrets = await getSecrets();
  await setSettings({ masterEnabled: false }); await chrome.storage.local.set({ secrets }); await lock();
}
export async function touch(type) {
  const m = await getMeta(), ts = nowIso();
  await chrome.storage.local.set({ meta: { ...m, mutations: { ...m.mutations, [type]: ts }, lastUpdate: ts } });
}
