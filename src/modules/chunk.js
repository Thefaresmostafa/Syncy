// Splits very large files into parts so every provider's size limit is respected.
const MARK = '{"chunked":1,', PAR = 4;
async function pool(items, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(PAR, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}
const counts = async () => (await chrome.storage.local.get('chunkCounts')).chunkCounts || {};
const setCount = async (p, n) => { const c = await counts(); if (n) c[p] = n; else delete c[p]; await chrome.storage.local.set({ chunkCounts: c }); };
export function chunked(raw) {
  const size = raw.maxChunk || 8_000_000;
  const dropFrom = async (p, from) => { const old = (await counts())[p] || 0; for (let i = from; i < old; i++) await raw.remove(`${p}.p${i}`); };
  return {
    async read(p) {
      const t = await raw.read(p);
      if (t == null || !t.startsWith(MARK)) return t;
      const m = JSON.parse(t), parts = new Array(m.n);
      await pool([...parts.keys()], async i => {
        const x = await raw.read(`${p}.p${i}`);
        if (x == null) throw new Error(`Cloud file ${p} is incomplete (part ${i} missing)`);
        parts[i] = x;
      });
      const all = parts.join('');
      if (all.length !== m.len) throw new Error(`Cloud file ${p} is corrupted (size mismatch)`);
      return all;
    },
    async write(p, text) {
      if (text.length <= size) { await raw.write(p, text); await dropFrom(p, 0); await setCount(p, 0); return; }
      const cuts = [0]; let pos = 0;
      while (pos < text.length) {
        let end = Math.min(pos + size, text.length);
        if (end < text.length) { const c = text.charCodeAt(end); if (c >= 0xDC00 && c <= 0xDFFF) end--; }
        cuts.push(end); pos = end;
      }
      const n = cuts.length - 1;
      await pool([...Array(n).keys()], i => raw.write(`${p}.p${i}`, text.slice(cuts[i], cuts[i + 1])));
      await raw.write(p, JSON.stringify({ chunked: 1, n, len: text.length }));
      await dropFrom(p, n); await setCount(p, n);
    },
    async remove(p) { await dropFrom(p, 0); await setCount(p, 0); await raw.remove(p); },
    async list(d) { return (await raw.list(d)).filter(n => !/\.p\d+$/.test(n)); },
    removeAll: () => raw.removeAll()
  };
}
