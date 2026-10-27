// Importa dal vecchio sito (WordPress/WooCommerce): categorie shop, prodotti (come BOZZE, giacenza 0) e notizie.
// Idempotente: ciò che esiste già (stesso slug) non viene toccato. Uso: `npm run db:import-old`
// In produzione imposta DATABASE_URL; senza, usa il database locale PGlite.
import { mkdirSync, readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.ts';

mkdirSync('./.data', { recursive: true });
let db;
if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  db = drizzle(new pg.Pool({ connectionString: process.env.DATABASE_URL }), { schema });
} else {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  db = drizzle(new PGlite(process.env.PGLITE_DIR || './.data/pg'), { schema });
}
const { categories, items, itemVariants, itemImages, media, posts } = schema;
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const addMedia = async (path, alt, w, h) => (await db.insert(media).values({ path, alt, mime: 'image/webp', width: w, height: h }).returning())[0];

const { categories: cats, products } = read('./data/old-products.json');
const catId = {};
let order = 0;
for (const c of cats) {
  const [ex] = await db.select().from(categories).where(eq(categories.slug, c.slug));
  catId[c.slug] = ex ? ex.id : (await db.insert(categories).values({ scope: 'shop', name: c.name, slug: c.slug, sortOrder: ++order }).returning())[0].id;
}

let nProd = 0;
for (const p of products) {
  const [ex] = await db.select().from(items).where(eq(items.slug, p.slug));
  if (ex) continue;
  const minPrice = Math.min(...p.variants.map((v) => v.priceCents));
  const [it] = await db.insert(items).values({
    name: p.name, slug: p.slug, shortDescription: p.shortDescription, description: p.description, allergens: p.allergens, storage: p.storage,
    shopCategoryId: catId[p.category], inShop: true, published: false, sellUnit: 'pack', priceCents: minPrice, vatRate: '4.00',
    variableWeight: p.variableWeight, stockQty: 0, seoDescription: p.shortDescription.slice(0, 170),
  }).returning();
  for (const [i, v] of p.variants.entries()) {
    await db.insert(itemVariants).values({ itemId: it.id, label: v.label, weightGrams: v.weightGrams, priceCents: v.priceCents, stockQty: 0, sortOrder: i });
  }
  for (const [i, im] of p.images.entries()) {
    const m = await addMedia(im.path, p.name, im.w, im.h);
    await db.insert(itemImages).values({ itemId: it.id, mediaId: m.id, sortOrder: i });
  }
  nProd++;
}

let nNews = 0;
for (const n of read('./data/old-news.json')) {
  const [ex] = await db.select().from(posts).where(eq(posts.slug, n.slug));
  if (ex) continue;
  const m = n.image ? await addMedia(n.image.path, n.image.alt, n.image.w, n.image.h) : null;
  await db.insert(posts).values({ slug: n.slug, title: n.title, excerpt: n.excerpt, body: n.body, imageId: m?.id, published: true, publishedAt: new Date(n.date + '+02:00') });
  nNews++;
}
console.log(`Importati: ${nProd} prodotti (bozze), ${nNews} notizie, ${cats.length} categorie.`);
process.exit(0);
