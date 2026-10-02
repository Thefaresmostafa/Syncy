const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = b => { const u = new Uint8Array(b); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function deriveKey(pw, salt) {
  const m = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, m, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encrypt(obj, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deriveKey(pw, salt), enc.encode(JSON.stringify(obj)));
  return { salt: b64(salt), iv: b64(iv), data: b64(ct) };
}
export async function decrypt(blob, pw) {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, await deriveKey(pw, unb64(blob.salt)), unb64(blob.data));
    return JSON.parse(dec.decode(pt));
  } catch { throw new Error('Wrong master password'); }
}
export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));
export const saltBytes = unb64;
export async function encText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return JSON.stringify({ e2ee: 1, iv: b64(iv), data: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text))) });
}
export async function decText(key, str) {
  const o = JSON.parse(str);
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.data)));
}
