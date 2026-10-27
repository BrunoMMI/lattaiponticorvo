export type Role = 'owner' | 'manager' | 'staff';

/** Aree consentite ai collaboratori; il titolare vede tutto, il gestore tutto tranne la gestione utenti. */
const STAFF_OK = ['/admin/ordini', '/admin/magazzino', '/admin/menu', '/admin/sicurezza', '/admin/logout'];

export function roleAllows(role: Role, path: string) {
  if (role === 'owner') return true;
  if (role === 'manager') return !(path === '/admin/utenti' || path.startsWith('/admin/utenti/'));
  return STAFF_OK.some((p) => path === p || path.startsWith(p + '/'));
}
