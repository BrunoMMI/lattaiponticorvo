import { Resend } from 'resend';
import { eq } from 'drizzle-orm';
import { schema } from '../db';
import { business, siteUrl } from './site';
import { euro } from './pricing';
import type { Db } from './orders';

/**
 * Invio email. Senza RESEND_API_KEY nulla viene spedito: il messaggio viene solo stampato in console,
 * così in sviluppo e nei test non parte mai una email reale.
 */
export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY || import.meta.env?.RESEND_API_KEY;
  if (!key) {
    console.log(`[email:non inviata — manca RESEND_API_KEY] a=${to} oggetto="${subject}"`);
    // Solo in sviluppo: stampa i link contenuti (es. reset password). Mai in produzione: finirebbero nei log.
    if (!import.meta.env.PROD) for (const m of html.matchAll(/href="([^"]+)"/g)) console.log(`[email:dev] link: ${m[1].replace(/&amp;/g, '&')}`);
    return false;
  }
  const from = process.env.MAIL_FROM || import.meta.env?.MAIL_FROM || business.email;
  try {
    const { error } = await new Resend(key).emails.send({ from: `${business.name} <${from}>`, to, subject, html });
    if (error) { console.error('[email] errore Resend', error); return false; }
    return true;
  } catch (e) {
    console.error('[email] invio fallito', e);
    return false;
  }
}

/** Ogni valore proveniente da clienti o admin passa da qui prima di finire in HTML. */
export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#fbf7f0;font-family:Arial,Helvetica,sans-serif;color:#231f20">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#820024;padding:20px 28px;color:#fff;font-size:22px;font-family:Georgia,serif">${esc(business.name)}<br><span style="font-size:13px;opacity:.85">${esc(business.tagline)}</span></td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 16px;font-size:22px;font-family:Georgia,serif">${esc(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px;background:#f3ebdd;font-size:12px;color:#5b5455">${esc(business.legalName)} · P.IVA ${esc(business.vat)}<br>${esc(business.address.street)}, ${esc(business.address.zip)} ${esc(business.address.city)} (${esc(business.address.province)}) · ${esc(business.phone)} · ${esc(business.email)}</td></tr>
</table></td></tr></table></body></html>`;
}

const btn = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#820024;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">${esc(label)}</a></p>`;

export type OrderMail = 'paid' | 'preparing' | 'shipped' | 'cancelled' | 'refunded' | 'captured';

const COPY: Record<OrderMail, { subject: (n: number) => string; title: string; text: string }> = {
  paid: { subject: (n) => `Abbiamo ricevuto il tuo ordine #${n}`, title: 'Grazie per il tuo ordine!', text: 'Il pagamento è stato confermato. Ti avviseremo quando l’ordine sarà in preparazione e quando partirà.' },
  captured: { subject: (n) => `Ordine #${n}: importo definitivo addebitato`, title: 'Pagamento completato', text: 'Abbiamo pesato i tuoi prodotti e addebitato l’importo definitivo, calcolato sul peso reale e mai superiore a quanto autorizzato.' },
  preparing: { subject: (n) => `Il tuo ordine #${n} è in preparazione`, title: 'Stiamo preparando il tuo ordine', text: 'I nostri casari stanno preparando i tuoi prodotti con cura.' },
  shipped: { subject: (n) => `Il tuo ordine #${n} è stato spedito`, title: 'Il tuo ordine è in viaggio', text: 'L’ordine è partito o è pronto per il ritiro, secondo il metodo di consegna scelto.' },
  cancelled: { subject: (n) => `Ordine #${n} annullato`, title: 'Ordine annullato', text: 'L’ordine è stato annullato. Se avevi già pagato, l’importo ti verrà restituito sul metodo di pagamento usato.' },
  refunded: { subject: (n) => `Rimborso per l’ordine #${n}`, title: 'Rimborso in corso', text: 'Abbiamo disposto un rimborso. I tempi di accredito dipendono dalla tua banca.' },
};

export async function orderEmailHtml(db: Db, orderId: string, kind: OrderMail) {
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!o) return null;
  const lines = await db.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, orderId));
  const rows = lines.map((l) => `<tr><td style="padding:6px 0;border-top:1px solid #e6dccb">${esc(l.nameSnapshot)}${l.weightGrams ? ` (${l.actualWeightGrams ?? l.weightGrams} g)` : ` × ${l.quantity}`}</td><td align="right" style="padding:6px 0;border-top:1px solid #e6dccb">${euro(l.lineTotalCents)}</td></tr>`).join('');
  const c = COPY[kind];
  const html = layout(c.title, `<p style="line-height:1.6">${esc(c.text)}</p>
<p><strong>Ordine #${o.number}</strong></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rows}
${o.discountCents > 0 ? `<tr><td style="padding:6px 0">Sconto</td><td align="right">−${euro(o.discountCents)}</td></tr>` : ''}
<tr><td style="padding:6px 0">Spedizione</td><td align="right">${o.shippingCents ? euro(o.shippingCents) : 'gratis'}</td></tr>
<tr><td style="padding:10px 0;border-top:2px solid #231f20"><strong>Totale</strong></td><td align="right" style="border-top:2px solid #231f20"><strong>${euro(o.totalCents)}</strong></td></tr></table>
${btn(`${siteUrl}/shop`, 'Torna allo shop')}`);
  return { to: o.email, subject: c.subject(o.number), html, order: o };
}

/** Email al cliente (e, per i nuovi ordini, avviso all'amministratore). Non solleva mai errori: un'email persa non deve bloccare l'ordine. */
export async function notifyOrder(db: Db, orderId: string, kind: OrderMail) {
  try {
    const m = await orderEmailHtml(db, orderId, kind);
    if (!m) return;
    await sendMail(m.to, m.subject, m.html);
    if (kind === 'paid') {
      const admin = process.env.ADMIN_NOTIFY_EMAIL || import.meta.env?.ADMIN_NOTIFY_EMAIL || business.email;
      await sendMail(admin, `Nuovo ordine #${m.order.number} — ${euro(m.order.totalCents)}`,
        layout('Nuovo ordine ricevuto', `<p>Ordine <strong>#${m.order.number}</strong> di ${esc(m.order.email)} per ${euro(m.order.totalCents)}.</p>${btn(`${siteUrl}/admin/ordini/${m.order.id}`, 'Apri nel gestionale')}`));
    }
  } catch (e) {
    console.error('[email] notifyOrder', e);
  }
}

export const resetEmail = (link: string) =>
  layout('Reimposta la password', `<p style="line-height:1.6">Abbiamo ricevuto una richiesta di reimpostazione della password per l’area riservata. Il link è valido per 30 minuti e può essere usato una sola volta.</p>${btn(link, 'Scegli una nuova password')}<p style="font-size:12px;color:#5b5455">Se non sei stato tu, ignora questa email: la tua password non cambierà.</p>`);
