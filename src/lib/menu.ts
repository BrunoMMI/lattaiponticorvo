import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { menuNotes } from './site';

/** `includeDraft`: solo per l'anteprima admin, mostra anche le voci non pubblicate. */
export async function getMenu({ includeDraft = false } = {}) {
  const db = await getDb();
  const { items: t } = schema;
  const items = await db.select().from(t)
    .where(and(eq(t.inMenu, true), isNull(t.archivedAt), includeDraft ? undefined : eq(t.published, true)))
    .orderBy(asc(t.menuSortOrder), asc(t.name));
  if (!items.length) return [];
  const imgs = await db.select({ itemId: schema.itemImages.itemId, mediaId: schema.media.id, path: schema.media.path, alt: schema.media.alt, w: schema.media.width, h: schema.media.height })
    .from(schema.itemImages).innerJoin(schema.media, eq(schema.media.id, schema.itemImages.mediaId))
    .where(inArray(schema.itemImages.itemId, items.map((i) => i.id)))
    .orderBy(asc(schema.itemImages.sortOrder));
  return items.map((it) => ({ ...it, images: imgs.filter((i) => i.itemId === it.id) }));
}

export async function getMenuNotes() {
  const [row] = await (await getDb()).select().from(schema.settings).where(eq(schema.settings.key, 'menu.notes'));
  return { ...menuNotes, ...((row?.value as Partial<typeof menuNotes>) ?? {}) };
}
