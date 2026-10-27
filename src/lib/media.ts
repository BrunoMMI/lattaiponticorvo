/** Ogni foto ha tre misure: piena (max 1600 px), `-md.webp` (960 px) e `-sm.webp` (640 px): il browser sceglie in base a schermo e densità. */
export const smPath = (path: string) => path.replace(/\.webp$/, '-sm.webp');
export const mdPath = (path: string) => path.replace(/\.webp$/, '-md.webp');

/** Versione delle varianti: da incrementare se i file -sm/-md vengono rigenerati (le foto sono servite come immutable). */
const V = '?v=2';

/** Attributi <img> responsive: sui telefoni e nelle schede viene scaricata la versione leggera. */
export function mediaAttrs(path: string, sizes: string) {
  return { src: `/media/${mdPath(path)}${V}`, srcset: `/media/${smPath(path)}${V} 640w, /media/${mdPath(path)}${V} 960w, /media/${path}${V} 1600w`, sizes };
}
