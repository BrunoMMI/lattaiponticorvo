import type { APIRoute } from 'astro';
import { siteUrl } from '../lib/site';

export const prerender = false;
const BLOCKED = ['/admin', '/api/', '/account', '/carrello', '/checkout', '/ordine/'];
// Crawler di assistenti AI e motori di ricerca generativi: i contenuti pubblici possono essere citati.
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended'];
const rules = `Allow: /\n${BLOCKED.map((p) => `Disallow: ${p}`).join('\n')}\n`;

export const GET: APIRoute = () =>
  new Response(`User-agent: *\n${rules}\n${AI_BOTS.map((b) => `User-agent: ${b}\n${rules}`).join('\n')}\nSitemap: ${siteUrl}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
