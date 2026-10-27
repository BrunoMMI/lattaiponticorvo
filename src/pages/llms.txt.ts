import type { APIRoute } from 'astro';
import { business as b, siteUrl } from '../lib/site';

export const prerender = false;
/** Riassunto leggibile da sistemi di ricerca basati su AI. Contiene solo fatti già pubblici sul sito. */
export const GET: APIRoute = () =>
  new Response(`# ${b.name}

> Caseificio artigianale ad ${b.address.city} (${b.address.province}), "${b.tagline}". Tre generazioni di mastri casari. Vendita online di prodotti caseari e locale con menù digitale.

- Ragione sociale: ${b.legalName} (P.IVA ${b.vat})
- Indirizzo: ${b.address.street}, ${b.address.zip} ${b.address.city} (${b.address.province})
- Telefono: ${b.phone} · Email: ${b.email}
- Orari: ${b.hours.map((h) => `${h.label} ${h.value}`).join('; ')}

## In breve
- Fondato nel 1968 da nonno Antonino (Piano di Sorrento); oggi guidato da Luca Ponticorvo e dal figlio Antonino.
- Prodotti: Mozzarella di Bufala Campana DOP, fiordilatte, burrata, ricotta, caciocavalli, provole e scamorze.
- Certificazioni dichiarate: Mozzarella di Bufala Campana DOP, Halal, BRC.
- Struttura di 1.500 mq; abbattimento a −40 °C nel giorno di produzione; shelf-life 365 giorni per i prodotti frozen.
- Punto vendita con selezione gastronomica e locale con menù digitale (prezzi in base al peso della porzione).

## Pagine principali
- [Chi siamo](${siteUrl}/chi-siamo): storia della famiglia Ponticorvo dal 1968
- [Il caseificio](${siteUrl}/il-caseificio): struttura e lavorazione
- [La produzione](${siteUrl}/produzione): come nasce la mozzarella, dal latte alla filiera del freddo
- [Il punto vendita](${siteUrl}/punto-vendita): prodotti del caseificio e selezione gastronomica
- [Per le aziende](${siteUrl}/per-le-aziende): forniture per ristorazione e rivendite, shelf-life 365 giorni
- [Versione completa per sistemi AI](${siteUrl}/llms-full.txt)
- [Shop](${siteUrl}/shop): prodotti acquistabili online
- [Menù del locale](${siteUrl}/menu): piatti serviti nel locale (prezzi in base al peso della porzione)
- [FAQ](${siteUrl}/faq)
- [Contatti](${siteUrl}/contatti)
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
