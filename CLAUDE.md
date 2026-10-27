# Lattai Ponticorvo — sito, shop, menù digitale e gestionale

Astro 7 (SSR) · TypeScript · Tailwind 4 · React solo per carrello/checkout · Postgres (Drizzle ORM) · Stripe · Resend.
Istruzioni per gli agenti sull'avvio del dev server: vedi `AGENTS.md`. Documentazione completa: `README.md`.

## Comandi
- `npm run dev` (o `astro dev --background`): sito su http://localhost:4321
- `npm test` (Vitest) · `npm run typecheck` (`tsc --noEmit`) · `npm run build`
- `npm run db:migrate` / `db:seed` / `db:import-old`: database (PGlite locale in `.data/` se `DATABASE_URL` è vuoto)

## Struttura
- `src/pages/` pagine e API (tutte SSR); `src/layouts/` (`Base` = head/SEO, `PageShell` = pagine di testo, `Admin`)
- `src/components/` componenti Astro; `src/components/react/` solo carrello e checkout
- `src/lib/` logica (ordini, prezzi, auth, media, `site.ts` = dati aziendali e orari)
- `src/db/schema.ts` schema Drizzle; migrazioni in `drizzle/`
- `public/brand/` logo (`logo.svg`/`logo.png` trasparenti, `mark.svg` = solo il simbolo); favicon in `public/`
- `uploads/` foto del sito e del menù, servite da `/media/...` (`src/pages/media/[...path].ts`)

## Convenzioni
- Testi e commenti in italiano; tono semplice e diretto.
- Foto: ogni file ha tre misure (piena 1600 px, `-md` 960 px, `-sm` 640 px) con le stesse proporzioni dell'originale. Se rigeneri le varianti, incrementa `V` in `src/lib/media.ts`: `/media` risponde con cache `immutable` di un anno.
- Immagini nelle pagine: usa `mediaAttrs()` / `photoAttrs()` (srcset responsive) e indica sempre `alt`, `width`, `height`.
- Video: `LoopVideo` (muto, con pulsante di pausa). Il video del caseificio è verticale (9:16).
- Gallerie: `Gallery` (griglia) e `GalleryCarousel` (scorrimento orizzontale con ingrandimento).
- SEO/GEO: titoli e JSON-LD si impostano in `Base`/`PageShell`; `sitemap.xml`, `robots.txt`, `llms.txt` e `llms-full.txt` sono generati da `src/pages/*.ts`. Dopo aver aggiunto o tolto una pagina pubblica, aggiorna `STATIC` in `src/pages/sitemap.xml.ts`.
- Il menù (`/menu`) e lo shop condividono la tabella `items` (flag `in_menu` / `in_shop`).

## Attenzione
- La sezione News è stata rimossa dal sito; la tabella `posts` resta nel database (usata solo da `scripts/import-old-site.mjs`).
- Mai committare `.env`, `.data/` o chiavi Stripe/Resend. Variabili: vedi `.env.example`.
- In produzione servono `DATABASE_URL` (Postgres), `SITE_URL` (dominio pubblico, per il controllo CSRF) e `UPLOAD_DIR` su un volume persistente.
