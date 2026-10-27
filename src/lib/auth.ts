import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import * as OTPAuth from 'otpauth';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { AstroCookies } from 'astro';
import { getDb, schema } from '../db';

const COOKIE = 'lp_session';
const SESSION_DAYS = 7;
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export const hashPassword = (pw: string) => argon2.hash(pw, { type: argon2.argon2id });
export const verifyPassword = (hash: string, pw: string) => argon2.verify(hash, pw).catch(() => false);
/** Hash fittizio: serve a verificare comunque una password quando l'email non esiste (tempi uniformi). */
export const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));

export function passwordProblem(pw: string): string | null {
  if (pw.length < 12) return 'La password deve avere almeno 12 caratteri.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return 'Usa maiuscole, minuscole e numeri.';
  return null;
}

export async function createSession(cookies: AstroCookies, userId: string, pendingTotp: boolean) {
  const db = await getDb();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + (pendingTotp ? 10 * 60_000 : SESSION_DAYS * 86_400_000));
  await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt, pendingTotp });
  cookies.set(COOKIE, token, { httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax', path: '/', expires: expiresAt });
}

export async function readSession(cookies: AstroCookies) {
  const token = cookies.get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db.select({ session: schema.sessions, user: schema.users }).from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, hashToken(token)), gt(schema.sessions.expiresAt, new Date())));
  return row ?? null;
}

export async function destroySession(cookies: AstroCookies) {
  const token = cookies.get(COOKIE)?.value;
  if (token) await (await getDb()).delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
  cookies.delete(COOKIE, { path: '/' });
}

/** Dopo il codice TOTP la sessione "in attesa" viene sostituita da una completa (nuovo token). */
export async function completeTotp(cookies: AstroCookies, userId: string) {
  await destroySession(cookies);
  await createSession(cookies, userId, false);
}

export const totp = (secret: string, email: string) =>
  new OTPAuth.TOTP({ issuer: 'Lattai Ponticorvo', label: email, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
export const newTotpSecret = () => new OTPAuth.Secret({ size: 20 }).base32;
export const checkTotp = (secret: string, email: string, code: string) =>
  totp(secret, email).validate({ token: code.replace(/\s/g, ''), window: 1 }) !== null;

export async function countUsers() {
  const [r] = await (await getDb()).select({ n: sql<number>`count(*)::int` }).from(schema.users);
  return r.n;
}

export async function audit(userId: string | null, action: string, entity?: string, entityId?: string, meta?: object) {
  await (await getDb()).insert(schema.auditLog).values({ userId, action, entity, entityId, meta });
}
