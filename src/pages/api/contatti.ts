import type { APIRoute } from 'astro';
import { z } from 'zod';
import { esc, layout, sendMail } from '../../lib/email';
import { business } from '../../lib/site';
import { tooMany } from '../../lib/ratelimit';

export const prerender = false;
const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(160),
  message: z.string().trim().min(10).max(2000),
  phone: z.string().trim().max(30).optional(),
  request: z.enum(['info', 'assistenza', 'rivendita']).default('info'),
  privacy: z.string(),
  website: z.string().max(0).optional(), // honeypot: i bot lo compilano
});

export const POST: APIRoute = async ({ request, redirect, clientAddress }) => {
  if (tooMany(`contact:${clientAddress}`, 4, 30 * 60_000)) return redirect('/contatti?errore=invio');
  const f = Object.fromEntries(await request.formData());
  const p = schema.safeParse(f);
  if (!p.success) return redirect(f.website ? '/contatti?inviato=1' : '/contatti?errore=dati'); // ai bot si risponde "ok" senza inviare nulla
  const { name, email, message, phone, request: kind } = p.data;
  const kindLabel = { info: 'Informazioni', assistenza: 'Assistenza', rivendita: 'Rivendita / ristorazione / distribuzione' }[kind];
  const ok = await sendMail(business.email, `[${kindLabel}] Messaggio dal sito da ${name.replace(/[\r\n]/g, ' ')}`,
    layout('Nuovo messaggio dal sito', `<p><strong>${esc(name)}</strong> (${esc(email)}${phone ? `, tel. ${esc(phone)}` : ''})<br>Richiesta: ${esc(kindLabel)}</p><p style="white-space:pre-wrap">${esc(message)}</p>`));
  // In sviluppo (nessuna chiave Resend) il messaggio non parte: si mostra comunque l'esito come inviato solo se l'email è partita.
  return redirect(ok ? '/contatti?inviato=1' : '/contatti?errore=invio');
};
