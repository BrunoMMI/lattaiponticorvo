const TZ = 'Europe/Rome';
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });

export const romeYmd = (d: Date) => ymdFmt.format(d);

/** Mezzanotte italiana (con ora legale corretta) del giorno "YYYY-MM-DD". */
export function romeMidnight(ymd: string): Date {
  for (const off of ['+01:00', '+02:00']) {
    const d = new Date(`${ymd}T00:00:00${off}`);
    if (!Number.isNaN(d.getTime()) && romeYmd(d) === ymd && hourFmt.format(d) === '00') return d;
  }
  throw new Error(`Data non valida: ${ymd}`);
}

export const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Periodo [from, to) a partire dai parametri dell'URL: ultimi N giorni oppure intervallo personalizzato. */
export function periodFromQuery(q: URLSearchParams, now = new Date()) {
  const today = romeYmd(now);
  const dal = q.get('dal'), al = q.get('al');
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (dal && al && re.test(dal) && re.test(al) && dal <= al) {
    const span = (Date.parse(al) - Date.parse(dal)) / 86_400_000;
    if (span <= 731) return { key: 'custom', label: `${dal} → ${al}`, from: romeMidnight(dal), to: romeMidnight(addDays(al, 1)) };
  }
  const days = [7, 30, 90, 365].includes(Number(q.get('giorni'))) ? Number(q.get('giorni')) : 30;
  return { key: String(days), label: `Ultimi ${days} giorni`, from: romeMidnight(addDays(today, -(days - 1))), to: romeMidnight(addDays(today, 1)) };
}
