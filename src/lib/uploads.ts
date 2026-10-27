import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import sharp, { type OutputInfo } from 'sharp';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '../db';

export const UPLOAD_ROOT = resolve(process.env.UPLOAD_DIR ?? './uploads');
const MAX_BYTES = 15 * 1024 * 1024;

/** Valida davvero il file (decodificandolo con sharp, non fidandosi di estensione/MIME) e salva un WebP ridimensionato. */
export async function saveImage(file: File, folder: string, alt: string) {
  if (file.size === 0 || file.size > MAX_BYTES) throw new Error('Immagine mancante o più grande di 15 MB.');
  const input = Buffer.from(await file.arrayBuffer());
  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await sharp(input, { limitInputPixels: 100_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  } catch {
    throw new Error('Il file non è un’immagine valida (JPG, PNG, WebP).');
  }
  const rel = `${folder}/${randomUUID()}.webp`;
  await mkdir(resolve(UPLOAD_ROOT, folder), { recursive: true });
  await sharp(out.data).toFile(resolve(UPLOAD_ROOT, rel));
  // variante leggera per schede e mobile (vedi mediaSrcset)
  await sharp(out.data).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 74 }).toFile(resolve(UPLOAD_ROOT, rel.replace(/\.webp$/, '-md.webp')));
  await sharp(out.data).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 72 }).toFile(resolve(UPLOAD_ROOT, rel.replace(/\.webp$/, '-sm.webp')));
  const [m] = await (await getDb()).insert(schema.media).values({ path: rel, alt, mime: 'image/webp', width: out.info.width, height: out.info.height }).returning();
  return m;
}

/** Elimina la foto e le sue varianti (sm, md). */
export async function removeMedia(rel: string) {
  await removeFile(rel);
  await removeFile(rel.replace(/\.webp$/, '-md.webp'));
  await removeFile(rel.replace(/\.webp$/, '-sm.webp'));
}

export async function removeFile(rel: string) {
  const f = resolve(UPLOAD_ROOT, rel);
  if (f.startsWith(UPLOAD_ROOT + sep)) await unlink(f).catch(() => {});
}

/** Scollega una foto da un prodotto; il file viene cancellato solo se nessun altro prodotto la usa (es. dopo una duplicazione). */
export async function detachPhoto(itemId: string, mediaId: string) {
  const db = await getDb();
  const { itemImages, media } = schema;
  await db.delete(itemImages).where(and(eq(itemImages.itemId, itemId), eq(itemImages.mediaId, mediaId)));
  const [still] = await db.select({ id: itemImages.id }).from(itemImages).where(eq(itemImages.mediaId, mediaId)).limit(1);
  if (still) return;
  const [m] = await db.delete(media).where(eq(media.id, mediaId)).returning();
  if (m) await removeMedia(m.path);
}
