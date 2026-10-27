import { mkdirSync } from 'node:fs';
mkdirSync('./.data', { recursive: true });
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as dPglite } from 'drizzle-orm/pglite';
import { drizzle as dPg } from 'drizzle-orm/node-postgres';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (url) await migratePg(dPg(new pg.Pool({ connectionString: url })), { migrationsFolder: './drizzle' });
else await migratePglite(dPglite(new PGlite(process.env.PGLITE_DIR || './.data/pg')), { migrationsFolder: './drizzle' });
console.log('Migrazioni applicate.');
process.exit(0);
