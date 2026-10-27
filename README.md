# Lattai Ponticorvo — sito, shop, menù digitale e gestionale

Astro (SSR su Node) · TypeScript · Tailwind 4 · React solo per carrello/checkout · Postgres (Drizzle ORM) · Stripe · Resend.

## Avvio in locale
```bash
npm install
cp .env.example .env        # imposta almeno ADMIN_SETUP_TOKEN
npm run db:migrate          # crea il database locale (PGlite, cartella .data)
npm run db:seed             # SOLO sviluppo: carica le 11 voci del menù con le foto
npm run dev                 # http://localhost:4321
```
Poi apri `/admin/setup`, inserisci il codice `ADMIN_SETUP_TOKEN` e crea il primo amministratore.
Attiva la 2FA da **Admin → Sicurezza**.

## Contenuti del vecchio sito
`npm run db:import-old` importa dal vecchio sito WordPress (dati già salvati in `data/`): 4 categorie, **15 prodotti come bozze** (non pubblicati, giacenza 0, prezzi del vecchio listino da verificare) e 2 notizie. È idempotente e in produzione usa `DATABASE_URL`. Le foto sono già in `uploads/`.

## Cosa gestisci da /admin
Panoramica (vendite, grafici, export CSV) · Ordini · Clienti (richieste privacy) · Prodotti · Categorie · Magazzino · Spedizioni · Promozioni · News · Contenuti del sito (testi, banner, SEO) · Impostazioni (dati aziendali, orari, IVA) · Utenti · Menù digitale (con QR in PNG/SVG) · Sicurezza.

Ruoli: **titolare** (tutto), **gestore** (tutto tranne gli utenti), **collaboratore** (solo ordini, magazzino, menù).
Area clienti su `/account`: la password si imposta da un link inviato via email; ordini, esportazione e cancellazione dei dati personali.
Lo **shop parte vuoto**: i prodotti li inserisce il titolare. Il **menù** è indipendente dallo shop (flag `in_menu` / `in_shop` sulla stessa tabella `items`, senza duplicati).

## Stripe (test)
1. Metti `STRIPE_SECRET_KEY=sk_test_...` nel `.env`.
2. In un altro terminale: `stripe listen --forward-to localhost:4321/api/stripe/webhook` e copia `whsec_...` in `STRIPE_WEBHOOK_SECRET`.
3. Carta di prova: `4242 4242 4242 4242`.
Un ordine risulta pagato **solo** dopo il webhook firmato, mai dal ritorno alla pagina di conferma.

## Produzione
```bash
npm run build && npm run db:migrate && npm start    # server Node su PORT (default 4321)
```
- `DATABASE_URL` → Postgres gestito con backup automatici (es. Neon, Supabase, Railway).
- `UPLOAD_DIR` → volume persistente. Fai il backup di questa cartella insieme al database.
- `SITE_URL` deve coincidere con il dominio pubblico (serve al controllo CSRF).
- Dietro proxy/HTTPS: i cookie sono `Secure` in produzione.
- Il rate limit è in memoria: con più istanze serve uno store condiviso.
- Backup database: `pg_dump "$DATABASE_URL" > backup.sql` · ripristino: `psql "$DATABASE_URL" < backup.sql`.

## Test
`npm test` (prezzi, magazzino, concorrenza, webhook, statistiche, GDPR, permessi, date su Postgres reale in memoria) · `npm run typecheck`.
Per provare con un database separato: `PGLITE_DIR=.data/prova npm run db:migrate`.

## Da fare prima di pubblicare
- Far rivedere a un professionista Privacy, Cookie, Termini, Resi, Spedizioni (marcati *bozza*).
- Completare i segnaposto tra parentesi quadre nelle pagine legali (REA, PEC, termini di reso…).
- Inserire le foto reali (hero, caseificio, famiglia) e verificare gli abbinamenti foto→piatto del menù.
- Configurare almeno un metodo di consegna in Admin → Spedizioni.
