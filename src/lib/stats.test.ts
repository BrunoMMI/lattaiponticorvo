import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../db/schema';
import type { Db } from './orders';
import { fillDays, getStats, totals } from './stats';

let db: Db;
const d = (s: string) => new Date(s);

beforeAll(async () => {
  const x = drizzle(new PGlite(), { schema });
  await migrate(x, { migrationsFolder: './drizzle' });
  db = x as unknown as Db;
  const [cat] = await db.insert(schema.categories).values({ scope: 'shop', name: 'Mozzarelle', slug: 'mozzarelle' }).returning();
  const [a] = await db.insert(schema.items).values({ name: 'Mozzarella', slug: 'm', inShop: true, published: true, priceCents: 1000, shopCategoryId: cat.id, stockQty: 1, lowStockThreshold: 3 }).returning();
  const [c1] = await db.insert(schema.customers).values({ email: 'old@x.it', name: 'Vecchio' }).returning();
  const [c2] = await db.insert(schema.customers).values({ email: 'new@x.it', name: 'Nuovo' }).returning();

  const mk = async (cust: typeof c1, at: string, total: number, status: typeof schema.orders.$inferInsert['status']) => {
    const [o] = await db.insert(schema.orders).values({ customerId: cust.id, email: cust.email, status, subtotalCents: total, totalCents: total, createdAt: d(at) }).returning();
    await db.insert(schema.orderLines).values({ orderId: o.id, itemId: a.id, nameSnapshot: 'Mozzarella', unitPriceCents: 1000, vatRate: '4.00', quantity: total / 1000, lineTotalCents: total });
    return o;
  };
  await mk(c1, '2026-09-01T10:00:00Z', 5000, 'delivered');           // prima del periodo → rende c1 "ricorrente"
  const o1 = await mk(c1, '2026-10-02T10:00:00Z', 3000, 'paid');     // nel periodo
  await mk(c2, '2026-10-02T21:30:00Z', 2000, 'shipped');             // 23:30 a Roma: stesso giorno
  await mk(c2, '2026-10-03T10:00:00Z', 9000, 'cancelled');           // esclusi
  await mk(c2, '2026-10-04T10:00:00Z', 4000, 'pending');             // esclusi
  const [pay] = await db.insert(schema.payments).values({ orderId: o1.id, providerRef: 'pi_1', amountCents: 3000, status: 'succeeded' }).returning();
  await db.insert(schema.refunds).values({ paymentId: pay.id, amountCents: 500 });
});

const P = { from: d('2026-10-01T00:00:00Z'), to: d('2026-10-08T00:00:00Z') };

describe('statistiche', () => {
  it('conta solo gli ordini venduti e sottrae i rimborsi parziali', async () => {
    expect(await totals(db, P)).toEqual({ revenueCents: 3000 + 2000 - 500, orders: 2, avgCents: 2250, refundedCents: 500 });
  });
  it('raggruppa per giorno (fuso Roma) e riempie i giorni vuoti', async () => {
    const s = await getStats(db, P);
    expect(s.daily).toEqual([{ day: '2026-10-02', revenueCents: 5000, orders: 2 }]);
    const filled = fillDays(s.daily, P);
    expect(filled).toHaveLength(7);
    expect(filled.find((x) => x.day === '2026-10-02')!.orders).toBe(2);
    expect(filled.find((x) => x.day === '2026-10-05')!.revenueCents).toBe(0);
  });
  it('distingue clienti nuovi e ricorrenti', async () => {
    expect((await getStats(db, P)).customers).toEqual({ total: 2, returning: 1, new: 1 });
  });
  it('classifica prodotti e categorie, segnala scorte basse e conta gli stati', async () => {
    const s = await getStats(db, P);
    expect(s.top[0]).toMatchObject({ name: 'Mozzarella', revenueCents: 5000 });
    expect(s.byCategory[0]).toMatchObject({ name: 'Mozzarelle', revenueCents: 5000 });
    expect(s.lowStock.map((l) => l.name)).toEqual(['Mozzarella']);
    expect(s.status).toMatchObject({ paid: 1, shipped: 1, cancelled: 1, pending: 1 });
  });
  it('periodo senza vendite: tutto a zero, nessun errore', async () => {
    const s = await getStats(db, { from: d('2025-01-01T00:00:00Z'), to: d('2025-02-01T00:00:00Z') });
    expect(s.main).toEqual({ revenueCents: 0, orders: 0, avgCents: 0, refundedCents: 0 });
    expect(s.customers).toEqual({ total: 0, returning: 0, new: 0 });
  });
});
