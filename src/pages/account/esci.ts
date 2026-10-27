import type { APIRoute } from 'astro';
import { endCustomerSession } from '../../lib/customer-auth';

export const prerender = false;
export const POST: APIRoute = async ({ cookies, redirect }) => {
  await endCustomerSession(cookies);
  return redirect('/');
};
