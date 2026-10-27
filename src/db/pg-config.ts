/**
 * Configurazione del pool Postgres per Supabase e altri database gestiti.
 * - SSL attivo per ogni host che non sia locale (Supabase usa una propria CA, quindi niente verifica del certificato);
 * - `sslmode` viene tolto dall'URL, altrimenti `pg` lo userebbe al posto di queste opzioni;
 * - pool piccolo: su Vercel ogni funzione apre le sue connessioni, quindi si usa il pooler (porta 6543).
 */
export function pgConfig(url: string) {
  const u = new URL(url);
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname);
  u.searchParams.delete('sslmode');
  return { connectionString: u.toString(), ssl: local ? undefined : { rejectUnauthorized: false }, max: Number(process.env.PG_POOL_MAX ?? 3) };
}
