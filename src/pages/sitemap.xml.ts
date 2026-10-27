import type { APIRoute } from 'astro';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { siteUrl } from '../lib/site';

export const prerender = false;

// Solo pagine pubbliche e indicizzabili: niente admin, account, carrello, checkout, conferma ordine, API.
const STATIC = ['/', '/chi-siamo', '/il-caseificio', '/produzione', '/punto-vendita', '/per-le-aziende', '/trasparenza', '/shop', '/menu', '/contatti', '/faq', '/spedizioni', '/resi', '/privacy', '/cookie', '/termini'];
const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export const GET: APIRoute = async () => {
  const db = await getDb();
  const { items, itemImages, media, categories } = schema;

  const products = await db.select({ slug: items.slug, at: items.updatedAt }).from(items)
    .where(and(eq(items.inShop, true), eq(items.published, true), isNull(items.archivedAt)));
  const productImgs = await db.select({ slug: items.slug, path: media.path, alt: media.alt }).from(itemImages)
    .innerJoin(items, eq(items.id, itemImages.itemId)).innerJoin(media, eq(media.id, itemImages.mediaId))
    .where(and(eq(items.inShop, true), eq(items.published, true), isNull(items.archivedAt))).orderBy(asc(itemImages.sortOrder));
  const cats = await db.select({ slug: categories.slug }).from(categories).where(and(eq(categories.scope, 'shop'), eq(categories.published, true)));

  const img = (path: string, alt: string) => `<image:image><image:loc>${xml(`${siteUrl}/media/${path}`)}</image:loc>${alt ? `<image:title>${xml(alt)}</image:title>` : ''}</image:image>`;
  const url = (loc: string, opts: { at?: Date; images?: string[] } = {}) =>
    `<url><loc>${xml(siteUrl + loc)}</loc>${opts.at ? `<lastmod>${opts.at.toISOString()}</lastmod>` : ''}${(opts.images ?? []).join('')}</url>`;

  const body = [
    ...STATIC.map((p) => url(p)),
    ...cats.map((c) => url(`/shop/categoria/${c.slug}`)),
    ...products.map((p) => url(`/shop/${p.slug}`, { at: p.at, images: productImgs.filter((i) => i.slug === p.slug).slice(0, 5).map((i) => img(i.path, i.alt)) })),
  ].join('');

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${body}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
