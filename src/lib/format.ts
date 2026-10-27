import type { SellUnit } from './pricing';

/** "12,50" | "12.5" | "12" → 1250. Restituisce null se vuoto o non valido. */
export function parseEuro(v: FormDataEntryValue | null | undefined): number | null {
  const s = String(v ?? '').trim().replace(/\s|€/g, '').replace(',', '.');
  if (!s) return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) throw new Error(`Importo non valido: "${v}"`);
  return Math.round(parseFloat(s) * 100);
}

export const centsToInput = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

export const unitLabels: Record<SellUnit, string> = {
  piece: 'Al pezzo',
  kg: 'Al kg',
  fixed_weight: 'A peso fisso',
  pack: 'In confezione',
};

/** Giacenza leggibile: i prodotti al kg sono salvati in grammi. */
export function formatStock(qty: number, unit: SellUnit) {
  if (unit !== 'kg') return `${qty} pz`;
  return `${(qty / 1000).toLocaleString('it-IT', { maximumFractionDigits: 3 })} kg`;
}

/** Valore da mostrare nel campo giacenza dell'admin (kg per i prodotti al peso, pezzi per gli altri). */
export const stockToInput = (qty: number, unit: SellUnit) => (unit === 'kg' ? String(qty / 1000).replace('.', ',') : String(qty));

export function parseStock(v: FormDataEntryValue | null, unit: SellUnit): number {
  const n = Number(String(v ?? '0').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) throw new Error('Giacenza non valida.');
  return unit === 'kg' ? Math.round(n * 1000) : Math.round(n);
}

export const priceLabel = (cents: number, unit: SellUnit) =>
  `${(cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}${unit === 'kg' ? ' / kg' : ''}`;
