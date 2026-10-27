import { describe, expect, it } from 'vitest';
import { addDays, periodFromQuery, romeMidnight, romeYmd } from './dates';

describe('date (fuso Europe/Rome)', () => {
  it('mezzanotte italiana con ora solare e legale', () => {
    expect(romeMidnight('2026-01-15').toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(romeMidnight('2026-07-15').toISOString()).toBe('2026-07-14T22:00:00.000Z');
  });
  it('cambio ora: il 25/10/2026 (fine ora legale) inizia a +02:00', () => {
    expect(romeMidnight('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(romeMidnight('2026-10-26').toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });
  it('un ordine alle 23:30 UTC è già il giorno dopo a Roma', () => expect(romeYmd(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02'));
  it('addDays attraversa mesi e anni', () => { expect(addDays('2026-12-31', 1)).toBe('2027-01-01'); expect(addDays('2026-03-01', -1)).toBe('2026-02-28'); });
  it('periodo di default 30 giorni, valori non ammessi ignorati', () => {
    const p = periodFromQuery(new URLSearchParams('giorni=9999'), new Date('2026-10-20T10:00:00Z'));
    expect(p.key).toBe('30'); expect(romeYmd(p.from)).toBe('2026-09-21');
  });
  it('intervallo personalizzato, con inversione o formato errato scartato', () => {
    expect(periodFromQuery(new URLSearchParams('dal=2026-10-01&al=2026-10-03')).key).toBe('custom');
    expect(periodFromQuery(new URLSearchParams('dal=2026-10-05&al=2026-10-03')).key).toBe('30');
    expect(periodFromQuery(new URLSearchParams("dal=x'--&al=y")).key).toBe('30');
  });
});
