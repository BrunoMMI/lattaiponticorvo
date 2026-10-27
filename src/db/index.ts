import * as schema from './schema';

/**
 * Sviluppo (DATABASE_URL vuoto): PGlite, un vero Postgres in-process salvato in ./.data/pg.
 * Produzione: Postgres tramite DATABASE_URL. Stesso schema e stesse query in entrambi i casi.
 */
async function connect() {
  const url = process.env.DATABASE_URL || import.meta.env?.DATABASE_URL;
  if (url) {
    const { default: pg } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    return drizzle(new pg.Pool({ connectionString: url }), { schema });
  }
  (await import('node:fs')).mkdirSync('./.data', { recursive: true });
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  return drizzle(new PGlite(process.env.PGLITE_DIR || './.data/pg'), { schema });
}

let instance: ReturnType<typeof connect> | undefined;
export const getDb = () => (instance ??= connect());
export { schema };
