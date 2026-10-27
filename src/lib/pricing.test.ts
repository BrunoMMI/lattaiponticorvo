import { describe, expect, it } from 'vitest';
import { couponDiscount, priceLine, PricingError, shippingCost, type PricedItem, type PricedVariant } from './pricing';

const base: PricedItem = { id: 'i1', name: 'Provola', sellUnit: 'piece', priceCents: 450, salePriceCents: null, vatRate: '4.00', variableWeight: false, weightStepGrams: 100, stockQty: 10, shopCategoryId: null };
const kg: PricedItem = { ...base, id: 'i2', name: 'Caciocavallo', sellUnit: 'kg', priceCents: 1890, stockQty: 5000 };

describe('priceLine', () => {
  it('pezzo: prezzo × quantità', () => {
    expect(priceLine(base, null, { itemId: 'i1', quantity: 3 })).toMatchObject({ lineTotalCents: 1350, stockUnits: 3, available: 10 });
  });
  it('usa il prezzo promozionale', () => {
    expect(priceLine({ ...base, salePriceCents: 400 }, null, { itemId: 'i1', quantity: 2 }).lineTotalCents).toBe(800);
  });
  it('al kg senza variante: la quantità è in grammi e il totale è arrotondato', () => {
    const l = priceLine({ ...kg, weightStepGrams: 50 }, null, { itemId: 'i2', quantity: 350 });
    expect(l).toMatchObject({ lineTotalCents: 662, stockUnits: 350, weightGrams: 350 }); // 18,90 × 0,35 = 6,615 → 6,62
  });
  it('al kg: rifiuta pesi non multipli dello step', () => {
    expect(() => priceLine(kg, null, { itemId: 'i2', quantity: 150 })).toThrow(PricingError);
  });
  it('al kg con variante: prezzo derivato dal peso, scarica grammi dall’articolo', () => {
    const v: PricedVariant = { id: 'v1', label: '500 g', weightGrams: 500, priceCents: null, stockQty: 0 };
    expect(priceLine(kg, v, { itemId: 'i2', variantId: 'v1', quantity: 2 })).toMatchObject({ unitPriceCents: 945, lineTotalCents: 1890, stockUnits: 1000, stockSource: 'item', available: 10 });
  });
  it('variante con prezzo proprio su pezzo: scala dallo stock della variante', () => {
    const v: PricedVariant = { id: 'v2', label: 'Confezione 3 pz', weightGrams: null, priceCents: 1200, stockQty: 4 };
    expect(priceLine(base, v, { itemId: 'i1', variantId: 'v2', quantity: 2 })).toMatchObject({ lineTotalCents: 2400, stockSource: 'variant', available: 4 });
  });
  it('rifiuta quantità non valide e prodotti senza prezzo', () => {
    expect(() => priceLine(base, null, { itemId: 'i1', quantity: 0 })).toThrow('Quantità');
    expect(() => priceLine(base, null, { itemId: 'i1', quantity: 1.5 })).toThrow('Quantità');
    expect(() => priceLine({ ...base, priceCents: null }, null, { itemId: 'i1', quantity: 1 })).toThrow('non è acquistabile');
  });
});

describe('couponDiscount', () => {
  const lines = [{ ...priceLine(base, null, { itemId: 'i1', quantity: 2 }), categoryId: 'c1' }, { ...priceLine(kg, null, { itemId: 'i2', quantity: 1000 }), categoryId: 'c2' }];
  const c = { code: 'X', percentOff: null, amountOffCents: null, categoryId: null, startsAt: null, endsAt: null, maxUses: null, usedCount: 0, active: true };
  it('percentuale su tutto il carrello', () => expect(couponDiscount({ ...c, percentOff: 10 }, lines)).toBe(279)); // 10% di 2790
  it('importo fisso non supera il totale', () => expect(couponDiscount({ ...c, amountOffCents: 99_999 }, lines)).toBe(2790));
  it('limitato a una categoria', () => expect(couponDiscount({ ...c, percentOff: 10, categoryId: 'c1' }, lines)).toBe(90));
  it('scaduto, esaurito o inattivo', () => {
    expect(() => couponDiscount({ ...c, percentOff: 10, endsAt: new Date('2020-01-01') }, lines)).toThrow('scaduto');
    expect(() => couponDiscount({ ...c, percentOff: 10, maxUses: 1, usedCount: 1 }, lines)).toThrow('esaurito');
    expect(() => couponDiscount({ ...c, percentOff: 10, active: false }, lines)).toThrow();
  });
});

describe('shippingCost', () => {
  const d = { kind: 'delivery' as const, priceCents: 690, freeOverCents: 5000, zones: ['CE', 'NA'] };
  it('ritiro in sede gratuito', () => expect(shippingCost({ ...d, kind: 'pickup' }, 100)).toBe(0));
  it('costo standard, gratuito sopra soglia', () => {
    expect(shippingCost(d, 3000, { province: 'ce' })).toBe(690);
    expect(shippingCost(d, 5000, { province: 'CE' })).toBe(0);
  });
  it('fuori zona rifiutato; zona vuota = ovunque', () => {
    expect(() => shippingCost(d, 3000, { province: 'MI' })).toThrow('non è disponibile');
    expect(shippingCost({ ...d, zones: [] }, 3000, { province: 'MI' })).toBe(690);
  });
});

import { applyActualWeights } from './pricing';
describe('applyActualWeights', () => {
  const lines = [{ id: 'a', weightGrams: 1000, lineTotalCents: 2000 }, { id: 'b', weightGrams: null, lineTotalCents: 500 }];
  const order = { discountCents: 0, shippingCents: 600, authorizedCents: 3100 };
  it('ricalcola in proporzione al peso reale e lascia invariate le altre righe', () => {
    const r = applyActualWeights(lines, { a: 940 }, order);
    expect(r.lines[0]).toMatchObject({ lineTotalCents: 1880, actualWeightGrams: 940 });
    expect(r.totalCents).toBe(1880 + 500 + 600);
  });
  it('NON permette di addebitare più dell\u2019autorizzato', () => {
    expect(() => applyActualWeights(lines, { a: 1200 }, order)).toThrow('supera l\u2019importo autorizzato');
  });
  it('rifiuta pesi non validi o su righe senza peso', () => {
    expect(() => applyActualWeights(lines, { a: 0 }, order)).toThrow('non valido');
    expect(() => applyActualWeights(lines, { b: 100 }, order)).toThrow('non ha un peso');
  });
  it('applica lo sconto sul nuovo totale', () => {
    expect(applyActualWeights(lines, { a: 500 }, { ...order, discountCents: 100 }).totalCents).toBe(1000 + 500 - 100 + 600);
  });
});
