import { mediaAttrs } from './media';
import extra from '../../data/site-photos.json';

/** Foto della struttura (cartella uploads/site). Gli alt descrivono solo ciò che si vede nella foto. */
export interface SitePhoto { file: string; w: number; h: number; alt: string }

const L = { w: 1600, h: 1067 }; // orizzontale
const P = { w: 1067, h: 1600 }; // verticale

export const photos = {
  facciata: { file: 'e47a9792', ...L, alt: 'Facciata del caseificio Lattai Ponticorvo con l’insegna sopra l’ingresso e il parcheggio' },
  ingresso: { file: 'e47a9796', ...L, alt: 'L’edificio del caseificio visto di lato, con l’insegna e le auto nel parcheggio' },
  paretePiccola: { file: 'e47a9753', ...L, alt: 'Parete del locale con la scritta “Gesti antichi da tre generazioni” e immagini della tradizione casearia' },
  sala: { file: 'e47a9745', ...L, alt: 'Sala del locale con tavoli bianchi, sedie e parquet chiaro' },
  salaAlto: { file: 'e47a9755', ...P, alt: 'Veduta dall’alto di un tavolo della sala attraverso il parapetto in vetro' },
  scala: { file: 'e47a9757', ...P, alt: 'Scala in legno e vetro con scaffali di prodotti tipici e la parete sulla storia della famiglia' },
  banco: { file: 'e47a9732', ...L, alt: 'Banco con vetrina refrigerata e scaffali di prodotti nel punto vendita' },
  interno: { file: 'e47a9764', ...L, alt: 'Interno del punto vendita con banco, vetrine e scaffali di prodotti' },
  personale: { file: 'e47a9774', ...L, alt: 'Il personale al lavoro dietro il banco del punto vendita' },
  yogurt: { file: 'e47a9778', ...L, alt: 'Scaffali in legno con il logo Lattai Ponticorvo e la macchina dello yogurt naturale' },
  caffe: { file: 'e47a9785', ...L, alt: 'Angolo caffetteria con macchina da caffè e scaffali di prodotti' },
  lavorazione: { file: 'e47a9825', ...L, alt: 'Banco di preparazione e vendita con il personale al lavoro' },
  panoramica1: { file: 'mgs1169', ...L, alt: 'Panoramica del punto vendita con scaffali, banco e scala' },
  panoramica2: { file: 'mgs1170', ...L, alt: 'Vista frontale del punto vendita con il banco e la parete con il logo' },
} satisfies Record<string, SitePhoto>;

/** Foto aggiuntive (produzione, allevamento, logistica, punto vendita) descritte in data/site-photos.json. */
export type ExtraPhoto = keyof typeof extra;
export const pic = (slug: ExtraPhoto): SitePhoto => ({ file: slug, ...extra[slug] });

export const photoAttrs = (p: SitePhoto, sizes: string) => ({ ...mediaAttrs(`site/${p.file}.webp`, sizes), alt: p.alt, width: p.w, height: p.h });
export const photoFull = (p: SitePhoto) => `/media/site/${p.file}.webp`;

export const videos = {
  film: { src: '/media/site/film-aziendale.mp4', poster: '/media/site/film-aziendale-poster.webp' },
  hero: { src: '/media/site/hero.mp4', poster: '/media/site/hero-poster.webp' },
  territorio: { src: '/media/site/territorio.mp4', poster: '/media/site/territorio-poster.webp' },
};
