import { makePayload, threeWay } from './util.js';
import { getSettings, setSettings } from './storage-adapter.js';
const KEYS = ['theme', 'accent', 'interval', 'exclude', 'logMax', 'toast'];
export async function getLocalState() { const s = await getSettings(); return makePayload('settings', Object.fromEntries(KEYS.map(k => [k, s[k]]))); }
export const diffAndMerge = async (l, r, b) => threeWay(l, r, b);
export async function applyRemoteState(p) { await setSettings(Object.fromEntries(KEYS.filter(k => k in p.data).map(k => [k, p.data[k]]))); }
