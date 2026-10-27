import type { APIRoute } from 'astro';
import { getDb } from '../../../db';
import { quoteCart, type Db } from '../../../lib/orders';
import { PricingError } from '../../../lib/pricing';
import { quoteSchema } from '../../../lib/validation';
import { tooMany } from '../../../lib/ratelimit';

export const prerender = false;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** Prezzi sempre ricalcolati dal database: il client invia solo cosa vuole comprare. */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (tooMany(`quote:${clientAddress}`, 120, 60_000)) return json({ error: 'Troppe richieste.' }, 429);
  const parsed = quoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Richiesta non valida.' }, 400);
  try {
    const q = await quoteCart((await getDb()) as unknown as Db, parsed.data.lines, parsed.data);
    return json({
      ...q,
      lines: q.lines.map(({ itemId, variantId, name, quantity, weightGrams, unitPriceCents, lineTotalCents, variableWeight }) => ({
        itemId, variantId, name, quantity, weightGrams, unitPriceCents, lineTotalCents, variableWeight,
      })),
    });
  } catch (e) {
    if (e instanceof PricingError) return json({ error: e.message, code: e.code }, 409);
    console.error(e);
    return json({ error: 'Errore interno.' }, 500);
  }
};
