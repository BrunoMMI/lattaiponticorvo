import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../db';
import { cancelAndRestock, createPendingOrder, quoteCart, type Db } from '../../lib/orders';
import { PricingError } from '../../lib/pricing';
import { checkoutSchema } from '../../lib/validation';
import { tooMany } from '../../lib/ratelimit';
import { createCheckoutSession, getStripe } from '../../lib/stripe';
import { siteUrl } from '../../lib/site';

export const prerender = false;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (tooMany(`checkout:${clientAddress}`, 10, 10 * 60_000)) return json({ error: 'Troppi tentativi, riprova tra qualche minuto.' }, 429);
  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Dati non validi.' }, 400);
  const stripe = getStripe();
  if (!stripe) return json({ error: 'I pagamenti online non sono ancora attivi. Contattaci per ordinare.' }, 503);

  const db = (await getDb()) as unknown as Db;
  const d = parsed.data;
  let orderId: string | null = null;
  try {
    const [method] = await db.select().from(schema.shippingMethods).where(eq(schema.shippingMethods.id, d.shippingMethodId));
    if (method?.kind === 'delivery' && !d.shipping) return json({ error: 'Inserisci l’indirizzo di consegna.' }, 400);
    const quote = await quoteCart(db, d.lines, { couponCode: d.couponCode, shippingMethodId: d.shippingMethodId, dest: d.shipping ?? undefined });
    const order = await createPendingOrder(db, quote, d.customer, d.shipping, null);
    orderId = order.id;
    const session = await createCheckoutSession(stripe, db, order.id, siteUrl);
    return json({ url: session.url });
  } catch (e) {
    // Se qualcosa si rompe dopo aver riservato le scorte, le scorte tornano subito disponibili.
    if (orderId) await cancelAndRestock(db, orderId, null, 'Errore nella creazione del pagamento').catch(() => {});
    if (e instanceof PricingError) return json({ error: e.message, code: e.code }, 409);
    console.error('[checkout]', e);
    return json({ error: 'Non è stato possibile avviare il pagamento. Riprova.' }, 502);
  }
};
