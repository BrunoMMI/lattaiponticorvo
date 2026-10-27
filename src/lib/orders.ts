import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { schema } from '../db';
import { couponDiscount, priceLine, PricingError, shippingCost, type CartInput, type PricedLine } from './pricing';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
const { items, itemVariants, orders, orderLines, stockMovements, coupons, shippingMethods, customers, payments } = schema;

export interface Quote {
  lines: (PricedLine & { categoryId: string | null })[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  couponCode: string | null;
  shippingMethodId: string | null;
  hasVariableWeight: boolean;
}

/** Ricalcola TUTTO dal database: il client invia solo cosa vuole comprare, mai prezzi. */
export async function quoteCart(
  db: Db,
  cart: CartInput[],
  opts: { couponCode?: string; shippingMethodId?: string; dest?: { province?: string; zip?: string } } = {},
): Promise<Quote> {
  if (!cart.length) throw new PricingError('Il carrello è vuoto.', 'invalid');
  const ids = [...new Set(cart.map((c) => c.itemId))];
  const found = await db.select().from(items).where(and(inArray(items.id, ids), eq(items.inShop, true), eq(items.published, true), isNull(items.archivedAt)));
  const variants = await db.select().from(itemVariants).where(inArray(itemVariants.itemId, ids));

  const lines: Quote['lines'] = [];
  for (const c of cart) {
    const item = found.find((i) => i.id === c.itemId);
    if (!item) throw new PricingError('Un prodotto nel carrello non è più disponibile.', 'unavailable');
    const variant = c.variantId ? variants.find((v) => v.id === c.variantId && v.itemId === item.id) ?? null : null;
    if (c.variantId && !variant) throw new PricingError(`Il formato scelto per "${item.name}" non è più disponibile.`, 'unavailable');
    const line = priceLine(item, variant, c);
    // stessa riga ripetuta (stesso prodotto+formato): si unisce
    const dup = lines.find((l) => l.itemId === line.itemId && l.variantId === line.variantId);
    if (dup) {
      const merged = priceLine(item, variant, { ...c, quantity: dup.quantity + line.quantity });
      Object.assign(dup, merged);
    } else lines.push({ ...line, categoryId: item.shopCategoryId });
  }
  for (const l of lines) {
    if (l.stockUnits > (l.stockSource === 'variant' ? variants.find((v) => v.id === l.variantId)!.stockQty : found.find((i) => i.id === l.itemId)!.stockQty)) {
      throw new PricingError(`"${l.name}" non è disponibile nella quantità richiesta.`, 'out_of_stock');
    }
  }

  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);

  let discountCents = 0, couponCode: string | null = null;
  if (opts.couponCode?.trim()) {
    const [c] = await db.select().from(coupons).where(sql`upper(${coupons.code}) = ${opts.couponCode.trim().toUpperCase()}`);
    if (!c) throw new PricingError('Codice sconto non valido.', 'invalid');
    discountCents = couponDiscount(c, lines);
    couponCode = c.code;
  }

  let shippingCents = 0, shippingMethodId: string | null = null;
  if (opts.shippingMethodId) {
    const [m] = await db.select().from(shippingMethods).where(and(eq(shippingMethods.id, opts.shippingMethodId), eq(shippingMethods.active, true)));
    if (!m) throw new PricingError('Metodo di consegna non disponibile.', 'unavailable');
    shippingCents = shippingCost({ kind: m.kind as 'pickup' | 'delivery', priceCents: m.priceCents, freeOverCents: m.freeOverCents, zones: m.zones }, subtotalCents - discountCents, opts.dest);
    shippingMethodId = m.id;
  }

  return {
    lines, subtotalCents, discountCents, shippingCents, couponCode, shippingMethodId,
    totalCents: subtotalCents - discountCents + shippingCents,
    hasVariableWeight: lines.some((l) => l.variableWeight),
  };
}

export interface CustomerInput { email: string; name: string; phone?: string }
export interface AddressInput { line1: string; city: string; zip: string; province: string; country?: string }

/** Crea l'ordine "pending" e RISERVA le scorte in un'unica transazione: o tutto o niente. */
export async function createPendingOrder(db: Db, quote: Quote, customer: CustomerInput, shipping: AddressInput | null, billing: AddressInput | null) {
  return db.transaction(async (tx) => {
    const email = customer.email.trim().toLowerCase();
    const [existing] = await tx.select().from(customers).where(sql`lower(${customers.email}) = ${email}`);
    const cust = existing ?? (await tx.insert(customers).values({ email, name: customer.name, phone: customer.phone }).returning())[0];

    const [order] = await tx.insert(orders).values({
      customerId: cust.id, email, subtotalCents: quote.subtotalCents, discountCents: quote.discountCents,
      shippingCents: quote.shippingCents, totalCents: quote.totalCents, couponCode: quote.couponCode,
      authorizedCents: quote.hasVariableWeight ? quote.totalCents : null,
      shippingMethodId: quote.shippingMethodId, shippingAddress: shipping, billingAddress: billing ?? shipping,
    }).returning();

    for (const l of quote.lines) {
      // UPDATE condizionale: due clienti contemporanei non possono mai portare lo stock sotto zero.
      const dec = l.stockSource === 'variant'
        ? await tx.update(itemVariants).set({ stockQty: sql`${itemVariants.stockQty} - ${l.stockUnits}` }).where(and(eq(itemVariants.id, l.variantId!), sql`${itemVariants.stockQty} >= ${l.stockUnits}`)).returning({ id: itemVariants.id })
        : await tx.update(items).set({ stockQty: sql`${items.stockQty} - ${l.stockUnits}` }).where(and(eq(items.id, l.itemId), sql`${items.stockQty} >= ${l.stockUnits}`)).returning({ id: items.id });
      if (!dec.length) throw new PricingError(`"${l.name}" è appena stato venduto: non è più disponibile nella quantità richiesta.`, 'out_of_stock');
      await tx.insert(stockMovements).values({ itemId: l.itemId, variantId: l.variantId, delta: -l.stockUnits, reason: 'sale', orderId: order.id });
      await tx.insert(orderLines).values({
        orderId: order.id, itemId: l.itemId, variantId: l.variantId, nameSnapshot: l.name, unitPriceCents: l.unitPriceCents,
        vatRate: l.vatRate, quantity: l.quantity, weightGrams: l.weightGrams, lineTotalCents: l.lineTotalCents, stockUnits: l.stockUnits,
      });
    }

    if (quote.couponCode) {
      const used = await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` })
        .where(and(sql`upper(${coupons.code}) = ${quote.couponCode.toUpperCase()}`, sql`(${coupons.maxUses} is null or ${coupons.usedCount} < ${coupons.maxUses})`)).returning({ id: coupons.id });
      if (!used.length) throw new PricingError('Codice sconto esaurito.', 'invalid');
    }
    return order;
  });
}

/** Annulla un ordine NON pagato e rimette in magazzino ciò che era stato riservato. Idempotente. */
export async function cancelAndRestock(db: Db, orderId: string, userId: string | null = null, reason = 'Ordine non completato') {
  return db.transaction(async (tx) => {
    const [o] = await tx.update(orders).set({ status: 'cancelled', paymentStatus: 'failed', updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'pending'))).returning();
    if (!o) return false; // già pagato, annullato o inesistente: niente da ripristinare
    await restock(tx as unknown as Db, orderId, userId, reason);
    if (o.couponCode) await tx.update(coupons).set({ usedCount: sql`greatest(${coupons.usedCount} - 1, 0)` }).where(sql`upper(${coupons.code}) = ${o.couponCode.toUpperCase()}`);
    return true;
  });
}

async function restock(tx: Db, orderId: string, userId: string | null, note: string) {
  const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, orderId));
  for (const l of lines) {
    if (!l.itemId || l.stockUnits <= 0) continue;
    const [it] = await tx.select({ sellUnit: items.sellUnit }).from(items).where(eq(items.id, l.itemId));
    const fromVariant = l.variantId && it?.sellUnit !== 'kg';
    if (fromVariant) await tx.update(itemVariants).set({ stockQty: sql`${itemVariants.stockQty} + ${l.stockUnits}` }).where(eq(itemVariants.id, l.variantId!));
    else await tx.update(items).set({ stockQty: sql`${items.stockQty} + ${l.stockUnits}` }).where(eq(items.id, l.itemId));
    await tx.insert(stockMovements).values({ itemId: l.itemId, variantId: l.variantId, delta: l.stockUnits, reason: 'refund', orderId, userId, note });
  }
}

/** Annullamento/rimborso gestito dall'admin su un ordine già pagato: rimette a magazzino. */
export async function cancelPaidOrder(db: Db, orderId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [o] = await tx.update(orders).set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ['paid', 'preparing']))).returning();
    if (!o) return false;
    await restock(tx as unknown as Db, orderId, userId, 'Ordine annullato dall’amministratore');
    return true;
  });
}

/** Il pagamento è confermato (da webhook verificato). Idempotente: richiamarlo due volte non cambia nulla. */
export async function markPaid(db: Db, p: { sessionId: string; paymentIntentId: string | null; amountCents: number; authorizedOnly: boolean }) {
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.stripeSessionId, p.sessionId));
    if (!o) return null;
    if (o.status !== 'pending') {
      // ordine scaduto/annullato ma pagato comunque: va segnalato, non ignorato
      if (o.status === 'cancelled') await tx.update(orders).set({ internalNote: `${o.internalNote ?? ''}\n[ATTENZIONE] Pagamento ricevuto su ordine annullato: verificare/rimborsare.`.trim() }).where(eq(orders.id, o.id));
      return o;
    }
    const [updated] = await tx.update(orders).set({
      status: 'paid', paymentStatus: p.authorizedOnly ? 'authorized' : 'succeeded', stripePaymentIntentId: p.paymentIntentId, updatedAt: new Date(),
    }).where(and(eq(orders.id, o.id), eq(orders.status, 'pending'))).returning();
    if (p.paymentIntentId) {
      await tx.insert(payments).values({ orderId: o.id, provider: 'stripe', providerRef: p.paymentIntentId, amountCents: p.amountCents, status: p.authorizedOnly ? 'authorized' : 'succeeded' }).onConflictDoNothing();
    }
    return updated ?? o;
  });
}

export async function adjustStock(db: Db, a: { itemId: string; variantId?: string | null; delta: number; reason: 'load' | 'unload' | 'adjustment'; userId: string; note?: string }) {
  if (!Number.isInteger(a.delta) || a.delta === 0) throw new PricingError('Quantità non valida.', 'invalid');
  return db.transaction(async (tx) => {
    const res = a.variantId
      ? await tx.update(itemVariants).set({ stockQty: sql`${itemVariants.stockQty} + ${a.delta}` }).where(and(eq(itemVariants.id, a.variantId), sql`${itemVariants.stockQty} + ${a.delta} >= 0`)).returning({ id: itemVariants.id })
      : await tx.update(items).set({ stockQty: sql`${items.stockQty} + ${a.delta}`, updatedAt: new Date() }).where(and(eq(items.id, a.itemId), sql`${items.stockQty} + ${a.delta} >= 0`)).returning({ id: items.id });
    if (!res.length) throw new PricingError('Giacenza insufficiente per questo scarico.', 'out_of_stock');
    await tx.insert(stockMovements).values({ itemId: a.itemId, variantId: a.variantId ?? null, delta: a.delta, reason: a.reason, userId: a.userId, note: a.note });
  });
}
