import { useEffect, useState } from 'react';
import { cart, euro, useCart, type CartLine } from './cartStore';

interface QLine { itemId: string; variantId: string | null; name: string; quantity: number; weightGrams: number | null; lineTotalCents: number }
interface Quote { lines: QLine[]; subtotalCents: number; discountCents: number; totalCents: number; couponCode: string | null; hasVariableWeight: boolean }

export const couponKey = 'lp_coupon';

export async function fetchQuote(lines: CartLine[], extra: object = {}) {
  const res = await fetch('/api/cart/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines: lines.map(({ itemId, variantId, quantity }) => ({ itemId, variantId, quantity })), ...extra }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Errore nel calcolo del carrello.');
  return data as Quote & { shippingCents: number };
}

export default function CartView() {
  const lines = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => { setReady(true); setApplied(sessionStorage.getItem(couponKey) ?? ''); }, []);
  useEffect(() => {
    if (!ready) return;
    if (!lines.length) { setQuote(null); setError(''); return; }
    let live = true;
    fetchQuote(lines, applied ? { couponCode: applied } : {})
      .then((q) => { if (live) { setQuote(q); setError(''); } })
      .catch((e: Error) => { if (live) { setError(e.message); setQuote(null); } });
    return () => { live = false; };
  }, [lines, applied, ready]);

  if (!ready) return <p className="text-ink-soft">Caricamento…</p>;
  if (!lines.length) return (
    <div className="text-center py-16">
      <p className="font-display text-2xl">Il carrello è vuoto</p>
      <a href="/shop" className="btn btn-primary mt-6">Scopri i prodotti</a>
    </div>
  );

  const find = (l: CartLine) => quote?.lines.find((q) => q.itemId === l.itemId && q.variantId === l.variantId);
  const free = (l: CartLine) => !l.variantId && !!find(l)?.weightGrams && find(l)!.weightGrams === l.quantity;
  const fmtQty = (l: CartLine) => (free(l) ? (l.quantity >= 1000 ? `${l.quantity / 1000} kg` : `${l.quantity} g`) : String(l.quantity));
  const stepFor = (l: CartLine) => (free(l) ? 100 : 1);

  function applyCoupon(e: React.FormEvent) {
    e.preventDefault();
    const c = coupon.trim();
    if (c) { sessionStorage.setItem(couponKey, c); setApplied(c); setCoupon(''); }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section aria-label="Prodotti nel carrello">
        {error && <p role="alert" className="mb-4 rounded-lg bg-bordeaux-50 p-3 text-bordeaux-700">{error}</p>}
        <ul className="grid gap-3">
          {lines.map((l) => {
            const q = find(l);
            return (
              <li key={`${l.itemId}-${l.variantId}`} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] bg-white p-4">
                <div className="grow min-w-48"><p className="font-medium">{q?.name ?? l.label}</p></div>
                <div className="flex items-center gap-1" role="group" aria-label={`Quantità di ${l.label}`}>
                  <button className="btn btn-ghost !min-h-9 !px-3" aria-label="Diminuisci" onClick={() => cart.setQuantity(l, l.quantity - stepFor(l))}>−</button>
                  <output className="min-w-14 text-center">{fmtQty(l)}</output>
                  <button className="btn btn-ghost !min-h-9 !px-3" aria-label="Aumenta" onClick={() => cart.setQuantity(l, l.quantity + stepFor(l))}>+</button>
                </div>
                <p className="w-24 text-right font-medium">{q ? euro(q.lineTotalCents) : '…'}</p>
                <button className="text-sm underline text-bordeaux-700" onClick={() => cart.remove(l)} aria-label={`Rimuovi ${l.label}`}>Rimuovi</button>
              </li>
            );
          })}
        </ul>
      </section>

      <aside className="h-fit rounded-[var(--radius-card)] bg-white p-5 grid gap-3" aria-label="Riepilogo">
        <h2 className="text-xl">Riepilogo</h2>
        <form onSubmit={applyCoupon} className="flex gap-2">
          <label className="sr-only" htmlFor="coupon">Codice sconto</label>
          <input id="coupon" value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Codice sconto" className="min-h-10 grow rounded-lg border border-line px-3" />
          <button className="btn btn-ghost !min-h-10">Applica</button>
        </form>
        {applied && <p className="text-sm">Codice <strong>{applied}</strong> <button className="underline" onClick={() => { sessionStorage.removeItem(couponKey); setApplied(''); }}>rimuovi</button></p>}
        {quote && (
          <dl className="grid gap-1 text-sm">
            <div className="flex justify-between"><dt>Subtotale</dt><dd>{euro(quote.subtotalCents)}</dd></div>
            {quote.discountCents > 0 && <div className="flex justify-between text-green-700"><dt>Sconto</dt><dd>−{euro(quote.discountCents)}</dd></div>}
            <div className="flex justify-between text-ink-soft"><dt>Spedizione</dt><dd>calcolata al checkout</dd></div>
            <div className="flex justify-between border-t border-line pt-2 font-display text-lg"><dt>Totale prodotti</dt><dd>{euro(quote.totalCents)}</dd></div>
          </dl>
        )}
        {quote?.hasVariableWeight && <p className="text-xs text-ink-soft">Alcuni prodotti sono a peso variabile: autorizziamo l’importo e addebitiamo solo il peso effettivo, mai di più.</p>}
        <a href="/checkout" className={`btn btn-primary ${!quote ? 'pointer-events-none opacity-50' : ''}`} aria-disabled={!quote}>Procedi al checkout</a>
      </aside>
    </div>
  );
}
