import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { createPendingOrder, quoteCart, type Db } from './orders';
import { anonymizeCustomer, exportCustomerData } from './gdpr';

let db: Db, custId: string, orderId: string;
beforeEach(async () => {
  const x = drizzle(new PGlite(), { schema });
  await migrate(x, { migrationsFolder: './drizzle' });
  db = x as unknown as Db;
  const [it] = await db.insert(schema.items).values({ name: 'Provola', slug: 'p', inShop: true, published: true, priceCents: 700, stockQty: 9 }).returning();
  const o = await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, quantity: 2 }]), { email: 'mario@example.com', name: 'Mario Rossi', phone: '333' }, { line1: 'Via Roma 1', city: 'Caserta', zip: '81100', province: 'CE' }, null);
  orderId = o.id; custId = o.customerId!;
  await db.update(schema.customers).set({ passwordHash: 'HASH-SEGRETO' }).where(eq(schema.customers.id, custId));
});

describe('GDPR', () => {
  it('l\u2019esportazione contiene profilo e ordini ma NON l\u2019hash della password', async () => {
    const data = await exportCustomerData(db, custId);
    expect(data!.profilo).toMatchObject({ email: 'mario@example.com', name: 'Mario Rossi' });
    expect(JSON.stringify(data)).not.toContain('HASH-SEGRETO');
    expect(data!.ordini).toHaveLength(1);
    expect(data!.ordini[0].righe[0]).toMatchObject({ prodotto: 'Provola', quantita: 2 });
  });
  it('l\u2019anonimizzazione rimuove i dati identificativi e conserva importi e righe', async () => {
    expect(await anonymizeCustomer(db, custId)).toBe(true);
    const [c] = await db.select().from(schema.customers);
    expect(c).toMatchObject({ name: '', phone: null, passwordHash: null });
    expect(c.email).toContain('anonimo.invalid');
    expect(c.deletedAt).not.toBeNull();
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    expect(o.email).toContain('anonimo.invalid'); expect(o.shippingAddress).toBeNull(); expect(o.totalCents).toBe(1400);
    expect(await db.select().from(schema.orderLines)).toHaveLength(1);
    expect(JSON.stringify(await db.select().from(schema.orders))).not.toContain('mario@example.com');
  });
  it('è idempotente e gestisce clienti inesistenti', async () => {
    expect(await anonymizeCustomer(db, custId)).toBe(true);
    expect(await anonymizeCustomer(db, custId)).toBe(false);
    expect(await anonymizeCustomer(db, '00000000-0000-0000-0000-000000000000')).toBe(false);
    expect(await exportCustomerData(db, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
