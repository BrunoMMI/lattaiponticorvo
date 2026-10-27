import type { APIRoute } from 'astro';
import { getDb } from '../../../db';
import { getStripe, handleStripeEvent } from '../../../lib/stripe';
import type { Db } from '../../../lib/orders';
import { notifyOrder } from '../../../lib/email';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET || import.meta.env.STRIPE_WEBHOOK_SECRET;
  const sig = request.headers.get('stripe-signature');
  if (!stripe || !secret || !sig) return new Response('Webhook non configurato', { status: 400 });

  // Serve il corpo GREZZO: la firma si verifica sui byte originali, non su JSON rielaborato.
  const raw = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return new Response('Firma non valida', { status: 400 });
  }
  try {
    const db = (await getDb()) as unknown as Db;
    await handleStripeEvent(db, event, { onPaid: (id) => notifyOrder(db, id, 'paid') });
  } catch (e) {
    console.error('[stripe webhook]', event.id, e);
    return new Response('Errore interno', { status: 500 }); // Stripe riprova
  }
  return new Response('ok');
};
