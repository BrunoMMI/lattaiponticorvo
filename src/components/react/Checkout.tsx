import { useEffect, useState } from 'react';
import { euro, useCart } from './cartStore';
import { couponKey, fetchQuote } from './CartView';

interface Method { id: string; name: string; kind: 'pickup' | 'delivery'; priceCents: number; freeOverCents: number | null; zones: string[]; etaText: string | null }
interface Quote { subtotalCents: number; discountCents: number; shippingCents: number; totalCents: number; hasVariableWeight: boolean }

const input = 'min-h-11 w-full rounded-lg border border-line bg-white px-3';

export default function Checkout() {
  const lines = useCart();
  const [ready, setReady] = useState(false);
  const [methods, setMethods] = useState<Method[] | null>(null);
  const [methodId, setMethodId] = useState('');
  const [f, setF] = useState({ name: '', email: '', phone: '', line1: '', city: '', zip: '', province: '' });
  const [terms, setTerms] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const method = methods?.find((m) => m.id === methodId);
  const delivery = method?.kind === 'delivery';
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => { setReady(true); fetch('/api/shipping').then((r) => r.json()).then((m: Method[]) => { setMethods(m); if (m.length === 1) setMethodId(m[0].id); }).catch(() => setMethods([])); }, []);

  useEffect(() => {
    if (!ready || !lines.length || !methodId) { setQuote(null); return; }
    let live = true;
    const couponCode = sessionStorage.getItem(couponKey) ?? undefined;
    fetchQuote(lines, { couponCode, shippingMethodId: methodId, dest: delivery ? { province: f.province.slice(0, 2), zip: f.zip } : undefined })
      .then((q) => { if (live) { setQuote(q); setError(''); } })
      .catch((e: Error) => { if (live) { setQuote(null); setError(e.message); } });
    return () => { live = false; };
  }, [lines, methodId, ready, delivery, f.province, f.zip]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: lines.map(({ itemId, variantId, quantity }) => ({ itemId, variantId, quantity })),
          couponCode: sessionStorage.getItem(couponKey) ?? undefined, shippingMethodId: methodId,
          customer: { name: f.name, email: f.email, phone: f.phone || undefined },
          shipping: delivery ? { line1: f.line1, city: f.city, zip: f.zip, province: f.province } : null,
          acceptTerms: terms,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Pagamento non avviato.');
      window.location.href = data.url; // pagina sicura di Stripe: i dati della carta non passano da qui
    } catch (err) {
      setError((err as Error).message); setBusy(false);
    }
  }

  if (!ready || methods === null) return <p className="text-ink-soft">Caricamento…</p>;
  if (!lines.length) return <p>Il carrello è vuoto. <a className="underline" href="/shop">Vai allo shop</a></p>;
  if (methods.length === 0) return <p role="alert" className="rounded-lg bg-crema p-4">Le consegne non sono ancora configurate. Contattaci per completare l’ordine.</p>;

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_22rem]" noValidate={false}>
      <div className="grid gap-6">
        <fieldset className="grid gap-3 rounded-[var(--radius-card)] bg-white p-5">
          <legend className="font-display text-xl px-1">Consegna</legend>
          {methods.map((m) => (
            <label key={m.id} className="flex items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-bordeaux-600 has-[:checked]:bg-bordeaux-50">
              <input type="radio" name="method" className="mt-1" checked={methodId === m.id} onChange={() => setMethodId(m.id)} required />
              <span><strong>{m.name}</strong>{m.kind === 'delivery' ? ` · ${euro(m.priceCents)}` : ' · gratis'}{m.freeOverCents ? ` (gratis sopra ${euro(m.freeOverCents)})` : ''}
                {m.etaText && <span className="block text-sm text-ink-soft">{m.etaText}</span>}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="grid gap-3 rounded-[var(--radius-card)] bg-white p-5 sm:grid-cols-2">
          <legend className="font-display text-xl px-1">I tuoi dati</legend>
          <label className="grid gap-1 text-sm font-medium">Nome e cognome<input className={input} value={f.name} onChange={set('name')} required minLength={2} autoComplete="name" /></label>
          <label className="grid gap-1 text-sm font-medium">Email<input className={input} type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></label>
          <label className="grid gap-1 text-sm font-medium sm:col-span-2">Telefono (utile per la consegna)<input className={input} type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" /></label>
        </fieldset>

        {delivery && (
          <fieldset className="grid gap-3 rounded-[var(--radius-card)] bg-white p-5 sm:grid-cols-6">
            <legend className="font-display text-xl px-1">Indirizzo di consegna</legend>
            <label className="grid gap-1 text-sm font-medium sm:col-span-6">Via e numero civico<input className={input} value={f.line1} onChange={set('line1')} required minLength={3} autoComplete="address-line1" /></label>
            <label className="grid gap-1 text-sm font-medium sm:col-span-3">Città<input className={input} value={f.city} onChange={set('city')} required autoComplete="address-level2" /></label>
            <label className="grid gap-1 text-sm font-medium sm:col-span-2">CAP<input className={input} value={f.zip} onChange={set('zip')} required pattern="\d{5}" inputMode="numeric" autoComplete="postal-code" /></label>
            <label className="grid gap-1 text-sm font-medium">Prov.<input className={input} value={f.province} onChange={set('province')} required maxLength={2} pattern="[A-Za-z]{2}" autoComplete="address-level1" /></label>
          </fieldset>
        )}

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
          <span>Ho letto e accetto i <a className="underline" href="/termini" target="_blank">termini e condizioni</a> e la <a className="underline" href="/privacy" target="_blank">privacy policy</a>.</span>
        </label>
      </div>

      <aside className="h-fit grid gap-3 rounded-[var(--radius-card)] bg-white p-5" aria-label="Riepilogo ordine">
        <h2 className="text-xl">Il tuo ordine</h2>
        {quote ? (
          <dl className="grid gap-1 text-sm">
            <div className="flex justify-between"><dt>Subtotale</dt><dd>{euro(quote.subtotalCents)}</dd></div>
            {quote.discountCents > 0 && <div className="flex justify-between text-green-700"><dt>Sconto</dt><dd>−{euro(quote.discountCents)}</dd></div>}
            <div className="flex justify-between"><dt>Spedizione</dt><dd>{quote.shippingCents ? euro(quote.shippingCents) : 'gratis'}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 font-display text-lg"><dt>Totale</dt><dd>{euro(quote.totalCents)}</dd></div>
          </dl>
        ) : <p className="text-sm text-ink-soft">Scegli la consegna per vedere il totale.</p>}
        {quote?.hasVariableWeight && <p className="text-xs text-ink-soft">Prodotti a peso variabile: ti verrà addebitato il peso reale, mai oltre {euro(quote.totalCents)}.</p>}
        {error && <p role="alert" className="rounded-lg bg-bordeaux-50 p-3 text-sm text-bordeaux-700">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !quote}>{busy ? 'Un attimo…' : 'Paga in sicurezza'}</button>
        <p className="text-xs text-ink-soft">Il pagamento avviene su Stripe: non vediamo né salviamo i dati della tua carta.</p>
      </aside>
    </form>
  );
}
