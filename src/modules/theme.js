import { getSettings } from './storage-adapter.js';
export async function applyTheme() {
  const s = await getSettings(); let t = s.theme;
  if (t === 'auto') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const r = document.documentElement; r.dataset.theme = t; r.style.setProperty('--accent', s.accent);
  const n = parseInt(s.accent.slice(1), 16), lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  r.style.setProperty('--on-accent', lum > 0.6 ? '#10121a' : '#ffffff');
}
applyTheme();
chrome.storage.onChanged.addListener(c => { if (c.settings) applyTheme(); });
