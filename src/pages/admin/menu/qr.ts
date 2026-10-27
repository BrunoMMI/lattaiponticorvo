import type { APIRoute } from 'astro';
import QRCode from 'qrcode';
import { siteUrl } from '../../../lib/site';

export const prerender = false;
const URL_MENU = `${siteUrl}/menu`;

/** GET /admin/menu/qr?format=png|svg — QR ad alta risoluzione verso /menu (solo admin: protetto dal middleware). */
export const GET: APIRoute = async ({ url }) => {
  const fmt = url.searchParams.get('format') === 'svg' ? 'svg' : 'png';
  const opts = { errorCorrectionLevel: 'H' as const, margin: 4, color: { dark: '#231F20', light: '#FFFFFF' } };
  const headers = { 'Content-Disposition': `attachment; filename="qr-menu-lattai-ponticorvo.${fmt}"` };
  if (fmt === 'svg') return new Response(await QRCode.toString(URL_MENU, { ...opts, type: 'svg' }), { headers: { ...headers, 'Content-Type': 'image/svg+xml' } });
  return new Response(new Uint8Array(await QRCode.toBuffer(URL_MENU, { ...opts, width: 2400 })), { headers: { ...headers, 'Content-Type': 'image/png' } });
};
