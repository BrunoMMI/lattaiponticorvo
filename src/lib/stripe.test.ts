import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import * as schema from '../db/schema';
import { createPendingOrder, quoteCart, type Db } from './orders';
import { handleStripeEvent } from './stripe';

let db: Db;
const addr = { line1: 'Via Roma 1', city: 'Caserta', zip: '81100', province: 'CE' };
const ev = (id: string, type: string, object: object) => ({ id, type, data: { object } }) as unknown as Stripe.Event;

async function orderWith(opts: { variable?: boolean; session: string }) {
  const [it] = await db.insert(schema.items).values({ name: 'P', slug: `p-${opts.session}`, inShop: true, published: true, priceCents: 1000, stockQty: 5, variableWeight: !!opts.variable }).returning();
  const o = await createPendingOrder(db, await quoteCart(db, [{ itemId: it.id, quantity: 2 }]), { email: 'a@a.it', name: 'A' }, addr, null);
  await db.update(schema.orders).set({ stripeSessionId: opts.session }).where(eq(schema.orders.id, o.id));
  return { it, o };
}
const status = async () => (await db.select().from(schema.orders))[0];

beforeEach(async () => {
  const d = drizzle(new PGlite(), { schema });
  await migrate(d, { migrationsFolder: './drizzle' });
  db = d as unknown as Db;
});

describe('webhook Stripe', () => {
  it('la firma errata viene rifiutata, quella corretta accettata', () => {
    const stripe = new Stripe('sk_test_x');
    const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'x', data: { object: {} } });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' });
    expect(stripe.webhooks.constructEvent(payload, header, 'whsec_test').id).toBe('evt_1');
    expect(() => stripe.webhooks.constructEvent(payload + ' ', header, 'whsec_test')).toThrow();
    expect(() => stripe.webhooks.constructEvent(payload, header, 'whsec_altro')).toThrow();
  });

  it('checkout.session.completed segna pagato; lo stesso evento ripetuto è ignorato', async () => {
    await orderWith({ session: 'cs_a' });
    const e = ev('evt_a', 'checkout.session.completed', { id: 'cs_a', payment_status: 'paid', payment_intent: 'pi_a', amount_total: 2000 });
    expect(await handleStripeEvent(db, e)).toBe('processed');
    expect(await handleStripeEvent(db, e)).toBe('duplicate');
    expect(await status()).toMatchObject({ status: 'paid', paymentStatus: 'succeeded', stripePaymentIntentId: 'pi_a' });
    expect(await db.select().from(schema.payments)).toHaveLength(1);
  });

  it('pagamento differito non ancora incassato: l’ordine resta in attesa', async () => {
    await orderWith({ session: 'cs_b' });
    await handleStripeEvent(db, ev('evt_b1', 'checkout.session.completed', { id: 'cs_b', payment_status: 'unpaid', payment_intent: 'pi_b', amount_total: 2000 }));
    expect((await status()).status).toBe('pending');
    await handleStripeEvent(db, ev('evt_b2', 'checkout.session.async_payment_succeeded', { id: 'cs_b', payment_status: 'paid', payment_intent: 'pi_b', amount_total: 2000 }));
    expect((await status()).status).toBe('paid');
  });

  it('peso variabile: unpaid + capture manuale = autorizzato', async () => {
    await orderWith({ session: 'cs_c', variable: true });
    await handleStripeEvent(db, ev('evt_c', 'checkout.session.completed', { id: 'cs_c', payment_status: 'unpaid', payment_intent: 'pi_c', amount_total: 2000 }));
    expect(await status()).toMatchObject({ status: 'paid', paymentStatus: 'authorized' });
  });

  it('sessione scaduta: annulla e ripristina il magazzino', async () => {
    const { it } = await orderWith({ session: 'cs_d' });
    expect((await db.select().from(schema.items).where(eq(schema.items.id, it.id)))[0].stockQty).toBe(3);
    await handleStripeEvent(db, ev('evt_d', 'checkout.session.expired', { id: 'cs_d' }));
    expect(await status()).toMatchObject({ status: 'cancelled' });
    expect((await db.select().from(schema.items).where(eq(schema.items.id, it.id)))[0].stockQty).toBe(5);
  });

  it('rimborso totale e parziale', async () => {
    await orderWith({ session: 'cs_e' });
    await handleStripeEvent(db, ev('evt_e1', 'checkout.session.completed', { id: 'cs_e', payment_status: 'paid', payment_intent: 'pi_e', amount_total: 2000 }));
    await handleStripeEvent(db, ev('evt_e2', 'charge.refunded', { payment_intent: 'pi_e', amount: 2000, amount_refunded: 500 }));
    expect((await status()).paymentStatus).toBe('partially_refunded');
    await handleStripeEvent(db, ev('evt_e3', 'charge.refunded', { payment_intent: 'pi_e', amount: 2000, amount_refunded: 2000 }));
    expect(await status()).toMatchObject({ paymentStatus: 'refunded', status: 'refunded' });
  });
});
