import type { APIRoute } from 'astro';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { business as b, siteUrl } from '../lib/site';
import { euro } from '../lib/pricing';

export const prerender = false;

/**
 * Versione estesa di llms.txt, pensata per i sistemi di ricerca basati su AI: fatti verificabili e già pubblici sul sito
 * (azienda, orari, prodotti con formati e prezzi). Generata dal database: si aggiorna da sola.
 */
export const GET: APIRoute = async () => {
  const db = await getDb();
  const { items, itemVariants, categories } = schema;
  const prods = await db.select().from(items).where(and(eq(items.inShop, true), eq(items.published, true), isNull(items.archivedAt))).orderBy(asc(items.name));
  const vars = await db.select().from(itemVariants);
  const cats = await db.select().from(categories).where(eq(categories.scope, 'shop'));

  const lines: string[] = [
    `# ${b.name} — informazioni complete`, '',
    `> Caseificio artigianale ad ${b.address.city} (${b.address.province}), ${b.tagline.toLowerCase()}. Tre generazioni di mastri casari: nel 1968 nonno Antonino, originario di Piano di Sorrento, fondò il primo caseificio; oggi il progetto è di Luca Ponticorvo e del figlio Antonino.`, '',
    '## Azienda',
    `- Ragione sociale: ${b.legalName}, P.IVA ${b.vat}`,
    `- Indirizzo: ${b.address.street}, ${b.address.zip} ${b.address.city} (${b.address.province}), Italia`,
    `- Telefono: ${b.phone} · Email: ${b.email}`,
    `- Orari: ${b.hours.map((h) => `${h.label} ${h.value}`).join('; ')}`,
    '- Struttura di 1.500 mq con laboratorio di analisi, celle di abbattimento (−40 °C), locale di affumicatura, cella di stagionatura.',
    '- Distribuzione in Italia e all’estero con filiera del freddo: abbattimento a −40 °C nel giorno di produzione, shelf-life 365 giorni.',
    '- Certificazioni dichiarate: Mozzarella di Bufala Campana DOP, Halal, BRC.',
    '- Punto vendita e locale con menù digitale (prezzi in base al peso della porzione).', '',
  ];
  if (prods.length) {
    lines.push('## Prodotti acquistabili online');
    for (const p of prods) {
      const c = cats.find((x) => x.id === p.shopCategoryId)?.name;
      const vs = vars.filter((v) => v.itemId === p.id);
      const price = vs.length ? vs.map((v) => `${v.label}: ${euro(v.priceCents ?? p.priceCents ?? 0)}`).join('; ') : p.priceCents != null ? euro(p.salePriceCents ?? p.priceCents) : 'prezzo su richiesta';
      lines.push(`- [${p.name}](${siteUrl}/shop/${p.slug})${c ? ` (${c})` : ''} — ${price}. ${p.shortDescription}${p.allergens.length ? ` Allergeni: ${p.allergens.join(', ')}.` : ''}`);
    }
    lines.push('');
  }
  lines.push('## Pagine', ...['/chi-siamo', '/il-caseificio', '/produzione', '/punto-vendita', '/per-le-aziende', '/menu', '/shop', '/faq', '/contatti', '/spedizioni', '/resi'].map((p) => `- ${siteUrl}${p}`));
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
