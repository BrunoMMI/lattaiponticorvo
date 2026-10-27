export const STATUS_LABELS = {
  pending: 'In attesa di pagamento',
  paid: 'Da preparare',
  preparing: 'In preparazione',
  shipped: 'Spedito',
  delivered: 'Consegnato',
  cancelled: 'Annullato',
  refunded: 'Rimborsato',
} as const;

export const PAYMENT_LABELS = {
  requires_payment: 'Da pagare',
  authorized: 'Autorizzato (da addebitare)',
  succeeded: 'Pagato',
  failed: 'Fallito',
  refunded: 'Rimborsato',
  partially_refunded: 'Rimborsato in parte',
} as const;
