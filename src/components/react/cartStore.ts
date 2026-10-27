import { useSyncExternalStore } from 'react';

/** Il carrello vive nel browser (localStorage) e contiene SOLO cosa si vuole comprare. I prezzi arrivano sempre dal server. */
export interface CartLine {
  itemId: string;
  variantId: string | null;
  quantity: number; // pezzi; per prodotti al kg senza formato: grammi
  label: string; // solo per mostrarlo mentre i prezzi si caricano
}

const KEY = 'lp_cart_v1';
const EMPTY: CartLine[] = [];
let cache: CartLine[] | null = null;
const listeners = new Set<() => void>();

function read(): CartLine[] {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(raw)
      ? raw.filter((l) => typeof l?.itemId === 'string' && Number.isInteger(l?.quantity) && l.quantity > 0).map((l) => ({ itemId: l.itemId, variantId: l.variantId ?? null, quantity: l.quantity, label: String(l.label ?? '') }))
      : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: CartLine[]) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage non disponibile: il carrello vale per la sessione */ }
  listeners.forEach((l) => l());
}

const same = (a: CartLine, b: { itemId: string; variantId: string | null }) => a.itemId === b.itemId && a.variantId === b.variantId;

export const cart = {
  add(line: CartLine) {
    const cur = read();
    const found = cur.find((l) => same(l, line));
    write(found ? cur.map((l) => (l === found ? { ...l, quantity: l.quantity + line.quantity } : l)) : [...cur, line]);
  },
  setQuantity(line: CartLine, quantity: number) {
    write(quantity <= 0 ? read().filter((l) => !same(l, line)) : read().map((l) => (same(l, line) ? { ...l, quantity } : l)));
  },
  remove(line: CartLine) { write(read().filter((l) => !same(l, line))); },
  clear() { write([]); },
};

if (typeof window !== 'undefined') {
  // sincronizza più schede aperte
  window.addEventListener('storage', (e) => { if (e.key === KEY) { cache = null; listeners.forEach((l) => l()); } });
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    read,
    () => EMPTY,
  );
}

export const euro = (cents: number) => (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
