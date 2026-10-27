import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { schema } from '../db';
import type { Db } from './orders';

const { orders, orderLines, items, categories, customers, refunds, payments } = schema;
/** Stati che contano come venduto. Gli ordini in attesa, annullati o rimborsati per intero sono esclusi. */
export const SOLD = ['paid', 'preparing', 'shipped', 'delivered'] as const;
const TZ = 'Europe/Rome';

export interface Period { from: Date; to: Date } // [from, to)

const inPeriod = (p: Period) => and(inArray(orders.status, [...SOLD]), gte(orders.createdAt, p.from), lt(orders.createdAt, p.to));

export async function totals(db: Db, p: Period) {
  const [t] = await db.select({ gross: sql<number>`coalesce(sum(${orders.totalCents}),0)::int`, n: sql<number>`count(*)::int` }).from(orders).where(inPeriod(p));
  // rimborsi parziali sugli ordini del periodo: il fatturato è al netto
  const [r] = await db.select({ refunded: sql<number>`coalesce(sum(${refunds.amountCents}),0)::int` }).from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId)).innerJoin(orders, eq(orders.id, payments.orderId)).where(inPeriod(p));
  const revenue = t.gross - r.refunded;
  return { revenueCents: revenue, orders: t.n, avgCents: t.n ? Math.round(revenue / t.n) : 0, refundedCents: r.refunded };
}

export async function getStats(db: Db, p: Period) {
  const main = await totals(db, p);

  const dayExpr = sql<string>`to_char(${orders.createdAt} at time zone ${sql.raw(`'${TZ}'`)}, 'YYYY-MM-DD')`;
  const daily = await db.select({ day: dayExpr, revenueCents: sql<number>`sum(${orders.totalCents})::int`, orders: sql<number>`count(*)::int` })
    .from(orders).where(inPeriod(p)).groupBy(dayExpr).orderBy(dayExpr);

  const statusRows = await db.select({ status: orders.status, n: sql<number>`count(*)::int` }).from(orders).groupBy(orders.status);
  const status = Object.fromEntries(statusRows.map((s) => [s.status, s.n])) as Record<string, number>;

  const top = await db.select({ name: orderLines.nameSnapshot, revenueCents: sql<number>`sum(${orderLines.lineTotalCents})::int`, units: sql<number>`sum(${orderLines.quantity})::int`, weight: sql<number>`coalesce(sum(${orderLines.weightGrams}),0)::int` })
    .from(orderLines).innerJoin(orders, eq(orders.id, orderLines.orderId)).where(inPeriod(p))
    .groupBy(orderLines.nameSnapshot).orderBy(desc(sql`sum(${orderLines.lineTotalCents})`)).limit(10);

  const catName = sql<string>`coalesce(${categories.name}, 'Senza categoria')`;
  const byCategory = await db.select({ name: catName, revenueCents: sql<number>`sum(${orderLines.lineTotalCents})::int` })
    .from(orderLines).innerJoin(orders, eq(orders.id, orderLines.orderId)).leftJoin(items, eq(items.id, orderLines.itemId)).leftJoin(categories, eq(categories.id, items.shopCategoryId))
    .where(inPeriod(p)).groupBy(catName).orderBy(desc(sql`sum(${orderLines.lineTotalCents})`));

  // clienti nuovi = primo ordine venduto nel periodo; ricorrenti = avevano già ordinato prima
  const buyers = await db.select({ id: orders.customerId, email: orders.email }).from(orders).where(inPeriod(p)).groupBy(orders.customerId, orders.email);
  const keys = buyers.map((b) => b.id).filter((x): x is string => !!x);
  let returning = 0;
  if (keys.length) {
    const before = await db.select({ id: orders.customerId }).from(orders)
      .where(and(inArray(orders.customerId, keys), inArray(orders.status, [...SOLD]), lt(orders.createdAt, p.from))).groupBy(orders.customerId);
    returning = before.length;
  }
  const customersStat = { total: buyers.length, returning, new: buyers.length - returning };

  const lowStock = await db.select({ id: items.id, name: items.name, stockQty: items.stockQty, unit: items.sellUnit, threshold: items.lowStockThreshold }).from(items)
    .where(and(eq(items.inShop, true), sql`${items.archivedAt} is null`, sql`${items.lowStockThreshold} > 0`, sql`${items.stockQty} <= ${items.lowStockThreshold}`));

  return { main, daily, status, top, byCategory, customers: customersStat, lowStock };
}

/** Riempie i giorni senza vendite con zero, così il grafico ha l'asse del tempo continuo. */
export function fillDays(daily: { day: string; revenueCents: number; orders: number }[], p: Period) {
  const map = new Map(daily.map((d) => [d.day, d]));
  const out: { day: string; revenueCents: number; orders: number }[] = [];
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
  for (let t = p.from.getTime(); t < p.to.getTime(); t += 86_400_000) {
    const day = fmt.format(new Date(t));
    if (out.length && out[out.length - 1].day === day) continue;
    out.push(map.get(day) ?? { day, revenueCents: 0, orders: 0 });
  }
  return out;
}

export { customers };
