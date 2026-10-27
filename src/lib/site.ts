export interface Hours { label: string; value: string; days: string[]; opens: string; closes: string }
export interface Business {
  name: string; legalName: string; vat: string; tagline: string; phone: string; phoneTel: string; email: string;
  address: { street: string; zip: string; city: string; province: string; country: string };
  hours: Hours[];
  social: { instagram: string; tiktok: string; facebook: string };
}

/** Valori di partenza. Gli stessi campi si modificano da /admin/impostazioni (salvati nella tabella `settings`). */
export const business: Business = {
  name: 'Lattai Ponticorvo',
  legalName: 'Lattai Ponticorvo S.r.l. Società Unipersonale',
  vat: '04851820615',
  tagline: 'Casari dal 1968',
  phone: '0823 869 549',
  phoneTel: '+390823869549',
  email: 'info@lattaiponticorvo.it',
  address: { street: 'SP 66 SNC LOC Ponte dei Briganti', zip: '81012', city: 'Alvignano', province: 'CE', country: 'IT' },
  hours: [
    { label: 'Lunedì – Sabato', value: '6:30 – 20:00 (orario continuato)', days: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], opens: '06:30', closes: '20:00' },
    { label: 'Domenica', value: '7:00 – 14:30', days: ['Su'], opens: '07:00', closes: '14:30' },
  ],
  social: {
    instagram: 'https://www.instagram.com/lattaiponticorvo?vrfl=bzNnMm0weDQ1dXdm',
    tiktok: 'https://www.tiktok.com/@lattaiponticorvo?_r=1&_t=ZN-9AgNYKsVkd4',
    facebook: 'https://www.facebook.com/share/1bmjkH2p9T/?mibextid=wwXIfr',
  },
};

export const siteUrl = (import.meta.env.SITE_URL ?? 'https://lattaiponticorvo.com').replace(/\/$/, '');

export const menuNotes = {
  headline: 'Il prezzo varia in base al peso della porzione.',
  footnote:
    'I prezzi dei prodotti sono calcolati in base al peso effettivo delle porzioni. Per maggiori informazioni, rivolgiti al nostro personale.',
};
