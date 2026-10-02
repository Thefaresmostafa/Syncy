import * as bookmarks from './data-bookmarks.js';
import * as history from './data-history.js';
import * as tabs from './data-tabs.js';
import * as groups from './data-groups.js';
import * as settingsH from './data-settings.js';
import { loadFilter } from './filter-engine.js';
import { createProvider } from './providers.js';
import { chunked } from './chunk.js';
import { getSettings, setSettings, getMeta, setMeta, getSecrets, setSecrets } from './storage-adapter.js';
import { deviceInfo, ensureDeviceId } from './device-manager.js';
import { log, setHealth, refreshBadge } from './logger.js';
import { state, nowIso, verifyPayload } from './util.js';
import { getKey, wrap } from './e2ee.js';
import { refreshIfNeeded } from '../login.js';
import { hasHost } from './perm.js';

const HANDLERS = { bookmarks, history, tabs, groups, settings: settingsH };
const FAST = ['bookmarks', 'groups', 'settings'];
const PATH = t => `Syncy/data/${t}.json`, SIDE = t => `Syncy/data/${t}.hash.json`;
const store = async k => (await chrome.storage.local.get(k))[k];
const types = s => Object.keys(HANDLERS).filter(t => s.sync[t] && (t !== 'groups' || chrome.tabGroups));
let running = false, runningSince = 0;

export async function schedule() {
  for (const n of ['syncy-sync', 'syncy-prefetch', 'syncy-verify', 'syncy-commands', 'syncy-token']) await chrome.alarms.clear(n);
  chrome.alarms.create('syncy-token', { periodInMinutes: 360 });
  const s = await getSettings(); if (!s.autoSync) return;
  chrome.alarms.create('syncy-sync', { periodInMinutes: Math.min(60, Math.max(1, +s.interval || 15)) });
  chrome.alarms.create('syncy-commands', { periodInMinutes: 1 });
  if (s.prefetch) chrome.alarms.create('syncy-prefetch', { periodInMinutes: 5 });
  chrome.alarms.create('syncy-verify', { periodInMinutes: 60 });
}
export async function keepLogin() {
  try {
    const sec = await getSecrets(); let changed = false;
    for (const n of Object.keys(sec.oauth || {})) changed = (await refreshIfNeeded(sec, n, true).catch(() => false)) || changed;
    if (changed) await setSecrets(sec);
  } catch {}
}
export async function open() {
  const s = await getSettings(), secrets = await getSecrets();
  if (await refreshIfNeeded(secrets, s.provider)) await setSecrets(secrets);
  const raw = chunked(createProvider(s.provider, secrets));
  let key = null;
  if (s.e2ee) {
    const pw = secrets.e2ee?.passphrase;
    if (!pw) throw new Error('End-to-end encryption is on but no passphrase is set');
    key = await getKey(raw, pw);
  } else if (await raw.read('Syncy/e2ee.json')) throw new Error('This cloud is encrypted. Enter its passphrase in Options > Security.');
  return { s, secrets, raw, key, provider: wrap(raw, key) };
}
export const getProvider = async () => (await open()).provider;

async function checkDevice(provider) {
  const info = await deviceInfo(), path = `Syncy/devices/${info.id}.json`, meta = await getMeta();
  if (meta.registered && !(await provider.read(path))) {
    await setSettings({ autoSync: false }); await setMeta({ registered: false }); await schedule();
    throw new Error('This device was unpaired from remote storage. Auto-sync is now off.');
  }
  await provider.write(path, JSON.stringify(info));
  if (!meta.registered) await setMeta({ registered: true });
}
const count = (t, d) => t === 'bookmarks' ? d.reduce((n, r) => n + (function w(a) { let c = 0; for (const x of a) c += x.url !== undefined ? 1 : w(x.children || []); return c; })(r.children || []), 0) : t === 'settings' ? Object.keys(d).length : d.length;
async function setConflicts(fn) { await chrome.storage.local.set({ conflicts: fn((await store('conflicts')) || []) }); await refreshBadge(); }
const addConflict = (t, l, r) => setConflicts(list => [...list.filter(c => c.type !== t), { type: t, at: nowIso(), local: { updated: l.updated, count: count(t, l.data) }, remote: { updated: r.updated, count: count(t, r.data) } }]);
const clearConflict = t => setConflicts(list => list.some(c => c.type === t) ? list.filter(c => c.type !== t) : list);

async function applyPayload(t, payload, filter) {
  state.applying = true;
  try { await HANDLERS[t].applyRemoteState(payload, filter); if (t === 'settings') await schedule(); }
  finally { setTimeout(() => { state.applying = false; }, 1500); }
}
// The small hash sidecar lets us skip downloading large payloads when nothing changed.
async function putPayload(provider, t, merged) {
  await provider.write(PATH(t), JSON.stringify(merged));
  await provider.write(SIDE(t), JSON.stringify({ hash: merged.hash, updated: merged.updated }));
}
async function readSide(provider, t) { try { const x = await provider.read(SIDE(t)); return x ? JSON.parse(x) : null; } catch { return null; } }
async function push(provider, t, filter) {
  const local = await HANDLERS[t].getLocalState(filter), merged = { ...local, updated: nowIso() };
  await putPayload(provider, t, merged);
  const m = await getMeta(); await setMeta({ synced: { ...m.synced, [t]: merged.hash } });
  return merged;
}

// ---- remote "close tab" commands ----
export async function queueClose(deviceId, url) {
  const p = await getProvider(), path = `Syncy/data/cmd-${deviceId}.json`; let list = [];
  try { const t = await p.read(path); if (t) list = JSON.parse(t); } catch {}
  list.push({ action: 'close', url, at: nowIso() });
  await p.write(path, JSON.stringify(list.slice(-500)));
  const { pendingClose = [], remoteTabs = [] } = await chrome.storage.local.get(['pendingClose', 'remoteTabs']);
  pendingClose.push({ d: deviceId, u: url, at: Date.now() });
  await chrome.storage.local.set({ pendingClose, remoteTabs: remoteTabs.map(d => d.id === deviceId ? { ...d, tabs: d.tabs.filter(t => t.url !== url) } : d) });
}
export async function processCommands(provider) {
  const id = await ensureDeviceId(), path = `Syncy/data/cmd-${id}.json`, txt = await provider.read(path);
  if (!txt) return 0;
  let cmds = []; try { cmds = JSON.parse(txt); } catch {}
  await provider.remove(path);
  const urls = new Set(cmds.filter(c => c.action === 'close').map(c => c.url)); if (!urls.size) return 0;
  const ids = (await chrome.tabs.query({})).filter(t => urls.has(t.url)).map(t => t.id);
  if (ids.length) { await chrome.tabs.remove(ids); await log('info', `Closed ${ids.length} tab(s) on request from another device`); chrome.alarms.create('syncy-change', { delayInMinutes: 0.5 }); }
  return ids.length;
}
export async function pollCommands() { try { if (!running) await processCommands(await getProvider()); } catch {} }

export async function runSync({ manual = false } = {}) {
  if (running && Date.now() - runningSince < 600000) throw new Error('A sync is already running');
  running = true; runningSince = Date.now(); await setMeta({ syncing: true });
  try {
    const { s, provider } = await open(), filter = await loadFilter(s.exclude);
    await checkDevice(provider);
    await processCommands(provider).catch(() => 0);
    const synced = { ...(await getMeta()).synced }, cache = (await store('syncCache')) || {}, pre = (await store('prefetch')) || {};
    const enabled = types(s); let failed = 0, conflicts = 0, lastErr = '', net = false;
    const done = [], skipped = [], applied = [];
    for (const t of enabled) {
      try {
        const h = HANDLERS[t], local = await h.getLocalState(filter), c = cache[t], p = pre[t];
        if (c && p && c.localHash === local.hash && p.hash === c.hash && Date.now() - p.at < 180000) { skipped.push(t); await log('info', `${t}: up to date (cache)`); continue; }
        if (FAST.includes(t)) {
          const side = await readSide(provider, t);
          if (side && side.hash === local.hash) { synced[t] = local.hash; cache[t] = { hash: local.hash, localHash: local.hash }; skipped.push(t); await log('info', `${t}: up to date`); continue; }
          if (side && synced[t] && side.hash === synced[t]) {
            const merged = { ...local, updated: nowIso() }; await putPayload(provider, t, merged);
            synced[t] = merged.hash; cache[t] = { hash: merged.hash, localHash: local.hash }; done.push(t); await clearConflict(t); await log('info', `${t}: local (uploaded)`); continue;
          }
        }
        let raw = await provider.read(PATH(t)); const remote = raw ? JSON.parse(raw) : null; raw = null;
        const r = await h.diffAndMerge(local, remote, synced[t]);
        if (r.conflict && s.conflictMode === 'ask') { await addConflict(t, local, remote); conflicts++; await log('warn', `${t}: conflict between this device and the cloud. Choose which version to keep.`); continue; }
        const { merged, source } = r;
        if (!remote || merged.hash !== remote.hash) await putPayload(provider, t, merged);
        let after = local.hash;
        if (merged.hash !== local.hash) {
          await applyPayload(t, merged, filter);
          if (/^(remote|merge|union)/.test(source)) applied.push(t);
          after = (await h.getLocalState(filter)).hash;
        }
        synced[t] = merged.hash; cache[t] = { hash: merged.hash, localHash: after }; done.push(t);
        await clearConflict(t); await log('info', `${t}: ${source}`);
      } catch (e) { failed++; lastErr = e.message; net = net || e.name === 'NetError'; await log('warn', `${t} failed: ${e.message}`); }
    }
    await setMeta({ synced }); await chrome.storage.local.set({ syncCache: cache });
    if (enabled.length && failed === enabled.length) throw Object.assign(new Error(lastErr), { name: net ? 'NetError' : 'Error' });
    const m = await getMeta(), t = nowIso();
    await setMeta({ lastSync: t, lastError: '', offline: false, offlineReason: '', retry: 0, unread: (m.unread || 0) + applied.length });
    chrome.alarms.clear('syncy-retry');
    const hist = (await store('syncHistory')) || []; hist.push({ t, manual, done, skipped, failed, conflicts });
    await chrome.storage.local.set({ syncHistory: hist.slice(-200) });
    await setHealth(failed || conflicts ? 'warn' : 'ok'); await log('info', failed ? `Sync finished with ${failed} error(s)` : 'Sync complete');
    return { failed, conflicts };
  } catch (e) {
    const net = e.name === 'NetError';
    await log('error', net ? 'Connection lost: ' + e.message : e.message);
    let reason = e.message;
    if (net && !(await hasHost())) reason += ' Syncy has restricted site access: set Site access to "On all sites" in the extension settings (or tap Allow in the popup).';
    await setMeta(net ? { lastError: e.message, offline: true, offlineReason: reason } : { lastError: e.message });
    await setHealth('error');
    if (net) { const n = ((await getMeta()).retry || 0) + 1; await setMeta({ retry: n }); chrome.alarms.create('syncy-retry', { delayInMinutes: Math.min(5, 0.5 * 2 ** (n - 1)) }); } // keeps retrying until the cloud is reachable
    throw e;
  } finally { running = false; await setMeta({ syncing: false }); }
}

export async function resolveConflict(t, choice) {
  const { s, provider } = await open(), filter = await loadFilter(s.exclude), h = HANDLERS[t]; let merged;
  if (choice === 'local') merged = await push(provider, t, filter);
  else {
    const raw = await provider.read(PATH(t)); if (!raw) throw new Error('Cloud version no longer exists');
    merged = JSON.parse(raw); await applyPayload(t, merged, filter);
  }
  const m = await getMeta(), cache = (await store('syncCache')) || {};
  cache[t] = { hash: merged.hash, localHash: (await h.getLocalState(filter)).hash };
  await chrome.storage.local.set({ syncCache: cache }); await setMeta({ synced: { ...m.synced, [t]: merged.hash } });
  await clearConflict(t); await log('info', `${t}: conflict resolved (kept ${choice === 'local' ? 'this device' : 'cloud'})`);
}
export async function verifyIntegrity({ repair = true } = {}) {
  const { s, provider } = await open(), filter = await loadFilter(s.exclude), meta = await getMeta(), issues = [];
  for (const t of types(s)) {
    const local = await HANDLERS[t].getLocalState(filter); let remote = null;
    try { const raw = await provider.read(PATH(t)); remote = raw ? JSON.parse(raw) : null; }
    catch { issues.push(`${t}: unreadable on cloud`); if (repair) await push(provider, t, filter); continue; }
    if (!remote) { issues.push(`${t}: missing on cloud`); if (repair) await push(provider, t, filter); continue; }
    if (!(await verifyPayload(remote))) { issues.push(`${t}: checksum mismatch`); if (repair) await push(provider, t, filter); continue; }
    const side = await readSide(provider, t);
    if (!side || side.hash !== remote.hash) { if (repair) await provider.write(SIDE(t), JSON.stringify({ hash: remote.hash, updated: remote.updated })); }
    if (FAST.includes(t) && local.hash === meta.synced[t] && remote.hash !== meta.synced[t]) issues.push(`${t}: cloud state changed`);
  }
  if (issues.length && repair) await runSync().catch(() => {});
  await setMeta({ lastVerify: { t: nowIso(), issues } });
  await log(issues.length ? 'warn' : 'info', issues.length ? `Integrity check repaired: ${issues.join('; ')}` : 'Integrity check passed: all SHA-256 hashes match');
  return { issues };
}
export async function prefetch() {
  const c = navigator.connection;
  if (running || (c && (c.saveData || /^(slow-2g|2g)$/.test(c.effectiveType)))) return;
  try {
    const { s, provider } = await open(), out = {};
    for (const t of types(s)) { const side = await readSide(provider, t); if (side) out[t] = { at: Date.now(), hash: side.hash }; }
    await chrome.storage.local.set({ prefetch: out });
    if ((await getMeta()).offline) { await setMeta({ offline: false, offlineReason: '' }); await refreshBadge(); }
  } catch (e) { if (e.name === 'NetError') { await setMeta({ offline: true, offlineReason: e.message }); await refreshBadge(); } }
}
export async function detectRemote() {
  const s = await getSettings(), secrets = await getSecrets();
  if (await refreshIfNeeded(secrets, s.provider)) await setSecrets(secrets);
  return { encrypted: !!(await createProvider(s.provider, secrets).read('Syncy/e2ee.json')), local: s.e2ee };
}
export async function forgetE2EE() { await setSettings({ e2ee: false }); const sec = await getSecrets(); delete sec.e2ee; await setSecrets(sec); }
export async function wipeRemote() {
  const { provider } = await open(); await provider.removeAll();
  const s = await getSettings();
  if (s.e2ee) { const sec = await getSecrets(); await getKey(createProvider(s.provider, sec), sec.e2ee.passphrase, true); }
}
export async function enableE2EE(pw, rotate, join) {
  if (!pw || pw.length < 8) throw new Error('Passphrase must be at least 8 characters');
  const secrets = await getSecrets(), prev = secrets.e2ee; secrets.e2ee = { passphrase: pw }; await setSecrets(secrets);
  const s0 = await getSettings(), raw = createProvider(s0.provider, secrets), existing = !!(await raw.read('Syncy/e2ee.json'));
  if (join && !existing) { throw new Error('This cloud is not encrypted.'); }
  if (!join && existing && !rotate) { throw new Error('This cloud is already encrypted. Enter its existing passphrase to join.'); }
  try {
    if (rotate && existing) { await raw.remove('Syncy/e2ee.json'); for (const n of await raw.list('Syncy/devices')) await raw.remove('Syncy/devices/' + n); }
    await setSettings({ e2ee: true });
    if (!existing || rotate) await getKey(raw, pw, true);
    const ctx = await open(), filter = await loadFilter(s0.exclude);
    if (existing && !rotate) return;
    if (rotate) { for (const t of types(s0)) await push(ctx.provider, t, filter); }
    else {
      for (const t of Object.keys(HANDLERS)) for (const p of [PATH(t), SIDE(t)]) { const x = await ctx.provider.read(p); if (x != null) await ctx.provider.write(p, x); }
      for (const n of await ctx.raw.list('Syncy/devices')) { const p = 'Syncy/devices/' + n, x = await ctx.provider.read(p); if (x != null) await ctx.provider.write(p, x); }
    }
    await log('info', 'End-to-end encryption enabled');
  } catch (e) { await setSettings({ e2ee: false }); if (prev) secrets.e2ee = prev; else delete secrets.e2ee; await setSecrets(secrets); throw e; }
}
export async function disableE2EE() {
  const ctx = await open();
  for (const t of Object.keys(HANDLERS)) for (const p of [PATH(t), SIDE(t)]) { const x = await ctx.provider.read(p); if (x != null) await ctx.raw.write(p, x); }
  for (const n of await ctx.raw.list('Syncy/devices')) { const p = 'Syncy/devices/' + n, x = await ctx.provider.read(p); if (x != null) await ctx.raw.write(p, x); }
  await ctx.raw.remove('Syncy/e2ee.json'); await setSettings({ e2ee: false });
  const secrets = await getSecrets(); delete secrets.e2ee; await setSecrets(secrets); await log('warn', 'End-to-end encryption disabled');
}
export async function testConnection() {
  const p = await getProvider(); await p.write('Syncy/ping.txt', nowIso());
  if ((await p.read('Syncy/ping.txt')) == null) throw new Error('Write succeeded but read failed');
  await p.remove('Syncy/ping.txt');
}
