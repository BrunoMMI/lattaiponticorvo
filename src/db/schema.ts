import { sql } from 'drizzle-orm';
import {
  boolean, check, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const sellUnit = pgEnum('sell_unit', ['piece', 'kg', 'fixed_weight', 'pack']);
export const orderStatus = pgEnum('order_status', ['pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded']);
export const paymentStatus = pgEnum('payment_status', ['requires_payment', 'authorized', 'succeeded', 'failed', 'refunded', 'partially_refunded']);
export const adminRole = pgEnum('admin_role', ['owner', 'manager', 'staff']);

/* ───────── Autenticazione ───────── */
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: adminRole('role').notNull().default('staff'),
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('users_email_uq').on(sql`lower(${t.email})`)]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // hash SHA-256 del token
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  pendingTotp: boolean('pending_totp').notNull().default(false),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

export const passwordResets = pgTable('password_resets', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/* ───────── Catalogo condiviso shop + menù ─────────
   Un unico `items`: i flag inShop / inMenu decidono dove compare, senza duplicati.
   I campi menu* sono override opzionali valorizzati solo per il menù. */
export const categories = pgTable('categories', {
  id: id(),
  scope: text('scope').notNull(), // 'shop' | 'menu'
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  published: boolean('published').notNull().default(true),
}, (t) => [uniqueIndex('categories_scope_slug_uq').on(t.scope, t.slug)]);

export const media = pgTable('media', {
  id: id(),
  path: text('path').notNull(),
  alt: text('alt').notNull().default(''),
  mime: text('mime').notNull(),
  width: integer('width'),
  height: integer('height'),
  createdAt: createdAt(),
});

export const items = pgTable('items', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  sku: text('sku'),
  shortDescription: text('short_description').notNull().default(''),
  description: text('description').notNull().default(''),
  ingredients: text('ingredients').notNull().default(''),
  allergens: text('allergens').array().notNull().default(sql`'{}'::text[]`),
  nutrition: jsonb('nutrition'),
  storage: text('storage'),
  imageId: uuid('image_id').references(() => media.id, { onDelete: 'set null' }),
  shopCategoryId: uuid('shop_category_id').references(() => categories.id, { onDelete: 'set null' }),
  menuCategoryId: uuid('menu_category_id').references(() => categories.id, { onDelete: 'set null' }),
  inShop: boolean('in_shop').notNull().default(false),
  inMenu: boolean('in_menu').notNull().default(false),
  published: boolean('published').notNull().default(false),
  featured: boolean('featured').notNull().default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  // vendita
  sellUnit: sellUnit('sell_unit').notNull().default('piece'),
  priceCents: integer('price_cents'),        // per unità di vendita (o €/kg se sellUnit = kg)
  salePriceCents: integer('sale_price_cents'),
  vatRate: numeric('vat_rate', { precision: 4, scale: 2 }).notNull().default('4.00'),
  variableWeight: boolean('variable_weight').notNull().default(false),
  weightStepGrams: integer('weight_step_grams').notNull().default(100), // incremento selezionabile per i prodotti al kg
  stockQty: integer('stock_qty').notNull().default(0), // grammi se kg, altrimenti pezzi
  lowStockThreshold: integer('low_stock_threshold').notNull().default(0),
  expiresOn: text('expires_on'),
  // menù
  menuAvailable: boolean('menu_available').notNull().default(true),
  menuSpecial: boolean('menu_special').notNull().default(false),
  menuSortOrder: integer('menu_sort_order').notNull().default(0),
  menuPricePerKgCents: integer('menu_price_per_kg_cents'), // predisposto: oggi nullo, il menù non mostra prezzi
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('items_slug_uq').on(t.slug),
  index('items_flags_idx').on(t.published, t.inShop, t.inMenu),
  check('items_stock_nonneg', sql`${t.stockQty} >= 0`),
]);

export const itemImages = pgTable('item_images', {
  id: id(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  mediaId: uuid('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0), // 0 = copertina
}, (t) => [index('item_images_item_idx').on(t.itemId, t.sortOrder)]);

export const itemVariants = pgTable('item_variants', {
  id: id(),
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  weightGrams: integer('weight_grams'),
  priceCents: integer('price_cents'),
  sku: text('sku'),
  stockQty: integer('stock_qty').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [check('variants_stock_nonneg', sql`${t.stockQty} >= 0`)]);

export const stockMovements = pgTable('stock_movements', {
  id: id(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  variantId: uuid('variant_id').references(() => itemVariants.id),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(), // load | unload | sale | refund | adjustment
  orderId: uuid('order_id'),
  userId: uuid('user_id').references(() => users.id),
  note: text('note'),
  createdAt: createdAt(),
}, (t) => [index('stock_movements_item_idx').on(t.itemId, t.createdAt)]);

/* ───────── Clienti e ordini ───────── */
export const customers = pgTable('customers', {
  id: id(),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  name: text('name').notNull().default(''),
  phone: text('phone'),
  marketingConsent: boolean('marketing_consent').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('customers_email_uq').on(sql`lower(${t.email})`)]);

export const addresses = pgTable('addresses', {
  id: id(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  line1: text('line1').notNull(), city: text('city').notNull(), zip: text('zip').notNull(),
  province: text('province').notNull(), country: text('country').notNull().default('IT'),
});

export const customerSessions = pgTable('customer_sessions', {
  id: text('id').primaryKey(), // hash SHA-256 del token
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => [index('customer_sessions_customer_idx').on(t.customerId)]);

/** Token monouso inviato via email: serve sia a creare l'account (dimostra il possesso dell'email) sia a recuperare la password. */
export const customerTokens = pgTable('customer_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  customerId: uuid('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const shippingMethods = pgTable('shipping_methods', {
  id: id(),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // pickup | delivery
  priceCents: integer('price_cents').notNull().default(0),
  freeOverCents: integer('free_over_cents'),
  zones: text('zones').array().notNull().default(sql`'{}'::text[]`), // province o CAP, vuoto = ovunque
  etaText: text('eta_text'),
  active: boolean('active').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const coupons = pgTable('coupons', {
  id: id(),
  code: text('code').notNull(),
  percentOff: integer('percent_off'),
  amountOffCents: integer('amount_off_cents'),
  categoryId: uuid('category_id').references(() => categories.id),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  active: boolean('active').notNull().default(true),
}, (t) => [uniqueIndex('coupons_code_uq').on(sql`upper(${t.code})`)]);

export const orders = pgTable('orders', {
  id: id(),
  number: integer('number').notNull().generatedAlwaysAsIdentity({ startWith: 1001 }),
  customerId: uuid('customer_id').references(() => customers.id),
  email: text('email').notNull(),
  status: orderStatus('status').notNull().default('pending'),
  paymentStatus: paymentStatus('payment_status').notNull().default('requires_payment'),
  shippingMethodId: uuid('shipping_method_id').references(() => shippingMethods.id),
  shippingAddress: jsonb('shipping_address'),
  billingAddress: jsonb('billing_address'),
  subtotalCents: integer('subtotal_cents').notNull(),
  discountCents: integer('discount_cents').notNull().default(0),
  shippingCents: integer('shipping_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  authorizedCents: integer('authorized_cents'), // tetto addebitabile per prodotti a peso variabile
  couponCode: text('coupon_code'),
  stripeSessionId: text('stripe_session_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  internalNote: text('internal_note'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('orders_number_uq').on(t.number), index('orders_status_idx').on(t.status, t.createdAt)]);

export const orderLines = pgTable('order_lines', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
  variantId: uuid('variant_id'),
  // snapshot: lo storico non cambia se il prodotto viene modificato o archiviato
  nameSnapshot: text('name_snapshot').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  vatRate: numeric('vat_rate', { precision: 4, scale: 2 }).notNull(),
  quantity: integer('quantity').notNull(), // pezzi, oppure grammi se venduto al kg
  weightGrams: integer('weight_grams'),
  actualWeightGrams: integer('actual_weight_grams'),
  lineTotalCents: integer('line_total_cents').notNull(),
  stockUnits: integer('stock_units').notNull().default(0), // quanto è stato scalato dal magazzino (pezzi o grammi), per poterlo ripristinare
});

export const payments = pgTable('payments', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  provider: text('provider').notNull().default('stripe'),
  providerRef: text('provider_ref').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: paymentStatus('status').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('payments_provider_ref_uq').on(t.provider, t.providerRef)]);

export const refunds = pgTable('refunds', {
  id: id(),
  paymentId: uuid('payment_id').notNull().references(() => payments.id),
  amountCents: integer('amount_cents').notNull(),
  reason: text('reason'),
  providerRef: text('provider_ref'),
  createdAt: createdAt(),
});

/** Eventi webhook già processati → idempotenza. */
export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ───────── Contenuti e impostazioni ───────── */
export const siteContent = pgTable('site_content', {
  key: text('key').primaryKey(), // es. home.hero.title
  value: text('value').notNull(),
  updatedAt: updatedAt(),
});

export const settings = pgTable('settings', {
  key: text('key').primaryKey(), // es. menu.priceNote, business.hours
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
});

/** Notizie e articoli del sito (/news). */
export const posts = pgTable('posts', {
  id: id(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  excerpt: text('excerpt').notNull().default(''),
  body: text('body').notNull().default(''),
  imageId: uuid('image_id').references(() => media.id, { onDelete: 'set null' }),
  published: boolean('published').notNull().default(false),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex('posts_slug_uq').on(t.slug), index('posts_pub_idx').on(t.published, t.publishedAt)]);

export const auditLog = pgTable('audit_log', {
  id: id(),
  userId: uuid('user_id').references(() => users.id),
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  meta: jsonb('meta'),
  createdAt: createdAt(),
});
export type User = typeof users.$inferSelect;

export type Customer = typeof customers.$inferSelect;
