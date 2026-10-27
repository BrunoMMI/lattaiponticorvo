import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { AstroCookies } from 'astro';
import { getDb, schema } from '../db';
import { hashPassword, verifyPassword } from './auth';
import { sendMail, layout, esc } from './email';
import { siteUrl } from './site';

const COOKIE = 'lp_cust';
const DAYS = 30;
const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const { customers, customerSessions, customerTokens } = schema;

export async function startCustomerSession(cookies: AstroCookies, customerId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + DAYS * 86_400_000);
  await (await getDb()).insert(customerSessions).values({ id: hash(token), customerId, expiresAt });
  cookies.set(COOKIE, token, { httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax', path: '/', expires: expiresAt });
}

export async function readCustomer(cookies: AstroCookies) {
  const token = cookies.get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await (await getDb()).select({ c: customers }).from(customerSessions).innerJoin(customers, eq(customers.id, customerSessions.customerId))
    .where(and(eq(customerSessions.id, hash(token)), gt(customerSessions.expiresAt, new Date()), isNull(customers.deletedAt)));
  return row?.c ?? null;
}

export async function endCustomerSession(cookies: AstroCookies) {
  const token = cookies.get(COOKIE)?.value;
  if (token) await (await getDb()).delete(customerSessions).where(eq(customerSessions.id, hash(token)));
  cookies.delete(COOKIE, { path: '/' });
}

export async function loginCustomer(email: string, password: string) {
  const [c] = await (await getDb()).select().from(customers).where(and(eq(sql`lower(${customers.email})`, email.trim().toLowerCase()), isNull(customers.deletedAt)));
  // si verifica sempre un hash (anche per email sconosciute o account senza password) per tempi di risposta uniformi
  const ok = await verifyPassword(c?.passwordHash ?? DUMMY, password);
  return c && c.passwordHash && ok ? c : null;
}
let DUMMY = '';
hashPassword(randomBytes(16).toString('hex')).then((h) => { DUMMY = h; });

/**
 * Invia il link per creare/reimpostare la password. Chi richiede l'account deve controllare la casella email:
 * questo impedisce di "reclamare" lo storico ordini di un indirizzo altrui.
 */
export async function sendCustomerToken(email: string, name = '') {
  const db = await getDb();
  const addr = email.trim().toLowerCase();
  let [c] = await db.select().from(customers).where(and(eq(sql`lower(${customers.email})`, addr), isNull(customers.deletedAt)));
  if (!c) [c] = await db.insert(customers).values({ email: addr, name: name.trim().slice(0, 120) }).returning();
  const token = randomBytes(32).toString('base64url');
  await db.delete(customerTokens).where(eq(customerTokens.customerId, c.id));
  await db.insert(customerTokens).values({ tokenHash: hash(token), customerId: c.id, expiresAt: new Date(Date.now() + 30 * 60_000) });
  const link = `${siteUrl}/account/password?token=${token}`;
  await sendMail(addr, 'Imposta la password del tuo account', layout('Imposta la tua password',
    `<p style="line-height:1.6">Ciao${c.name ? ` ${esc(c.name)}` : ''}, usa il pulsante per scegliere la password del tuo account Lattai Ponticorvo. Il link vale 30 minuti e funziona una sola volta.</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#820024;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">Scegli la password</a></p>
<p style="font-size:12px;color:#5b5455">Se non l’hai richiesto tu, ignora questa email.</p>`));
}

export async function tokenOwner(token: string) {
  const [row] = await (await getDb()).select().from(customerTokens).where(and(eq(customerTokens.tokenHash, hash(token)), gt(customerTokens.expiresAt, new Date())));
  return row ?? null;
}

/** Consuma il token e imposta la password nella stessa transazione: un solo utilizzo possibile. */
export async function setPasswordWithToken(token: string, password: string) {
  const db = await getDb();
  const h = await hashPassword(password);
  return db.transaction(async (tx) => {
    const [t] = await tx.delete(customerTokens).where(and(eq(customerTokens.tokenHash, hash(token)), gt(customerTokens.expiresAt, new Date()))).returning();
    if (!t) return null;
    await tx.update(customers).set({ passwordHash: h }).where(eq(customers.id, t.customerId));
    await tx.delete(customerSessions).where(eq(customerSessions.customerId, t.customerId)); // chiude le sessioni precedenti
    return t.customerId;
  });
}
