import { runSync, schedule, getProvider, testConnection, verifyIntegrity, prefetch, resolveConflict, enableE2EE, disableE2EE, queueClose, pollCommands, detectRemote, forgetE2EE, wipeRemote, keepLogin } from './modules/sync-engine.js';
import { listDevices, removeDevice, ensureDeviceId } from './modules/device-manager.js';
import { log, refreshBadge } from './modules/logger.js';
import { getSettings, setSettings, setMeta, touch as touchMeta } from './modules/storage-adapter.js';
import { state } from './modules/util.js';

async function drawIcon() {
  try {
    const { accent } = await getSettings(), imageData = {};
    for (const n of [16, 32, 48, 128]) {
      const x = new OffscreenCanvas(n, n).getContext('2d'), d = Math.PI / 180;
      x.lineCap = 'round'; x.lineJoin = 'round';
      for (const [col, w] of [['#000000', .2], [accent, .11]]) {
        x.strokeStyle = col; x.lineWidth = n * w; x.beginPath();
        x.arc(n * .5, n * .3, n * .2, -30 * d, 90 * d, true); x.arc(n * .5, n * .7, n * .2, -90 * d, 150 * d, false); x.stroke();
      }
      imageData[n] = x.getImageData(0, 0, n, n);
    }
    await chrome.action.setIcon({ imageData });
  } catch {}
}
drawIcon();
let lastAccent;
chrome.storage.onChanged.addListener(async (c, a) => { if (a === 'local' && c.settings && c.settings.newValue?.accent !== lastAccent) { lastAccent = c.settings.newValue?.accent; drawIcon(); } });
chrome.runtime.onInstalled.addListener(async d => {
  await setSettings({}); await ensureDeviceId(); await schedule();
  if (d.reason === 'update') await setMeta({ changelogPending: true });
  await refreshBadge(); await log('info', d.reason === 'update' ? 'Syncy updated to ' + chrome.runtime.getManifest().version : 'Syncy installed');
});
chrome.runtime.onStartup.addListener(async () => { await schedule(); refreshBadge(); });
chrome.alarms.onAlarm.addListener(async a => {
  if (a.name === 'syncy-sync' || a.name === 'syncy-change') runSync().catch(() => {});
  else if (a.name === 'syncy-retry') { if ((await getSettings()).autoSync) runSync().catch(() => {}); }
  else if (a.name === 'syncy-prefetch') prefetch();
  else if (a.name === 'syncy-commands') pollCommands();
  else if (a.name === 'syncy-token') keepLogin();
  else if (a.name === 'syncy-verify') verifyIntegrity().catch(() => {});
});
self.addEventListener('offline', async () => { await setMeta({ offline: true, offlineReason: 'No internet connection' }); refreshBadge(); });
self.addEventListener('online', async () => { await setMeta({ offline: false, offlineReason: '' }); refreshBadge(); if ((await getSettings()).autoSync) runSync().catch(() => {}); });

let q = Promise.resolve();
const touch = (t, trigger = true) => {
  if (state.applying) return;
  q = q.then(() => touchMeta(t)).then(async () => {
    const s = await getSettings();
    if (trigger && s.autoSync && s.syncOnChange) chrome.alarms.create('syncy-change', { delayInMinutes: 0.5 });
  }).catch(() => {});
};
for (const e of ['onCreated', 'onRemoved', 'onChanged', 'onMoved']) chrome.bookmarks[e].addListener(() => touch('bookmarks'));
chrome.history.onVisited.addListener(() => touch('history', false));
chrome.tabs.onCreated.addListener(() => touch('tabs'));
chrome.tabs.onRemoved.addListener(() => { touch('tabs'); touch('groups'); });
chrome.tabs.onUpdated.addListener((id, ci) => { if (ci.url || ci.title) touch('tabs', false); if (ci.groupId !== undefined) touch('groups'); });
if (chrome.tabGroups) for (const e of ['onCreated', 'onUpdated', 'onRemoved']) chrome.tabGroups[e].addListener(() => touch('groups'));
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.settings) touch('settings'); });

const notify = (title, message) => chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title, message });
async function handle(m) {
  switch (m.type) {
    case 'trigger_manual_sync': {
      const s = await getSettings();
      try { const r = await runSync({ manual: true }); if (s.toast) notify('Syncy', r.conflicts ? `Sync finished. ${r.conflicts} conflict(s) need your choice.` : 'Sync complete'); }
      catch (e) { if (s.toast) notify('Syncy sync failed', e.message); throw e; }
      return {};
    }
    case 'get_device_list': { const id = await ensureDeviceId(); return { devices: (await listDevices(await getProvider())).map(d => ({ ...d, self: d.id === id })) }; }
    case 'remove_device': await removeDevice(await getProvider(), m.id); await log('info', 'Device unpaired'); return {};
    case 'close_remote_tab': await queueClose(m.deviceId, m.url); await log('info', 'Requested tab close on another device'); return {};
    case 'clear_remote_data':
      await wipeRemote(); await chrome.storage.local.set({ syncCache: {}, prefetch: {}, chunkCounts: {} });
      await setMeta({ registered: false, synced: {} }); await log('warn', 'Remote data wiped'); return {};
    case 'reset_local': {
      for (const d of (indexedDB.databases ? await indexedDB.databases() : [])) indexedDB.deleteDatabase(d.name);
      await chrome.storage.local.clear(); await chrome.storage.session.clear();
      await setSettings({}); await ensureDeviceId(); await schedule(); await refreshBadge(); return {};
    }
    case 'test_connection': await testConnection(); return {};
    case 'reschedule': await schedule(); return {};
    case 'verify_integrity': return await verifyIntegrity();
    case 'resolve_conflict': await resolveConflict(m.kind, m.choice); return {};
    case 'enable_e2ee': await enableE2EE(m.passphrase, !!m.rotate, !!m.join); return {};
    case 'detect_remote': return await detectRemote();
    case 'forget_e2ee': await forgetE2EE(); return {};
    case 'disable_e2ee': await disableE2EE(); return {};
  }
  throw new Error('Unknown message: ' + m.type);
}
chrome.runtime.onMessage.addListener((m, _s, send) => { handle(m).then(r => send({ ok: true, ...r }), e => send({ ok: false, error: e.message })); return true; });
