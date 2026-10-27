// Voci del menù dall'immagine del cliente + foto fornite. Nessun prezzo.
// Con DATABASE_URL (es. Supabase) scrive sul database remoto, altrimenti su PGlite locale.
import { mkdirSync } from 'node:fs';
mkdirSync('./.data', { recursive: true });
import { drizzle as dPglite } from 'drizzle-orm/pglite';
import { drizzle as dPg } from 'drizzle-orm/node-postgres';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { pgConfig } from '../src/db/pg-config.ts';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { items, media, itemImages } from '../src/db/schema.ts';
import { menuSeed } from '../src/db/menu-seed.ts';
import { slugify } from '../src/lib/slug.ts';

const url = process.env.DATABASE_URL;
const db = url ? dPg(new pg.Pool(pgConfig(url))) : dPglite(new PGlite(process.env.PGLITE_DIR || './.data/pg'));
await db.execute(sql`delete from items where in_menu = true and in_shop = false`);
await db.execute(sql`delete from media where path like 'menu/%'`);
for (const [i, m] of menuSeed.entries()) {
  const [it] = await db.insert(items).values({
    name: m.name, slug: slugify(m.name), shortDescription: m.description,
    inMenu: true, published: true, menuSortOrder: i, sellUnit: 'fixed_weight', variableWeight: true,
  }).returning();
  for (const [n, ph] of m.photos.entries()) {
    const path = `menu/${ph}.webp`;
    const meta = await sharp(`./uploads/${path}`).metadata();
    const [md] = await db.insert(media).values({ path, alt: m.name, mime: 'image/webp', width: meta.width, height: meta.height }).returning();
    await db.insert(itemImages).values({ itemId: it.id, mediaId: md.id, sortOrder: n });
  }
}
console.log(`Menù: ${menuSeed.length} voci inserite.`);
process.exit(0);
