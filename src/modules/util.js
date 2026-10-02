export const state = { applying: false };
export const nowIso = () => new Date().toISOString();
export const stable = v => JSON.stringify(v); // payloads are built with fixed key order, so plain JSON is deterministic
export async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function build(type, data, updated, hashSrc) {
  return { type, updated, hash: await sha(typeof hashSrc === 'string' ? hashSrc : stable(data)), data };
}
export async function makePayload(type, data, hashSrc) {
  const { meta } = await chrome.storage.local.get('meta');
  return build(type, data, meta?.mutations?.[type] || new Date(0).toISOString(), hashSrc);
}
export function threeWay(local, remote, base) {
  if (!remote) return { merged: local, source: 'local' };
  if (local.hash === remote.hash) return { merged: remote, source: 'same' };
  if (local.hash === base) return { merged: remote, source: 'remote' };
  if (remote.hash === base) return { merged: local, source: 'local' };
  return local.updated >= remote.updated ? { merged: local, source: 'local (LWW)', conflict: true } : { merged: remote, source: 'remote (LWW)', conflict: true };
}
export const hashSrcOf = p => p.type === 'history' ? p.data.map(x => x.url).sort().join('\n') : stable(p.data);
export const verifyPayload = async p => (await sha(hashSrcOf(p))) === p.hash;
export class NetError extends Error { constructor(m) { super(m); this.name = 'NetError'; } }
export async function fx(url, opts = {}) {
  const len = opts.body?.length || 0; let last;
  for (let i = 0; i < 5; i++) {
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 120000 + len / 50);
    try { return await fetch(url, { cache: 'no-store', credentials: 'omit', ...opts, signal: ac.signal }); }
    catch (e) { last = e; } finally { clearTimeout(to); }
    if (i < 4) await new Promise(r => setTimeout(r, 700 * 2 ** i));
  }
  let host = url; try { host = new URL(url).host; } catch {}
  throw new NetError(`Cannot reach ${host}: ${last?.name === 'AbortError' ? 'request timed out' : (last?.message || 'network error')}`);
}
export function ensureOk(res, what = 'Request') {
  if (res.status === 401 || res.status === 403) throw new Error(`${what} failed: access denied (HTTP ${res.status}). Check your login or credentials.`);
  if (!res.ok) throw new Error(`${what} failed: HTTP ${res.status}`);
  return res;
}
