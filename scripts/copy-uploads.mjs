// Prima del build copia le foto e i video di uploads/ in public/media/: su Vercel vengono serviti dal CDN
// agli stessi indirizzi /media/... (in sviluppo e su Node li serve la route src/pages/media/[...path].ts).
import { cpSync, existsSync, rmSync } from 'node:fs';

if (!existsSync('./uploads')) { console.log('uploads/ non trovata: nessun file da copiare.'); process.exit(0); }
rmSync('./public/media', { recursive: true, force: true });
cpSync('./uploads', './public/media', { recursive: true });
console.log('uploads/ copiata in public/media/.');
