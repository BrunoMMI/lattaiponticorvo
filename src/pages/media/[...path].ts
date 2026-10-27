import type { APIRoute } from 'astro';
import { createReadStream, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { Readable } from 'node:stream';

export const prerender = false;
const ROOT = resolve(process.env.UPLOAD_DIR ?? './uploads');
const TYPES: Record<string, string> = {
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};
const notFound = () => new Response('Not found', { status: 404 });

export const GET: APIRoute = ({ params, request }) => {
  const file = resolve(ROOT, params.path ?? '');
  const type = TYPES[extname(file).toLowerCase()];
  if (!file.startsWith(ROOT + sep) || !type) return notFound();
  let size: number;
  try {
    const st = statSync(file);
    if (!st.isFile()) return notFound();
    size = st.size;
  } catch {
    return notFound();
  }
  const headers: Record<string, string> = {
    'Content-Type': type, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  // Range: i browser lo richiedono per i video (obbligatorio per Safari/iOS) e per riprendere i download.
  const range = request.headers.get('range');
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start = m && m[1] !== '' ? parseInt(m[1], 10) : NaN;
    let end = m && m[2] !== '' ? parseInt(m[2], 10) : NaN;
    if (!m || (Number.isNaN(start) && Number.isNaN(end))) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    if (Number.isNaN(start)) { start = Math.max(size - end, 0); end = size - 1; } // "bytes=-N": ultimi N byte
    else if (Number.isNaN(end) || end >= size) end = size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, {
      status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { ...headers, 'Content-Length': String(size) } });
};
