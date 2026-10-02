import '../modules/theme.js';
import { getSettings, setSettings, getMeta, getSecrets, setSecrets, isLocked, unlock, enableMaster, disableMaster } from '../modules/storage-adapter.js';
import { renderChangelog } from '../modules/changelog.js';
import { hasHost, requestHost } from '../modules/perm.js';
import { login, logout } from '../login.js';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const send = async msg => { const r = await chrome.runtime.sendMessage(msg); if (!r?.ok) throw new Error(r?.error || 'Failed'); return r; };
let S, SEC = {};
const OAUTH = ['dropbox', 'gdrive', 'onedrive'], INTERVALS = [1, 5, 10, 15, 30, 60], THEMES = ['dark', 'light', 'amoled', 'auto'];
const ACCENTS = ['#7aa2ff', '#3dd68c', '#f5a524', '#ef5a5f', '#c084fc', '#2dd4bf', '#f472b6', '#94a3b8'];
const EXPORT_KEYS = ['provider', 'autoSync', 'interval', 'theme', 'accent', 'sync', 'exclude', 'logMax', 'toast', 'conflictMode', 'syncOnChange', 'prefetch'];

function renderForm() {
  const p = S.provider, box = $('provider-form'), isOauth = OAUTH.includes(p);
  if (p === 'webdav') {
    const w = SEC.webdav || {};
    box.innerHTML = `<input type="url" id="wd-url" placeholder="Server endpoint URL" value="${esc(w.url)}"><input type="text" id="wd-user" placeholder="Username" value="${esc(w.user)}" autocomplete="username"><input type="password" id="wd-pass" placeholder="Password" value="${esc(w.pass)}" autocomplete="current-password"><input type="text" id="wd-folder" placeholder="Target sync folder path (optional)" value="${esc(w.folder)}">`;
  } else if (p === 'github') {
    box.innerHTML = `<div class="row fill"><input type="password" id="gh-token" placeholder="Personal access token" value="${esc(SEC.github?.token)}"><button type="button" class="info-btn" id="btn-gh-info" aria-expanded="false" aria-label="How to get a GitHub token" title="How to get a token"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.4v.01"/></svg></button></div>
      <div id="gh-help" class="help" hidden><strong>How to get your token</strong><ol><li>GitHub › Settings › Developer settings › Personal access tokens › <b>Tokens (classic)</b> › Generate new token (classic).</li><li>Name it <b>Syncy</b> and tick <b>only</b> the permission <b>gist</b> (create gists). Nothing else is needed.</li><li>Choose an expiration, click Generate token and paste it here.</li></ol><div><button type="button" class="btn" id="btn-gh-open">Open the token page</button></div></div>`;
    $('btn-gh-info').onclick = () => { const h = $('gh-help'); h.hidden = !h.hidden; $('btn-gh-info').setAttribute('aria-expanded', String(!h.hidden)); };
    $('btn-gh-open').onclick = () => chrome.tabs.create({ url: 'https://github.com/settings/tokens/new?scopes=gist&description=Syncy' });
  } else {
    const ok = !!SEC.oauth?.[p]?.token;
    box.innerHTML = `<div class="row"><span class="badge ${ok ? 'ok' : ''}">${ok ? 'Logged in' : 'Not logged in'}</span>${ok ? '<button class="btn" id="btn-logout">Log out</button>' : '<button class="btn primary" id="btn-login">Log in</button>'}</div>`;
  }
  const row = document.createElement('div'); row.className = 'actions';
  row.innerHTML = `${isOauth ? '' : '<button class="btn primary" id="btn-save-provider">Save</button>'}<button class="btn" id="btn-test">Test connection</button><span id="prov-msg" class="small"></span>`;
  box.appendChild(row);
  const msg = (t, ok) => { const m = $('prov-msg'); m.textContent = t; m.className = 'small ' + (ok ? 'ok' : 'err'); };
  const collect = async () => {
    if (p === 'webdav') SEC.webdav = { url: $('wd-url').value.trim(), user: $('wd-user').value, pass: $('wd-pass').value, folder: $('wd-folder').value.trim() };
    else if (p === 'github') SEC.github = { token: $('gh-token').value.trim() };
    else return;
    await setSecrets(SEC);
  };
  if ($('btn-save-provider')) $('btn-save-provider').onclick = async () => { try { await collect(); msg('Saved', true); checkRemote(); } catch (e) { msg(e.message); } };
  $('btn-test').onclick = async () => { try { await collect(); msg('Testing…', true); await send({ type: 'test_connection' }); msg('Connection works', true); checkRemote(); } catch (e) { msg(e.message); } };
  if ($('btn-login')) $('btn-login').onclick = async () => { try { msg('Opening login in a new tab…', true); await login(p); SEC = await getSecrets(); renderForm(); loadDevices(); checkRemote(); } catch (e) { msg(e.message); } };
  if ($('btn-logout')) $('btn-logout').onclick = async () => { await logout(p); SEC = await getSecrets(); renderForm(); };
}
async function checkRemote() {
  try {
    const r = await send({ type: 'detect_remote' });
    $('enc-prompt').hidden = !(r.encrypted && !r.local); $('enc-orphan').hidden = !(!r.encrypted && r.local);
  } catch { $('enc-prompt').hidden = true; $('enc-orphan').hidden = true; }
}
$('btn-join').onclick = async () => {
  try { await send({ type: 'enable_e2ee', passphrase: $('join-pp').value, join: true }); S = await getSettings(); SEC = await getSecrets(); $('join-pp').value = ''; $('toggle-e2ee').checked = true; $('join-msg').textContent = ''; checkRemote(); loadDevices(); }
  catch (e) { $('join-msg').textContent = e.message; }
};
$('btn-forget').onclick = async () => { await send({ type: 'forget_e2ee' }); S = await getSettings(); $('toggle-e2ee').checked = false; checkRemote(); };
async function loadDevices() {
  const tb = document.querySelector('#devices tbody');
  try {
    const { devices } = await send({ type: 'get_device_list' });
    tb.innerHTML = devices.length ? devices.map(d => `<tr><td>${esc(d.name)} ${d.self ? '<span class="badge">This device</span>' : ''}</td><td>${esc(d.platform)}</td><td class="ua" title="${esc(d.ua)}">${esc(d.ua)}</td><td>${new Date(d.lastActive).toLocaleString()}</td><td>${d.self ? '' : `<button class="btn danger" data-id="${esc(d.id)}">Unpair</button>`}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">No devices registered yet. Run a sync first.</td></tr>';
  } catch (e) { tb.innerHTML = `<tr><td colspan="5" class="muted">${esc(e.message)}</td></tr>`; }
}
document.querySelector('#devices').onclick = async e => { const id = e.target.dataset?.id; if (id && confirm('Remove this device from remote storage?')) { await send({ type: 'remove_device', id }); loadDevices(); } };
$('btn-refresh-devices').onclick = loadDevices;
function renderSwatches() { $('swatches').innerHTML = ACCENTS.map(c => `<button style="background:${c}" data-c="${c}" aria-label="Accent ${c}" aria-pressed="${c === S.accent.toLowerCase()}"></button>`).join(''); }
$('swatches').onclick = async e => { const c = e.target.dataset?.c; if (c) { await save({ accent: c }); $('accent').value = c; renderSwatches(); } };
$('btn-pal').onclick = async () => { const t = THEMES[(THEMES.indexOf(S.theme) + 1) % 4]; await save({ theme: t }); $('theme').value = t; };
async function refreshStatus() {
  const m = await getMeta();
  $('offline-banner').hidden = !(m.offline || !navigator.onLine); $('offline-reason').textContent = m.offlineReason || '';
  $('perm-banner').hidden = await hasHost();
  if (m.lastVerify) $('verify-msg').textContent = `Last check ${new Date(m.lastVerify.t).toLocaleString()}: ${m.lastVerify.issues.length ? m.lastVerify.issues.join('; ') : 'all hashes match'}`;
}
$('perm-banner').onclick = async () => { await requestHost(); refreshStatus(); };
addEventListener('online', refreshStatus); addEventListener('offline', refreshStatus);
chrome.storage.onChanged.addListener((c, a) => { if (a === 'local' && c.meta) refreshStatus(); });

async function init() {
  S = await getSettings();
  try { SEC = await getSecrets(); } catch { SEC = {}; }
  const v = chrome.runtime.getManifest().version; $('ver').textContent = 'v' + v; $('ver2').textContent = 'v' + v;
  $('provider').value = S.provider; $('toggle-auto-sync').checked = S.autoSync;
  $('sync-interval').value = String(INTERVALS.reduce((a, b) => Math.abs(b - S.interval) < Math.abs(a - S.interval) ? b : a));
  $('toggle-on-change').checked = S.syncOnChange; $('toggle-prefetch').checked = S.prefetch; $('conflict-mode').value = S.conflictMode;
  $('device-name').value = S.deviceName; $('theme').value = S.theme; $('accent').value = S.accent;
  $('exclude').value = S.exclude; $('log-max').value = String(S.logMax); $('toggle-toast').checked = S.toast;
  $('toggle-master-password').checked = S.masterEnabled; $('toggle-e2ee').checked = S.e2ee;
  renderForm(); renderSwatches(); loadDevices(); refreshStatus(); checkRemote();
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}
const save = async p => { S = await setSettings(p); };
$('provider').onchange = async e => { await save({ provider: e.target.value }); renderForm(); loadDevices(); checkRemote(); };
$('toggle-auto-sync').onchange = async e => { await save({ autoSync: e.target.checked }); send({ type: 'reschedule' }); };
$('sync-interval').onchange = async e => { await save({ interval: +e.target.value }); send({ type: 'reschedule' }); };
$('toggle-on-change').onchange = e => save({ syncOnChange: e.target.checked });
$('toggle-prefetch').onchange = async e => { await save({ prefetch: e.target.checked }); send({ type: 'reschedule' }); };
$('conflict-mode').onchange = e => save({ conflictMode: e.target.value });
$('btn-save-name').onclick = async () => { const v = $('device-name').value.trim(); if (!v) { $('name-msg').textContent = 'Enter a name first.'; return; } await save({ deviceName: v }); $('name-msg').textContent = 'Saved. Other devices see the new name after the next sync.'; };
$('theme').onchange = e => save({ theme: e.target.value });
$('accent').oninput = async e => { await save({ accent: e.target.value }); renderSwatches(); };
$('exclude').onchange = e => save({ exclude: e.target.value });
$('log-max').onchange = e => save({ logMax: +e.target.value });
$('toggle-toast').onchange = e => save({ toast: e.target.checked });
$('btn-verify').onclick = async () => {
  $('verify-msg').textContent = 'Checking…';
  try { const { issues } = await send({ type: 'verify_integrity' }); $('verify-msg').textContent = issues.length ? 'Repaired: ' + issues.join('; ') : 'All SHA-256 hashes match.'; } catch (e) { $('verify-msg').textContent = e.message; }
};
const bmsg = t => { $('backup-msg').textContent = t; };
$('btn-export').onclick = async () => {
  const s = await getSettings(), out = {}; for (const k of EXPORT_KEYS) out[k] = s[k];
  const blob = new Blob([JSON.stringify({ app: 'syncy', version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(), settings: out }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `syncy-settings-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000); bmsg('Settings exported. Credentials and passphrases are not included.');
};
$('btn-import').onclick = () => $('file-import').click();
$('file-import').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const j = JSON.parse(await f.text()), i = j.settings;
    if (j.app !== 'syncy' || !i || typeof i !== 'object') throw new Error('This is not a Syncy settings file.');
    const p = {}; for (const k of ['autoSync', 'toast', 'syncOnChange', 'prefetch']) if (typeof i[k] === 'boolean') p[k] = i[k];
    if (['webdav', 'dropbox', 'github', 'gdrive', 'onedrive'].includes(i.provider)) p.provider = i.provider;
    if (INTERVALS.includes(i.interval)) p.interval = i.interval;
    if (THEMES.includes(i.theme)) p.theme = i.theme;
    if (/^#[0-9a-f]{6}$/i.test(i.accent)) p.accent = i.accent;
    if (typeof i.exclude === 'string') p.exclude = i.exclude.slice(0, 20000);
    if ([100, 500, 1000].includes(i.logMax)) p.logMax = i.logMax;
    if (['ask', 'newest'].includes(i.conflictMode)) p.conflictMode = i.conflictMode;
    if (i.sync && typeof i.sync === 'object') { p.sync = {}; for (const k of ['history', 'bookmarks', 'tabs', 'groups', 'settings']) if (typeof i.sync[k] === 'boolean') p.sync[k] = i.sync[k]; }
    await setSettings(p); await send({ type: 'reschedule' }); await init(); bmsg('Settings imported. Re-enter provider credentials if needed.');
  } catch (err) { bmsg(err.message); }
};
const dmsg = t => { $('data-msg').textContent = t; };
$('btn-reset-local').onclick = async () => { if (!confirm('Restore factory defaults and clear all local Syncy data, cache and logs? Cloud files are not touched.')) return; try { await send({ type: 'reset_local' }); dmsg('Factory reset complete.'); init(); } catch (e) { dmsg(e.message); } };
$('btn-reset-remote').onclick = async () => { if (!confirm('Permanently delete the Syncy folder and all device registries from the cloud provider?')) return; try { await send({ type: 'clear_remote_data' }); dmsg('Remote data wiped.'); loadDevices(); } catch (e) { dmsg(e.message); } };
const emsg = (t, bad) => { $('e2ee-msg').textContent = t; $('e2ee-msg').className = 'small ' + (bad ? 'err' : 'muted'); };
$('toggle-e2ee').onchange = async e => {
  if (e.target.checked) {
    try { const r = await send({ type: 'detect_remote' }); if (r.encrypted) { e.target.checked = false; $('enc-prompt').hidden = false; $('join-pp').focus(); return; } } catch {}
    $('e2ee-form').hidden = false; $('pp1').focus(); return;
  }
  if (!confirm('Turn off end-to-end encryption? Cloud data will be rewritten unencrypted for all devices.')) { e.target.checked = true; return; }
  try { emsg('Decrypting cloud data…'); await send({ type: 'disable_e2ee' }); S = await getSettings(); emsg('Encryption disabled.'); } catch (err) { emsg(err.message, true); e.target.checked = true; }
};
$('btn-cancel-e2ee').onclick = () => { $('e2ee-form').hidden = true; $('toggle-e2ee').checked = S.e2ee; };
$('btn-enable-e2ee').onclick = async () => {
  const a = $('pp1').value, b = $('pp2').value;
  if (a.length < 8) return emsg('Use at least 8 characters.', true);
  if (a !== b) return emsg('Passphrases do not match.', true);
  try { emsg('Encrypting cloud data…'); await send({ type: 'enable_e2ee', passphrase: a, rotate: $('chk-rotate').checked }); S = await getSettings(); SEC = await getSecrets(); $('e2ee-form').hidden = true; $('pp1').value = $('pp2').value = ''; $('chk-rotate').checked = false; emsg('End-to-end encryption is on.'); }
  catch (err) { emsg(err.message, true); $('toggle-e2ee').checked = S.e2ee; }
};
const smsg = t => { $('sec-msg').textContent = t; };
$('toggle-master-password').onchange = async e => {
  if (e.target.checked) { $('pw-form').hidden = false; $('pw1').focus(); return; }
  if (!confirm('Turn off the master password? Stored credentials will be saved unencrypted.')) { e.target.checked = true; return; }
  try { await disableMaster(); smsg('Master password removed.'); S = await getSettings(); } catch (err) { smsg(err.message); e.target.checked = true; }
};
$('btn-cancel-pw').onclick = () => { $('pw-form').hidden = true; $('toggle-master-password').checked = S.masterEnabled; };
$('btn-set-pw').onclick = async () => {
  const a = $('pw1').value, b = $('pw2').value;
  if (a.length < 8) return smsg('Use at least 8 characters.');
  if (a !== b) return smsg('Passwords do not match.');
  try { await enableMaster(a); S = await getSettings(); $('pw-form').hidden = true; $('pw1').value = $('pw2').value = ''; smsg('Master password enabled.'); } catch (err) { smsg(err.message); }
};
$('btn-whatsnew').onclick = () => { renderChangelog($('changelog-body'), 5); $('dlg-changelog').showModal(); };
$('btn-close-dlg').onclick = () => $('dlg-changelog').close();
(async () => {
  if (await isLocked()) {
    $('lock').hidden = false; $('lock-pw').focus();
    const go = async () => { try { await unlock($('lock-pw').value); $('lock').hidden = true; init(); } catch (e) { $('lock-err').textContent = e.message; } };
    $('btn-unlock').onclick = go; $('lock-pw').onkeydown = e => { if (e.key === 'Enter') go(); };
  } else init();
})();
