import { getSettings, setSettings } from './storage-adapter.js';
export async function ensureDeviceId() {
  const s = await getSettings(); if (s.deviceId) return s.deviceId;
  const id = crypto.randomUUID();
  await setSettings({ deviceId: id, deviceName: s.deviceName || 'Device ' + id.slice(0, 4) }); return id;
}
export async function deviceInfo() {
  const id = await ensureDeviceId(), s = await getSettings(), p = await chrome.runtime.getPlatformInfo();
  return { id, name: s.deviceName, platform: p.os, ua: navigator.userAgent, lastActive: new Date().toISOString() };
}
export async function listDevices(provider) {
  const out = [];
  for (const n of await provider.list('Syncy/devices')) {
    if (!n.endsWith('.json')) continue;
    try { const r = await provider.read('Syncy/devices/' + n); if (r) out.push(JSON.parse(r)); } catch {}
  }
  return out;
}
export const removeDevice = (provider, id) => provider.remove(`Syncy/devices/${id}.json`);
