import { eq } from 'drizzle-orm';
import { schema } from '../db';
import type { Db } from './orders';

const { customers, addresses, orders, orderLines, payments, refunds, customerSessions, customerTokens } = schema;

/** Esportazione dei dati personali di un cliente (diritto di accesso e portabilità, art. 15 e 20 GDPR). */
export async function exportCustomerData(db: Db, customerId: string) {
  const [c] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!c) return null;
  const { passwordHash: _omit, ...profile } = c; // l'hash della password non fa parte dei dati esportati
  const addr = await db.select().from(addresses).where(eq(addresses.customerId, customerId));
  const ords = await db.select().from(orders).where(eq(orders.customerId, customerId));
  const result = [];
  for (const o of ords) {
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, o.id));
    const pays = await db.select().from(payments).where(eq(payments.orderId, o.id));
    const refs = [];
    for (const p of pays) refs.push(...(await db.select().from(refunds).where(eq(refunds.paymentId, p.id))));
    result.push({
      numero: o.number, data: o.createdAt, stato: o.status, pagamento: o.paymentStatus, email: o.email,
      indirizzoSpedizione: o.shippingAddress, totaleCentesimi: o.totalCents, codiceSconto: o.couponCode,
      righe: lines.map((l) => ({ prodotto: l.nameSnapshot, quantita: l.quantity, pesoGrammi: l.actualWeightGrams ?? l.weightGrams, totaleCentesimi: l.lineTotalCents })),
      pagamenti: pays.map((p) => ({ importoCentesimi: p.amountCents, stato: p.status, data: p.createdAt })),
      rimborsi: refs.map((r) => ({ importoCentesimi: r.amountCents, data: r.createdAt })),
    });
  }
  return { esportatoIl: new Date(), profilo: profile, indirizzi: addr, ordini: result };
}

/**
 * Cancellazione (art. 17 GDPR) compatibile con gli obblighi contabili: i dati identificativi vengono rimossi o
 * resi anonimi, mentre importi e righe d'ordine restano per le scritture fiscali.
 * [Da validare con il commercialista: tempi di conservazione e dati che devono restare associati alle fatture.]
 */
export async function anonymizeCustomer(db: Db, customerId: string) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(customers).where(eq(customers.id, customerId));
    if (!c || c.deletedAt) return false;
    const anon = `eliminato-${customerId}@anonimo.invalid`;
    await tx.update(orders).set({ email: anon, shippingAddress: null, billingAddress: null, internalNote: null }).where(eq(orders.customerId, customerId));
    await tx.delete(addresses).where(eq(addresses.customerId, customerId));
    await tx.delete(customerSessions).where(eq(customerSessions.customerId, customerId));
    await tx.delete(customerTokens).where(eq(customerTokens.customerId, customerId));
    await tx.update(customers).set({ email: anon, name: '', phone: null, passwordHash: null, marketingConsent: false, deletedAt: new Date() }).where(eq(customers.id, customerId));
    return true;
  });
}
