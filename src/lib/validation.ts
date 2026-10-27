import { z } from 'zod';

export const cartLine = z.object({
  itemId: z.string().uuid(),
  variantId: z.string().uuid().nullish(),
  quantity: z.number().int().positive().max(100_000),
});
export const cartSchema = z.array(cartLine).min(1).max(60);

const address = z.object({
  line1: z.string().trim().min(3).max(160),
  city: z.string().trim().min(2).max(80),
  zip: z.string().trim().regex(/^\d{5}$/, 'CAP non valido'),
  province: z.string().trim().length(2).transform((s) => s.toUpperCase()),
});

export const quoteSchema = z.object({
  lines: cartSchema,
  couponCode: z.string().trim().max(40).optional(),
  shippingMethodId: z.string().uuid().optional(),
  dest: z.object({ province: z.string().max(2).optional(), zip: z.string().max(5).optional() }).optional(),
});

export const checkoutSchema = z.object({
  lines: cartSchema,
  couponCode: z.string().trim().max(40).optional(),
  shippingMethodId: z.string().uuid(),
  customer: z.object({
    email: z.string().trim().email().max(160),
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(30).optional(),
  }),
  shipping: address.nullable(), // null con ritiro in sede
  acceptTerms: z.literal(true, { message: 'Devi accettare termini e privacy.' }),
});
