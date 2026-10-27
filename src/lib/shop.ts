import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';

const { items, categories, itemImages, media, itemVariants } = schema;
const live = () => and(eq(items.inShop, true), eq(items.published, true), isNull(items.archivedAt));

async function withImages<T extends { id: string }>(rows: T[]) {
  if (!rows.length) return [] as (T & { images: { path: string; alt: string; w: number | null; h: number | null }[] })[];
  const db = await getDb();
  const imgs = await db.select({ itemId: itemImages.itemId, path: media.path, alt: media.alt, w: media.width, h: media.height })
    .from(itemImages).innerJoin(media, eq(media.id, itemImages.mediaId))
    .where(inArray(itemImages.itemId, rows.map((r) => r.id))).orderBy(asc(itemImages.sortOrder));
  return rows.map((r) => ({ ...r, images: imgs.filter((i) => i.itemId === r.id) }));
}

export async function shopCategories() {
  const db = await getDb();
  return db.select().from(categories).where(and(eq(categories.scope, 'shop'), eq(categories.published, true))).orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function shopProducts(opts: { categoryIds?: string[]; q?: string; featured?: boolean; limit?: number } = {}) {
  const db = await getDb();
  const term = opts.q?.trim().replace(/[%_\\]/g, '');
  const rows = await db.select().from(items).where(and(
    live(),
    opts.categoryIds?.length ? inArray(items.shopCategoryId, opts.categoryIds) : undefined,
    opts.featured ? eq(items.featured, true) : undefined,
    term ? or(ilike(items.name, `%${term}%`), ilike(items.shortDescription, `%${term}%`)) : undefined,
  )).orderBy(desc(items.featured), asc(items.name)).limit(opts.limit ?? 200);
  return withImages(rows);
}

export async function shopProduct(slug: string) {
  const db = await getDb();
  const [row] = await db.select().from(items).where(and(eq(items.slug, slug), live()));
  if (!row) return null;
  const [withImg] = await withImages([row]);
  const variants = await db.select().from(itemVariants).where(eq(itemVariants.itemId, row.id)).orderBy(asc(itemVariants.sortOrder), asc(itemVariants.weightGrams));
  const [cat] = row.shopCategoryId ? await db.select().from(categories).where(eq(categories.id, row.shopCategoryId)) : [];
  return { ...withImg, variants, category: cat ?? null };
}

/** Categoria e discendenti (le sottocategorie ereditano i prodotti del genitore). */
export async function categoryWithChildren(slug: string) {
  const db = await getDb();
  const [cat] = await db.select().from(categories).where(and(eq(categories.scope, 'shop'), eq(categories.slug, slug), eq(categories.published, true)));
  if (!cat) return null;
  const children = await db.select().from(categories).where(and(eq(categories.parentId, cat.id), eq(categories.published, true)));
  return { cat, ids: [cat.id, ...children.map((c) => c.id)], children };
}

/** Disponibile = c'è almeno un'unità acquistabile (considerando le varianti). */
export function inStock(p: { sellUnit: string; stockQty: number; variants?: { stockQty: number; weightGrams: number | null }[] }) {
  if (p.sellUnit === 'kg') return p.stockQty >= (p.variants?.length ? Math.min(...p.variants.map((v) => v.weightGrams ?? Infinity)) : 100);
  if (p.variants?.length) return p.variants.some((v) => v.stockQty > 0);
  return p.stockQty > 0;
}

export { sql };
