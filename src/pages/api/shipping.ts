import type { APIRoute } from 'astro';
import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '../../db';

export const prerender = false;

/** Solo i campi pubblici dei metodi attivi. */
export const GET: APIRoute = async () => {
  const rows = await (await getDb()).select().from(schema.shippingMethods).where(eq(schema.shippingMethods.active, true)).orderBy(asc(schema.shippingMethods.sortOrder));
  const body = rows.map((m) => ({ id: m.id, name: m.name, kind: m.kind, priceCents: m.priceCents, freeOverCents: m.freeOverCents, zones: m.zones, etaText: m.etaText }));
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' } });
};
