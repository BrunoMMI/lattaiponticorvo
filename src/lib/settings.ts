import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '../db';
import { business, type Business } from './site';

/* ───────── Dati aziendali ───────── */
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Orario non valido');
export const businessSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  vat: z.string().trim().regex(/^\d{11}$/, 'La partita IVA ha 11 cifre'),
  phone: z.string().trim().min(5).max(30),
  email: z.string().trim().email().max(160),
  street: z.string().trim().min(3).max(160),
  zip: z.string().trim().regex(/^\d{5}$/, 'CAP non valido'),
  city: z.string().trim().min(2).max(80),
  province: z.string().trim().length(2).transform((s) => s.toUpperCase()),
  instagram: z.string().trim().url().or(z.literal('')),
  facebook: z.string().trim().url().or(z.literal('')),
  tiktok: z.string().trim().url().or(z.literal('')),
  weekOpen: hhmm, weekClose: hhmm,
  sunOpen: hhmm.or(z.literal('')), sunClose: hhmm.or(z.literal('')),
});
export type BusinessSettings = z.infer<typeof businessSchema>;

const defaults: Business = structuredClone(business);
const noLeadingZero = (t: string) => t.replace(/^0/, '');

export function applyBusiness(s: BusinessSettings) {
  business.legalName = s.legalName;
  business.vat = s.vat;
  business.phone = s.phone;
  business.phoneTel = `+39${s.phone.replace(/\D/g, '').replace(/^(0039|39)/, '')}`;
  business.email = s.email;
  business.address = { ...business.address, street: s.street, zip: s.zip, city: s.city, province: s.province };
  business.social = { instagram: s.instagram, facebook: s.facebook, tiktok: s.tiktok };
  business.hours = [{ label: 'Lunedì – Sabato', value: `${noLeadingZero(s.weekOpen)} – ${noLeadingZero(s.weekClose)} (orario continuato)`, days: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], opens: s.weekOpen, closes: s.weekClose }];
  business.hours.push(s.sunOpen && s.sunClose
    ? { label: 'Domenica', value: `${noLeadingZero(s.sunOpen)} – ${noLeadingZero(s.sunClose)}`, days: ['Su'], opens: s.sunOpen, closes: s.sunClose }
    : { label: 'Domenica', value: 'chiuso', days: [], opens: '00:00', closes: '00:00' });
}

export function currentBusinessSettings(): BusinessSettings {
  const b = business, w = b.hours[0], su = b.hours[1];
  return {
    legalName: b.legalName, vat: b.vat, phone: b.phone, email: b.email,
    street: b.address.street, zip: b.address.zip, city: b.address.city, province: b.address.province,
    instagram: b.social.instagram, facebook: b.social.facebook, tiktok: b.social.tiktok,
    weekOpen: w.opens, weekClose: w.closes, sunOpen: su?.days.length ? su.opens : '', sunClose: su?.days.length ? su.closes : '',
  };
}
export const resetBusinessToDefaults = () => Object.assign(business, structuredClone(defaults));

/* ───────── Testi del sito modificabili ───────── */
export const CONTENT_FIELDS = [
  { key: 'banner.text', label: 'Banner in alto (lascia vuoto per nasconderlo)', def: '', max: 160, group: 'Banner' },
  { key: 'banner.link', label: 'Indirizzo del banner (facoltativo, es. /shop)', def: '', max: 200, group: 'Banner' },
  { key: 'home.eyebrow', label: 'Sopratitolo', def: 'Casari dal 1968', max: 60, group: 'Home · in alto' },
  { key: 'home.title', label: 'Titolo', def: 'L’amore per il latte è una tradizione di famiglia.', max: 120, group: 'Home · in alto' },
  { key: 'home.subtitle', label: 'Sottotitolo', def: 'Da tre generazioni di mastri casari, formaggi profumati e nutrienti, nel rispetto della lavorazione artigianale e della genuinità delle materie prime.', max: 300, area: true, group: 'Home · in alto' },
  { key: 'home.story', label: 'La nostra storia (testo breve)', def: 'Nel 1968 nonno Antonino, originario di Piano di Sorrento, fondò il suo primo caseificio. Dall’esperienza di tre generazioni di mastri casari nasce “Lattai Ponticorvo”, un progetto di Luca Ponticorvo e di suo figlio Antonino.', max: 600, area: true, group: 'Home · sezioni' },
  { key: 'home.menu', label: 'Il menù del locale (testo breve)', def: 'Panini piastrati, taglieri, caprese e altre specialità con i nostri latticini, da gustare seduti da noi. Scansiona il QR sul tavolo oppure sfoglia il menù da qui.', max: 400, area: true, group: 'Home · sezioni' },
  { key: 'seo.home.title', label: 'Titolo per Google (home)', def: 'Lattai Ponticorvo, casari dal 1968', max: 70, group: 'SEO' },
  { key: 'seo.home.description', label: 'Descrizione per Google (home)', def: 'Caseificio artigianale ad Alvignano (CE): mozzarella di bufala, latticini e specialità casearie, da tre generazioni di mastri casari. Shop online e menù del locale.', max: 170, area: true, group: 'SEO' },
] as const;
export type ContentKey = (typeof CONTENT_FIELDS)[number]['key'];

const TTL = 15_000;
let cache: { at: number; content: Record<string, string>; vat: number[] } | null = null;
let lastBiz = 0;

export function invalidateSettingsCache() { cache = null; lastBiz = 0; }

async function load() {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const db = await getDb();
  const rows = await db.select().from(schema.siteContent);
  const [vat] = await db.select().from(schema.settings).where(eq(schema.settings.key, 'vatRates'));
  cache = { at: Date.now(), content: Object.fromEntries(rows.map((r) => [r.key, r.value])), vat: (vat?.value as number[] | undefined) ?? [4, 10, 22] };
  return cache;
}

export async function contentAll() {
  const c = await load();
  return Object.fromEntries(CONTENT_FIELDS.map((f) => [f.key, c.content[f.key] ?? f.def])) as Record<ContentKey, string>;
}
export async function vatRates() { return (await load()).vat; }

/** Allinea l'oggetto `business` ai dati salvati. Chiamata dal middleware con cache breve. */
export async function refreshBusiness() {
  if (Date.now() - lastBiz < TTL) return;
  lastBiz = Date.now();
  const [row] = await (await getDb()).select().from(schema.settings).where(eq(schema.settings.key, 'business'));
  const parsed = row ? businessSchema.safeParse(row.value) : null;
  if (parsed?.success) applyBusiness(parsed.data);
}
