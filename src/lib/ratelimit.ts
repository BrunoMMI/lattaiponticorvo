/** Rate limit in memoria (finestra scorrevole). Con più istanze in produzione va sostituito da uno store condiviso. */
const hits = new Map<string, number[]>();

export function tooMany(key: string, max = 8, windowMs = 15 * 60_000) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}
