import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { adjustStock, cancelAndRestock, cancelPaidOrder, createPendingOrder, markPaid, quoteCart, type Db } from './orders';

let db: Db;
let userId: string;
const cust = { email: 'Cliente@Example.com', name: 'Cliente' };
const addr = { line1: 'Via Roma 1', city: 'Caserta', zip: '81100', province: 'CE' };

async function stock(id: string) {
  return (await db.select().from(schema.items).where(eq(schema.items.id, id)))[0].stockQty;
}
async function newItem(v: Partial<typeof schema.items.$inferInsert> = {}) {
  const name = v.name ?? 'Prodotto';
  const [it] = await db.insert(schema.items).values({ name, slug: `${name}-${Math.random()}`, inShop: true, published: true, priceCents: 500, stockQty: 10, ...v }).returning();
  return it;
}

beforeEach(async () => {
  const pg = new PGlite();
  const d = drizzle(pg, { schema });
  await migrate(d, { migrationsFolder: './drizzle' });
  db = d as unknown as Db;
  [{ id: userId }] = await db.insert(schema.users).values({ email: 'a@a.it', name: 'A', passwordHash: 'x' }).returning();
});

describe('quoteCart', () => {
  it('ignora i prezzi dal client e rifiuta prodotti non pubblicati o fuori dallo shop', async () => {
    const hidden = await newItem({ published: false });
    const menuOnly = await newItem({ inShop: false, inMenu: true });
    await expect(quoteCart(db, [{ itemId: hidden.id, quantity: 1 }])).rejects.toThrow('non è più disponibile');
    await expect(quoteCart(db, [{ itemId: menuOnly.id, quantity: 1 }])).rejects.toThrow('non è più disponibile');
  });
  it('rifiuta quantità oltre la giacenza', async () => {
    const it = await newItem({ stockQty: 2 });
    await expect(quoteCart(db, [{ itemId: it.id, quantity: 3 }])).rejects.toThrow('non è disponibile nella quantità');
  });
  it('unisce righe duplicate e applica spedizione con soglia gratuita', async () => {
    const it = await newItem({ priceCents: 1000 });
    const [m] = await db.insert(schema.shippingMethods).values({ name: 'Corriere', kind: 'delivery', priceCents: 700, freeOverCents: 2500, active: true }).returning();
    const q = await quoteCart(db, [{ itemId: it.id, quantity: 1 }, { itemId: it.id, quantity: 2 }], { shippingMethodId: m.id });
    expect(q).toMatchObject({ subtotalCents: 3000, shippingCents: 0, totalCents: 3000 });
    expect(q.lines).toHaveLength(1);
  });
  it('non accetta metodi di consegna disattivati', async () => {
    const it = await newItem();
    const [m] = await db.insert(schema.shippingMethods).values({ name: 'Off', kind: 'delivery', priceCents: 1, active: false }).returning();
    await expect(quoteCart(db, [{ itemId: it.id, quantity: 1 }], { shippingMethodId: m.id })).rejects.toThrow('non disponibile');
  });
});

describe('createPendingOrder', () => {
  it('scala lo stock, registra il movimento e fotografa nome/prezzo', async () => {
    const it = await newItem({ name: 'Mozzarella', priceCents: 800, stockQty: 5 });
    const o = await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, quantity: 2 }]), cust, addr, null);
    expect(await stock(it.id)).toBe(3);
    const lines = await db.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, o.id));
    expect(lines[0]).toMatchObject({ nameSnapshot: 'Mozzarella', unitPriceCents: 800, lineTotalCents: 1600, stockUnits: 2 });
    const mv = await db.select().from(schema.stockMovements).where(eq(schema.stockMovements.orderId, o.id));
    expect(mv).toMatchObject([{ delta: -2, reason: 'sale' }]);
    // il prezzo nello storico non cambia se il prodotto viene modificato dopo
    await db.update(schema.items).set({ priceCents: 9999, name: 'Altro' }).where(eq(schema.items.id, it.id));
    expect((await db.select().from(schema.orderLines))[0]).toMatchObject({ unitPriceCents: 800, nameSnapshot: 'Mozzarella' });
  });

  it('due clienti sull’ultimo pezzo: ne vince uno solo, lo stock non va mai sotto zero', async () => {
    const it = await newItem({ stockQty: 1 });
    const q = await quoteCart(db, [{ itemId: it.id, quantity: 1 }]);
    const results = await Promise.allSettled([createPendingOrder(db, q, cust, addr, null), createPendingOrder(db, q, { ...cust, email: 'b@b.it' }, addr, null)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stock(it.id)).toBe(0);
    expect(await db.select().from(schema.orders)).toHaveLength(1); // la transazione fallita non lascia ordini orfani
  });

  it('prodotto al kg: scala i grammi', async () => {
    const it = await newItem({ sellUnit: 'kg', priceCents: 2000, stockQty: 3000, variableWeight: true });
    const o = await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, quantity: 700 }]), cust, addr, null);
    expect(await stock(it.id)).toBe(2300);
    expect(o).toMatchObject({ totalCents: 1400, authorizedCents: 1400 }); // peso variabile: tetto addebitabile = importo autorizzato
  });

  it('variante: scala lo stock della variante, non quello dell’articolo', async () => {
    const it = await newItem({ stockQty: 0 });
    const [v] = await db.insert(schema.itemVariants).values({ itemId: it.id, label: 'Box', priceCents: 1500, stockQty: 4 }).returning();
    await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, variantId: v.id, quantity: 3 }]), cust, addr, null);
    expect((await db.select().from(schema.itemVariants))[0].stockQty).toBe(1);
  });

  it('riusa il cliente con la stessa email (senza distinzione di maiuscole)', async () => {
    const it = await newItem();
    await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, quantity: 1 }]), cust, addr, null);
    await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, quantity: 1 }]), { ...cust, email: 'cliente@example.com' }, addr, null);
    expect(await db.select().from(schema.customers)).toHaveLength(1);
  });

  it('coupon: conta l’uso e rispetta il limite', async () => {
    const it = await newItem({ priceCents: 1000, stockQty: 10 });
    await db.insert(schema.coupons).values({ code: 'PRIMO10', percentOff: 10, maxUses: 1 });
    const q = await quoteCart(db, [{ itemId: it.id, quantity: 1 }], { couponCode: 'primo10' });
    expect(q.discountCents).toBe(100);
    await createPendingOrder(db, q, cust, addr, null);
    await expect(quoteCart(db, [{ itemId: it.id, quantity: 1 }], { couponCode: 'PRIMO10' })).rejects.toThrow('esaurito');
  });
});

describe('cancelAndRestock', () => {
  it('rimette in magazzino stock e coupon ed è idempotente', async () => {
    const it = await newItem({ priceCents: 1000, stockQty: 5 });
    await db.insert(schema.coupons).values({ code: 'C', percentOff: 10 });
    const o = await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, quantity: 2 }], { couponCode: 'C' }), cust, addr, null);
    expect(await stock(it.id)).toBe(3);
    expect(await cancelAndRestock(db, o.id)).toBe(true);
    expect(await cancelAndRestock(db, o.id)).toBe(false); // seconda volta: nessun doppio ripristino
    expect(await stock(it.id)).toBe(5);
    expect((await db.select().from(schema.coupons))[0].usedCount).toBe(0);
  });
  it('non tocca un ordine già pagato', async () => {
    const it = await newItem({ stockQty: 5 });
    const o = await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, quantity: 2 }]), cust, addr, null);
    await db.update(schema.orders).set({ stripeSessionId: 'cs_1' }).where(eq(schema.orders.id, o.id));
    await markPaid(db, { sessionId: 'cs_1', paymentIntentId: 'pi_1', amountCents: o.totalCents, authorizedOnly: false });
    expect(await cancelAndRestock(db, o.id)).toBe(false);
    expect(await stock(it.id)).toBe(3);
  });
  it('ripristina anche le varianti di un prodotto al kg sullo stock in grammi', async () => {
    const it = await newItem({ sellUnit: 'kg', priceCents: 2000, stockQty: 2000 });
    const [v] = await db.insert(schema.itemVariants).values({ itemId: it.id, label: '500 g', weightGrams: 500 }).returning();
    const o = await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, variantId: v.id, quantity: 2 }]), cust, addr, null);
    expect(await stock(it.id)).toBe(1000);
    await cancelAndRestock(db, o.id);
    expect(await stock(it.id)).toBe(2000);
  });
});

describe('markPaid', () => {
  it('è idempotente: un webhook ripetuto non duplica pagamenti', async () => {
    const it = await newItem();
    const o = await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, quantity: 1 }]), cust, addr, null);
    await db.update(schema.orders).set({ stripeSessionId: 'cs_2' }).where(eq(schema.orders.id, o.id));
    const p = { sessionId: 'cs_2', paymentIntentId: 'pi_2', amountCents: o.totalCents, authorizedOnly: false };
    await markPaid(db, p); await markPaid(db, p);
    expect(await db.select().from(schema.payments)).toHaveLength(1);
    expect((await db.select().from(schema.orders))[0]).toMatchObject({ status: 'paid', paymentStatus: 'succeeded' });
  });
  it('pagamento arrivato su un ordine già annullato: viene segnalato nelle note', async () => {
    const it = await newItem();
    const o = await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, quantity: 1 }]), cust, addr, null);
    await db.update(schema.orders).set({ stripeSessionId: 'cs_3' }).where(eq(schema.orders.id, o.id));
    await cancelAndRestock(db, o.id);
    await markPaid(db, { sessionId: 'cs_3', paymentIntentId: 'pi_3', amountCents: 500, authorizedOnly: false });
    expect((await db.select().from(schema.orders))[0].internalNote).toContain('ATTENZIONE');
  });
  it('autorizzazione senza addebito (peso variabile)', async () => {
    const it = await newItem({ variableWeight: true });
    const o = await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, quantity: 1 }]), cust, addr, null);
    await db.update(schema.orders).set({ stripeSessionId: 'cs_4' }).where(eq(schema.orders.id, o.id));
    await markPaid(db, { sessionId: 'cs_4', paymentIntentId: 'pi_4', amountCents: 500, authorizedOnly: true });
    expect((await db.select().from(schema.orders))[0]).toMatchObject({ status: 'paid', paymentStatus: 'authorized' });
  });
});

describe('cancelPaidOrder e adjustStock', () => {
  it('annullare un ordine pagato rimette a magazzino', async () => {
    const it = await newItem({ stockQty: 5 });
    const o = await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, quantity: 4 }]), cust, addr, null);
    await db.update(schema.orders).set({ status: 'paid' }).where(eq(schema.orders.id, o.id));
    expect(await cancelPaidOrder(db, o.id, userId)).toBe(true);
    expect(await cancelPaidOrder(db, o.id, userId)).toBe(false);
    expect(await stock(it.id)).toBe(5);
  });
  it('carico e scarico; lo scarico non può superare la giacenza', async () => {
    const it = await newItem({ stockQty: 2 });
    await adjustStock(db, { itemId: it.id, delta: 8, reason: 'load', userId, note: 'consegna' });
    expect(await stock(it.id)).toBe(10);
    await expect(adjustStock(db, { itemId: it.id, delta: -11, reason: 'unload', userId })).rejects.toThrow('Giacenza insufficiente');
    expect(await stock(it.id)).toBe(10);
    expect(await db.select().from(schema.stockMovements)).toHaveLength(1);
  });
});
