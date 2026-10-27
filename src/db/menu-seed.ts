/**
 * Voci del menù trascritte dall'immagine fornita dal cliente (11 voci, nessuna categoria, nessun prezzo).
 * `photos`: abbinamenti foto→piatto dedotti da ciò che si vede nelle foto; il primo è la copertina.
 * `guess`: abbinamento incerto, da far confermare al cliente.
 */
export const menuSeed: { name: string; description: string; photos: string[]; guess?: boolean }[] = [
  { name: 'Mortadella, mozzarella e granella di pistacchio', description: '', photos: ['mgs1508', 'mgs1511', 'mgs1527', 'mgs1534', 'mgs1537'] },
  { name: 'Prosciutto e mozzarella', description: '', photos: ['mgs1498', 'mgs1730', 'mgs1747'], guess: true },
  { name: 'Bresaola, rucola, pomodorini, scaglie di parmigiano e ciliegine di bufala', description: '', photos: ['mgs1657', 'mgs1634', 'mgs1640', 'mgs1659', 'mgs1664'] },
  { name: 'Tagliere salumi e formaggi misti con mozzarella di bufala', description: '', photos: ['e47a9873', 'e47a9876', 'e47a9882'] },
  { name: 'Pancetta alla zingara', description: 'Pancetta con provola affumicata cotta alla piastra.', photos: ['e47a0175', 'e47a0173'] },
  { name: 'Provola affumicata alla pizzaiola', description: '', photos: ['bro08361', 'bro08364', 'bro08367'] },
  { name: 'Pane cafone', description: '2 fette di pane tostato con prosciutto, rucola, pomodorini e mozzarella di bufala.', photos: ['mgs1810', 'mgs1753', 'mgs1817', 'mgs1831', 'mgs1832'], guess: true },
  { name: 'Panini piastrati', description: 'Con salumi a scelta e contorno a scelta tra rucola, pomodorini, sott\u2019oli.', photos: ['mgs1720', 'mgs1717', 'mgs1727'], guess: true },
  { name: 'Caprese', description: 'Pomodoro e mozzarella.', photos: ['bro08354', 'bro08351', 'bro08358'] },
  { name: 'Insalatona', description: 'Insalata mista, pomodorini, sott\u2019oli.', photos: [] },
  { name: 'Tonno e ciliegine di bufala', description: '', photos: [] },
];
