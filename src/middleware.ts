import { defineMiddleware } from 'astro:middleware';
import { readSession } from './lib/auth';
import { readCustomer } from './lib/customer-auth';
import { refreshBusiness } from './lib/settings';
import { roleAllows } from './lib/permissions';

const PUBLIC_ACCOUNT = ['/account/accedi', '/account/registrati', '/account/password'];
const PUBLIC_ADMIN = ['/admin/login', '/admin/setup', '/admin/2fa', '/admin/password-dimenticata', '/admin/reset'];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  ctx.locals.user = null;
  ctx.locals.customer = null;

  if (pathname === '/account' || pathname.startsWith('/account/')) {
    ctx.locals.customer = await readCustomer(ctx.cookies);
    if (!ctx.locals.customer && !PUBLIC_ACCOUNT.includes(pathname)) return ctx.redirect('/account/accedi');
  }

  if (isAdmin) {
    const s = await readSession(ctx.cookies);
    ctx.locals.user = s && !s.session.pendingTotp ? s.user : null;
    if (!PUBLIC_ADMIN.includes(pathname) && !ctx.locals.user) {
      return ctx.redirect(s?.session.pendingTotp ? '/admin/2fa' : '/admin/login');
    }
    const u = ctx.locals.user;
    if (u && !PUBLIC_ADMIN.includes(pathname)) {
      if (u.role === 'staff' && pathname === '/admin') return ctx.redirect('/admin/ordini');
      if (pathname !== '/admin' && !roleAllows(u.role, pathname)) return new Response('Non hai i permessi per questa pagina.', { status: 403 });
    }
  }

  if (!pathname.startsWith('/media/')) await refreshBusiness().catch(() => {}); // un errore qui non deve mai bloccare le pagine
  const res = await next();
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isAdmin || pathname.startsWith('/account')) res.headers.set('Cache-Control', 'no-store');
  return res;
});
