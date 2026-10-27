import { useCart } from './cartStore';

export default function CartLink() {
  const lines = useCart();
  const n = lines.length;
  return (
    <a href="/carrello" className="relative btn btn-ghost !min-h-10 !px-4" aria-label={n ? `Carrello, ${n} ${n === 1 ? 'prodotto' : 'prodotti'}` : 'Carrello vuoto'}>
      <span aria-hidden="true">🛒</span> Carrello
      {n > 0 && <span className="ml-1 rounded-full bg-bordeaux-600 text-white text-xs min-w-5 h-5 grid place-items-center px-1" aria-hidden="true">{n}</span>}
    </a>
  );
}
