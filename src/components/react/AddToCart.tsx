import { useMemo, useState } from 'react';
import { cart, euro } from './cartStore';

interface Variant { id: string; label: string; weightGrams: number | null; priceCents: number | null; stockQty: number }
interface Props {
  itemId: string; name: string; sellUnit: 'piece' | 'kg' | 'fixed_weight' | 'pack';
  priceCents: number; stepGrams: number; stockQty: number; variants: Variant[]; variableWeight: boolean;
}

/** Il prezzo mostrato qui è indicativo: il totale vero viene sempre ricalcolato dal server. */
export default function AddToCart({ itemId, name, sellUnit, priceCents, stepGrams, stockQty, variants, variableWeight }: Props) {
  const kg = sellUnit === 'kg';
  const usable = useMemo(() => variants.filter((v) => (kg ? v.weightGrams && v.weightGrams <= stockQty : v.stockQty > 0)), [variants, kg, stockQty]);
  const [variantId, setVariantId] = useState<string>(usable[0]?.id ?? '');
  const hasVariants = variants.length > 0;
  const variant = usable.find((v) => v.id === variantId) ?? null;
  const [qty, setQty] = useState(kg && !hasVariants ? Math.max(stepGrams, 100) : 1);
  const [added, setAdded] = useState(false);

  const free = kg && !hasVariants;
  const max = free ? stockQty : variant ? (kg ? Math.floor(stockQty / (variant.weightGrams ?? 1)) : variant.stockQty) : stockQty;
  const unit = free ? 0 : variant ? (variant.priceCents ?? (kg ? Math.round((priceCents * (variant.weightGrams ?? 0)) / 1000) : priceCents)) : priceCents;
  const total = free ? Math.round((priceCents * qty) / 1000) : unit * qty;
  const step = free ? stepGrams : 1;
  const disabled = max < (free ? step : 1) || (hasVariants && !variant);

  function add() {
    cart.add({ itemId, variantId: variant?.id ?? null, quantity: qty, label: variant ? `${name} · ${variant.label}` : name });
    setAdded(true);
    setTimeout(() => setAdded(false), 4000);
  }

  if (disabled) return <p className="rounded-lg bg-crema p-4 font-medium">Momentaneamente non disponibile.</p>;

  return (
    <div className="grid gap-4">
      {hasVariants && (
        <label className="grid gap-1 text-sm font-medium">Formato
          <select className="min-h-11 rounded-lg border border-line bg-white px-3 font-normal" value={variantId} onChange={(e) => { setVariantId(e.target.value); setQty(1); }}>
            {usable.map((v) => <option key={v.id} value={v.id}>{v.label}{v.weightGrams && !/\d/.test(v.label) ? ` · ${v.weightGrams} g` : ''}</option>)}
          </select>
        </label>
      )}
      <div className="grid gap-1 text-sm font-medium">
        <span id="qty-l">{free ? 'Peso' : 'Quantità'}</span>
        <div className="flex items-center gap-2" role="group" aria-labelledby="qty-l">
          <button type="button" className="btn btn-ghost !px-4" aria-label="Diminuisci" onClick={() => setQty((q) => Math.max(step, q - step))}>−</button>
          <output className="min-w-20 text-center text-lg font-semibold" aria-live="polite">{free ? (qty >= 1000 ? `${(qty / 1000).toLocaleString('it-IT')} kg` : `${qty} g`) : qty}</output>
          <button type="button" className="btn btn-ghost !px-4" aria-label="Aumenta" onClick={() => setQty((q) => Math.min(max, q + step))}>+</button>
        </div>
        {max <= 10 * step && <span className="text-xs text-bordeaux-700 font-normal">Ultimi disponibili</span>}
      </div>
      <p className="font-display text-2xl">{euro(total)}</p>
      {variableWeight && <p className="text-sm text-ink-soft">Il peso reale può variare leggermente: ti addebitiamo solo il peso effettivo, mai più dell’importo autorizzato.</p>}
      <button type="button" className="btn btn-primary" onClick={add}>Aggiungi al carrello</button>
      <p role="status" className="min-h-6 text-sm">{added && <>Aggiunto! <a className="underline text-bordeaux-700" href="/carrello">Vai al carrello</a></>}</p>
    </div>
  );
}
