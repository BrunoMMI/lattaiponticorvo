import Stripe from 'stripe';
import { eq, sql } from 'drizzle-orm';
import { schema } from '../db';
import { cancelAndRestock, markPaid, type Db } from './orders';

const { orders, orderLines, webhookEvents, payments, refunds } = schema;

let client: Stripe | null | undefined;
/** null se STRIPE_SECRET_KEY non è configurata: il checkout risponde "pagamenti non attivi" invece di rompersi. */
export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY || import.meta.env?.STRIPE_SECRET_KEY;
  return (client = key ? new Stripe(key) : null);
}

export async function createCheckoutSession(stripe: Stripe, db: Db, orderId: string, siteUrl: string) {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId));
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = lines.map((l) => ({
    quantity: 1,
    price_data: { currency: 'eur', unit_amount: l.lineTotalCents, product_data: { name: l.weightGrams ? `${l.nameSnapshot} (${l.weightGrams} g)` : `${l.nameSnapshot} × ${l.quantity}` } },
  }));
  if (o.shippingCents > 0) line_items.push({ quantity: 1, price_data: { currency: 'eur', unit_amount: o.shippingCents, product_data: { name: 'Spedizione' } } });

  const discounts = o.discountCents > 0
    ? [{ coupon: (await stripe.coupons.create({ amount_off: o.discountCents, currency: 'eur', duration: 'once', name: o.couponCode ?? 'Sconto' }, { idempotencyKey: `coupon-${o.id}` })).id }]
    : undefined;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment', locale: 'it', customer_email: o.email, line_items, discounts,
    client_reference_id: o.id, metadata: { orderId: o.id, orderNumber: String(o.number) },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    success_url: `${siteUrl}/ordine/conferma?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/carrello`,
    // Prodotti a peso variabile: si autorizza l'importo massimo e si addebita solo il peso reale (capture manuale).
    payment_intent_data: o.authorizedCents != null ? { capture_method: 'manual', metadata: { orderId: o.id } } : { metadata: { orderId: o.id } },
  }, { idempotencyKey: `checkout-${o.id}` });

  await db.update(orders).set({ stripeSessionId: session.id }).where(eq(orders.id, o.id));
  return session;
}

/** Elabora un evento già VERIFICATO. Idempotente per id evento. */
export async function handleStripeEvent(db: Db, event: Stripe.Event, hooks: { onPaid?: (orderId: string) => void | Promise<void> } = {}) {
  const [seen] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, event.id));
  if (seen) return 'duplicate' as const;

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const s = event.data.object as Stripe.Checkout.Session;
      const [o] = await db.select().from(orders).where(eq(orders.stripeSessionId, s.id));
      if (!o) break;
      const paid = s.payment_status === 'paid';
      // 'unpaid' con capture manuale = importo autorizzato. 'unpaid' in tutti gli altri casi = pagamento differito:
      // si attende checkout.session.async_payment_succeeded, senza considerare l'ordine pagato.
      if (!paid && o.authorizedCents == null) break;
      const wasPending = o.status === 'pending';
      await markPaid(db, {
        sessionId: s.id, paymentIntentId: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null,
        amountCents: s.amount_total ?? 0, authorizedOnly: !paid,
      });
      if (wasPending) await hooks.onPaid?.(o.id); // email solo alla prima conferma, non ai webhook ripetuti
      break;
    }
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const s = event.data.object as Stripe.Checkout.Session;
      const [o] = await db.select().from(orders).where(eq(orders.stripeSessionId, s.id));
      if (o) await cancelAndRestock(db, o.id, null, 'Pagamento scaduto o fallito');
      break;
    }
    case 'charge.refunded': {
      const c = event.data.object as Stripe.Charge;
      const pi = typeof c.payment_intent === 'string' ? c.payment_intent : c.payment_intent?.id;
      if (!pi) break;
      const full = c.amount_refunded >= c.amount;
      await db.update(orders).set({ paymentStatus: full ? 'refunded' : 'partially_refunded', ...(full ? { status: 'refunded' as const } : {}), updatedAt: new Date() }).where(eq(orders.stripePaymentIntentId, pi));
      await db.update(payments).set({ status: full ? 'refunded' : 'partially_refunded' }).where(sql`${payments.providerRef} = ${pi}`);
      break;
    }
    default: break;
  }
  await db.insert(webhookEvents).values({ id: event.id }).onConflictDoNothing();
  return 'processed' as const;
}
export { refunds };
