import { describe, expect, it } from 'vitest';
import { roleAllows } from './permissions';

describe('permessi per ruolo', () => {
  it('titolare: tutto', () => expect(['/admin/utenti', '/admin/impostazioni', '/admin/ordini'].every((p) => roleAllows('owner', p))).toBe(true));
  it('gestore: tutto tranne gli utenti', () => {
    expect(roleAllows('manager', '/admin/prodotti/abc')).toBe(true);
    expect(roleAllows('manager', '/admin/utenti')).toBe(false);
  });
  it('collaboratore: solo ordini, magazzino, menù, sicurezza', () => {
    for (const p of ['/admin/ordini', '/admin/ordini/123', '/admin/magazzino', '/admin/menu/qr', '/admin/sicurezza']) expect(roleAllows('staff', p)).toBe(true);
    for (const p of ['/admin/prodotti', '/admin/clienti', '/admin/impostazioni', '/admin/utenti', '/admin/contenuti', '/admin/promozioni', '/admin']) expect(roleAllows('staff', p)).toBe(false);
  });
  it('non si aggira con prefissi simili', () => { expect(roleAllows('staff', '/admin/ordini-segreti')).toBe(false); expect(roleAllows('manager', '/admin/utentiX')).toBe(true); });
});
