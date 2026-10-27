/** Calcolo prezzi dello shop. Funzioni pure: tutti gli importi sono in centesimi interi, IVA inclusa. */

export type SellUnit = 'piece' | 'kg' | 'fixed_weight' | 'pack';

export interface PricedItem {
  id: string;
  name: string;
  sellUnit: SellUnit;
  priceCents: number | null; // per pezzo/confezione, oppure €/kg se sellUnit = 'kg'
  salePriceCents: number | null;
  vatRate: string;
  variableWeight: boolean;
  weightStepGrams: number;
  stockQty: number; // pezzi, oppure grammi se sellUnit = 'kg'
  shopCategoryId: string | null;
}

export interface PricedVariant {
  id: string;
  label: string;
  weightGrams: number | null;
  priceCents: number | null;
  stockQty: number;
}

export interface CartInput {
  itemId: string;
  variantId?: string | null;
  /** Pezzi/confezioni; per i prodotti al kg SENZA variante: grammi. */
  quantity: number;
}

export interface PricedLine {
  itemId: string;
  variantId: string | null;
  name: string;
  quantity: number;
  weightGrams: number | null; // grammi totali richiesti, se noti
  unitPriceCents: number;
  lineTotalCents: number;
  vatRate: string;
  stockUnits: number; // da scalare dal magazzino
  stockSource: 'item' | 'variant';
  available: number; // disponibilità attuale nella stessa unità di quantity
  variableWeight: boolean;
}

export class PricingError extends Error {
  constructor(message: string, readonly code: 'unavailable' | 'invalid' | 'out_of_stock') {
    super(message);
  }
}

export const unitPrice = (it: Pick<PricedItem, 'priceCents' | 'salePriceCents'>) => it.salePriceCents ?? it.priceCents;

export function priceLine(item: PricedItem, variant: PricedVariant | null, input: CartInput): PricedLine {
  const base = unitPrice(item);
  if (base == null || base < 0) throw new PricingError(`"${item.name}" non è acquistabile online.`, 'unavailable');
  if (!Number.isInteger(input.quantity) || input.quantity <= 0 || input.quantity > 100_000) {
    throw new PricingError('Quantità non valida.', 'invalid');
  }
  const name = variant ? `${item.name} · ${variant.label}` : item.name;
  const common = { itemId: item.id, variantId: variant?.id ?? null, name, vatRate: item.vatRate, variableWeight: item.variableWeight };

  if (item.sellUnit === 'kg') {
    if (variant) {
      if (!variant.weightGrams) throw new PricingError('Formato non valido.', 'invalid');
      const unit = variant.priceCents ?? Math.round((base * variant.weightGrams) / 1000);
      return { ...common, quantity: input.quantity, weightGrams: variant.weightGrams * input.quantity, unitPriceCents: unit, lineTotalCents: unit * input.quantity, stockUnits: variant.weightGrams * input.quantity, stockSource: 'item', available: Math.floor(item.stockQty / variant.weightGrams) };
    }
    const g = input.quantity;
    if (g % item.weightStepGrams !== 0) throw new PricingError(`Il peso deve essere multiplo di ${item.weightStepGrams} g.`, 'invalid');
    return { ...common, quantity: g, weightGrams: g, unitPriceCents: base, lineTotalCents: Math.round((base * g) / 1000), stockUnits: g, stockSource: 'item', available: item.stockQty };
  }

  // pezzo, confezione, peso fisso: il prezzo è per unità; la variante può avere un prezzo proprio
  const unit = variant?.priceCents ?? base;
  return {
    ...common, quantity: input.quantity, weightGrams: variant?.weightGrams ? variant.weightGrams * input.quantity : null,
    unitPriceCents: unit, lineTotalCents: unit * input.quantity, stockUnits: input.quantity,
    stockSource: variant ? 'variant' : 'item', available: variant ? variant.stockQty : item.stockQty,
  };
}

export interface CouponInput {
  code: string; percentOff: number | null; amountOffCents: number | null; categoryId: string | null;
  startsAt: Date | null; endsAt: Date | null; maxUses: number | null; usedCount: number; active: boolean;
}

/** Restituisce lo sconto in centesimi, oppure lancia PricingError con un messaggio comprensibile. */
export function couponDiscount(c: CouponInput, lines: (PricedLine & { categoryId: string | null })[], now = new Date()): number {
  if (!c.active || (c.startsAt && now < c.startsAt) || (c.endsAt && now > c.endsAt)) throw new PricingError('Codice sconto non valido o scaduto.', 'invalid');
  if (c.maxUses != null && c.usedCount >= c.maxUses) throw new PricingError('Codice sconto esaurito.', 'invalid');
  const eligible = lines.filter((l) => !c.categoryId || l.categoryId === c.categoryId).reduce((s, l) => s + l.lineTotalCents, 0);
  if (eligible === 0) throw new PricingError('Il codice non si applica ai prodotti nel carrello.', 'invalid');
  const raw = c.percentOff ? Math.round((eligible * c.percentOff) / 100) : (c.amountOffCents ?? 0);
  return Math.min(raw, eligible);
}

export interface ShippingRule {
  kind: 'pickup' | 'delivery'; priceCents: number; freeOverCents: number | null; zones: string[];
}

/** Costo di spedizione dopo gli sconti. Le zone sono province (es. "CE") o CAP; vuoto = ovunque. */
export function shippingCost(rule: ShippingRule, subtotalAfterDiscountCents: number, dest?: { province?: string; zip?: string }): number {
  if (rule.kind === 'pickup') return 0;
  if (rule.zones.length) {
    const prov = dest?.province?.trim().toUpperCase(), zip = dest?.zip?.trim();
    const ok = rule.zones.some((z) => z.toUpperCase() === prov || (zip && zip.startsWith(z)));
    if (!ok) throw new PricingError('Questo metodo di consegna non è disponibile per il tuo indirizzo.', 'unavailable');
  }
  if (rule.freeOverCents != null && subtotalAfterDiscountCents >= rule.freeOverCents) return 0;
  return rule.priceCents;
}

export const euro = (cents: number) => (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

export interface WeighedLine { id: string; weightGrams: number | null; lineTotalCents: number }

/**
 * Peso reale confermato: ricalcola le righe a prezzo proporzionale al peso richiesto.
 * Il €/kg si ricava dalla riga ordinata (totale ÷ peso richiesto), quindi vale anche per formati/varianti.
 * Lancia se il nuovo totale supera l'importo autorizzato dal cliente: non si addebita mai di più.
 */
export function applyActualWeights(
  lines: WeighedLine[], actual: Record<string, number>,
  order: { discountCents: number; shippingCents: number; authorizedCents: number },
) {
  const out = lines.map((l) => {
    const g = actual[l.id];
    if (g == null) return { id: l.id, lineTotalCents: l.lineTotalCents, actualWeightGrams: null as number | null };
    if (!l.weightGrams) throw new PricingError('Questa riga non ha un peso da confermare.', 'invalid');
    if (!Number.isInteger(g) || g <= 0) throw new PricingError('Peso reale non valido.', 'invalid');
    return { id: l.id, lineTotalCents: Math.round((l.lineTotalCents * g) / l.weightGrams), actualWeightGrams: g };
  });
  const subtotal = out.reduce((s, l) => s + l.lineTotalCents, 0);
  const total = Math.max(subtotal - order.discountCents, 0) + order.shippingCents;
  if (total > order.authorizedCents) {
    throw new PricingError(`Il totale reale (${euro(total)}) supera l\u2019importo autorizzato dal cliente (${euro(order.authorizedCents)}): non può essere addebitato.`, 'invalid');
  }
  return { lines: out, subtotalCents: subtotal, totalCents: total };
}
