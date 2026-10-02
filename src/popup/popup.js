import '../modules/theme.js';
import { getSettings, setSettings, getMeta, setMeta } from '../modules/storage-adapter.js';
import { getLogs, clearLogs, refreshBadge } from '../modules/logger.js';
import { renderChangelog, CHANGELOG } from '../modules/changelog.js';
import { hasHost, requestHost } from '../modules/perm.js';
const $ = id => document.getElementById(id);
const MAP = { history: 'chk-history', bookmarks: 'chk-bookmarks', tabs: 'chk-tabs', groups: 'chk-tab-groups', settings: 'chk-settings' };
const NAMES = { history: 'History', bookmarks: 'Bookmarks', tabs: 'Open tabs', groups: 'Tab groups', settings: 'Settings' };
const THEMES = [['dark', 'Dark'], ['light', 'Light'], ['amoled', 'AMOLED'], ['auto', 'System']];
const ACCENTS = ['#000000', '#7aa2ff', '#3dd68c', '#f5a524', '#ef5a5f', '#c084fc', '#2dd4bf', '#f472b6', '#94a3b8'];
const fmt = t => t && new Date(t).getTime() ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';
const fmtFull = t => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let logTab = 'history';
if (!chrome.tabGroups) $('row-groups').hidden = true;

async function counts() {
  let n = 0; const walk = a => a.forEach(c => c.url ? n++ : walk(c.children || []));
  walk(await chrome.bookmarks.getTree());
  return `${n.toLocaleString()} Bookmarks | ${(await chrome.tabs.query({})).length} Open Tabs`;
}
async function render() {
  const [s, m, { conflicts = [] }, host] = await Promise.all([getSettings(), getMeta(), chrome.storage.local.get('conflicts'), hasHost()]);
  for (const [k, id] of Object.entries(MAP)) $(id).checked = s.sync[k];
  $('lbl-last-sync').textContent = fmt(m.lastSync); $('lbl-last-update').textContent = m.lastUpdate ? fmt(m.lastUpdate) : '–';
  $('lbl-e2ee').textContent = s.e2ee ? 'End-to-end (AES-256)' : 'Off';
  const offline = !!m.offline;
  $('banner-perm').hidden = host; $('banner-offline').hidden = !offline; $('offline-reason').textContent = m.offlineReason || '';
  $('banner-conflict').hidden = !conflicts.length;
  $('btn-conflicts').textContent = `${conflicts.length} sync conflict${conflicts.length > 1 ? 's' : ''} · Resolve`;
  $('badge-log-status').className = 'dot ' + (!offline && m.health === 'error' ? 'error' : offline || conflicts.length || m.health === 'warn' ? 'warn' : '');
  $('btn-sync-now').classList.toggle('spin', !!m.syncing); $('btn-sync-now').disabled = !!m.syncing;
  $('lbl-data-counts').textContent = await counts();
  $('theme-chips').innerHTML = THEMES.map(([k, n]) => `<button data-t="${k}" aria-pressed="${s.theme === k}">${n}</button>`).join('');
  $('pop-swatches').innerHTML = ACCENTS.map(c => `<button style="background:${c}" data-c="${c}" aria-label="Accent ${c}" aria-pressed="${c === s.accent.toLowerCase()}"></button>`).join('');
  $('pop-accent').value = s.accent;
}
for (const [k, id] of Object.entries(MAP)) $(id).onchange = e => setSettings({ sync: { [k]: e.target.checked } });
$('banner-perm').onclick = async () => { await requestHost(); render(); };
$('btn-sync-now').onclick = async () => {
  $('lbl-msg').textContent = '';
  const r = await chrome.runtime.sendMessage({ type: 'trigger_manual_sync' });
  if (!r?.ok) $('lbl-msg').textContent = r?.error || 'Sync failed';
  render();
};
$('btn-settings').onclick = () => { chrome.runtime.openOptionsPage(); };
$('btn-theme').onclick = () => { $('theme-pop').hidden = !$('theme-pop').hidden; };
$('theme-chips').onclick = e => { const t = e.target.dataset?.t; if (t) setSettings({ theme: t }); };
$('pop-swatches').onclick = e => { const c = e.target.dataset?.c; if (c) setSettings({ accent: c }); };
$('pop-accent').oninput = e => setSettings({ accent: e.target.value });
document.addEventListener('click', e => { if (!e.target.closest('.hdr-actions')) $('theme-pop').hidden = true; });

async function showLogs() {
  $('tab-history').classList.toggle('on', logTab === 'history'); $('tab-activity').classList.toggle('on', logTab === 'activity');
  $('btn-clear-logs').hidden = logTab !== 'activity';
  if (logTab === 'history') {
    const { syncHistory = [] } = await chrome.storage.local.get('syncHistory');
    $('log-list').innerHTML = syncHistory.length ? [...syncHistory].reverse().map(h => `<li><time>${fmtFull(h.t)}</time>${h.manual ? 'Manual' : 'Automatic'} sync · ${h.done.length ? h.done.map(x => NAMES[x]).join(', ') : 'no changes'}${h.conflicts ? ' · ' + h.conflicts + ' conflict(s)' : ''}${h.failed ? ' · ' + h.failed + ' error(s)' : ''}</li>`).join('') : '<li class="muted">No successful syncs yet.</li>';
  } else {
    const logs = (await getLogs()).slice(-100).reverse();
    $('log-list').innerHTML = logs.length ? logs.map(l => `<li class="${l.level}"><time>${fmtFull(l.t)}</time>${esc(l.msg)}</li>`).join('') : '<li class="muted">No log entries yet.</li>';
  }
}
$('btn-logs').onclick = async () => { await showLogs(); $('view-main').hidden = true; $('view-logs').hidden = false; };
$('btn-back').onclick = () => { $('view-logs').hidden = true; $('view-main').hidden = false; };
$('btn-clear-logs').onclick = async () => { await clearLogs(); showLogs(); };
$('tab-history').onclick = () => { logTab = 'history'; showLogs(); };
$('tab-activity').onclick = () => { logTab = 'activity'; showLogs(); };

const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const hue = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const tabCard = (d, t) => { const h = host(t.url); return `<div class="tabcard"><button class="tabbtn" data-u="${esc(t.url)}" title="${esc(t.url)}"><span class="fav" style="background:hsl(${hue(h)} 55% 42%)">${esc((h[0] || '?').toUpperCase())}</span><span class="tt"><b>${esc(t.title)}</b><small>${esc(h)}</small></span></button><button class="x" data-d="${esc(d.id)}" data-u="${esc(t.url)}" title="Close this tab on ${esc(d.name || 'that device')}" aria-label="Close tab">✕</button></div>`; };
$('btn-remote-tabs').onclick = async () => {
  const { remoteTabs = [] } = await chrome.storage.local.get('remoteTabs');
  $('remote-list').innerHTML = remoteTabs.length ? remoteTabs.map(d => `<div class="dev"><h4>${esc(d.name || d.id.slice(0, 6))} <span class="muted small">${d.tabs.length} tabs</span></h4>` +
    d.tabs.map(t => tabCard(d, t)).join('') + '</div>').join('')
    : '<p class="muted">No tabs from other devices yet. Sync on another device first.</p>';
  $('modal').hidden = false;
};
$('btn-close-modal').onclick = () => { $('modal').hidden = true; };
$('remote-list').onclick = async e => {
  const x = e.target.closest('.x');
  if (x) {
    x.disabled = true;
    const r = await chrome.runtime.sendMessage({ type: 'close_remote_tab', deviceId: x.dataset.d, url: x.dataset.u });
    if (r?.ok) x.closest('.tabcard').remove(); else { x.disabled = false; $('lbl-msg').textContent = r?.error || 'Could not close tab'; }
    return;
  }
  const b = e.target.closest('.tabbtn'); if (b) chrome.tabs.create({ url: b.dataset.u });
};

async function showConflicts() {
  const { conflicts = [] } = await chrome.storage.local.get('conflicts');
  $('conflict-list').innerHTML = conflicts.length ? conflicts.map(c => `<div class="dev"><h4>${NAMES[c.type]}</h4><div class="cmp"><div><b>This device</b><br>${c.local.count} items<br>${fmt(c.local.updated)}</div><div><b>Cloud</b><br>${c.remote.count} items<br>${fmt(c.remote.updated)}</div></div><div class="btns"><button class="btn" data-k="${c.type}" data-c="local">Keep this device</button><button class="btn" data-k="${c.type}" data-c="remote">Keep cloud</button></div></div>`).join('') : '<p class="muted">No conflicts.</p>';
}
$('banner-conflict').onclick = async () => { await showConflicts(); $('conflict-modal').hidden = false; };
$('btn-close-conflicts').onclick = () => { $('conflict-modal').hidden = true; };
$('conflict-list').onclick = async e => {
  const b = e.target.closest('button[data-k]'); if (!b) return; b.disabled = true;
  const r = await chrome.runtime.sendMessage({ type: 'resolve_conflict', kind: b.dataset.k, choice: b.dataset.c });
  if (!r?.ok) $('lbl-msg').textContent = r?.error || 'Could not resolve conflict';
  await showConflicts(); render();
};
$('btn-close-changelog').onclick = async () => { $('changelog-modal').hidden = true; await setMeta({ changelogPending: false, changelogSeen: CHANGELOG[0].version }); };
chrome.storage.onChanged.addListener((c, a) => { if (a === 'local' && (c.meta || c.settings || c.conflicts)) render(); });
addEventListener('online', render);
chrome.tabs.onCreated.addListener(render); chrome.tabs.onRemoved.addListener(render);
(async () => {
  await setMeta({ unread: 0 }); await refreshBadge(); await render();
  if ((await getMeta()).changelogPending) { renderChangelog($('changelog-body'), 1); $('changelog-modal').hidden = false; }
})();
