// Request contracts (docs/API.md §2–3). Validation happens here, at the boundary, and nowhere deeper.
import { z } from 'zod'
import { HttpError } from './errors.ts'

const cartLine = z.object({
  product_id: z.uuid(),
  quantity: z.number().int().min(1).max(20),
  modifier_ids: z.array(z.uuid()).max(30).default([]),
  note: z.string().max(280).optional(),
})

const delivery = z.object({
  zone_id: z.uuid(),
  street: z.string().trim().min(2).max(80),
  number: z.string().trim().min(1).max(12),
  floor_apt: z.string().trim().max(30).optional(),
  references: z.string().trim().max(140).optional(),
})

const schedule = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('asap') }),
  z.object({ mode: z.literal('scheduled'), at: z.iso.datetime({ offset: true }) }),
])

const orderShape = {
  items: z.array(cartLine).min(1).max(30),
  type: z.enum(['pickup', 'delivery', 'dine_in']),
  coupon_code: z.string().trim().min(1).max(40).optional(),
  delivery: delivery.optional(),
  table_number: z.number().int().min(1).max(999).optional(),
  schedule,
  tip: z.number().int().min(0).max(1_000_000).optional(),
}

type TypeRules = { type: 'pickup' | 'delivery' | 'dine_in'; delivery?: unknown; table_number?: unknown }
const requireTypeFields = (value: TypeRules, ctx: z.RefinementCtx): void => {
  if (value.type === 'delivery' && !value.delivery) {
    ctx.addIssue({ code: 'custom', path: ['delivery'], message: 'Completá la dirección de entrega.' })
  }
  if (value.type === 'dine_in' && value.table_number === undefined) {
    ctx.addIssue({ code: 'custom', path: ['table_number'], message: 'Falta el número de mesa.' })
  }
}

export const OrderInputSchema = z.object(orderShape).superRefine(requireTypeFields)

export const CreateOrderSchema = z
  .object({
    ...orderShape,
    idempotency_key: z.uuid(),
    customer: z.object({ name: z.string().trim().min(2).max(60), phone: z.string().trim().min(8).max(24) }),
    payment: z.object({
      method: z.enum(['mercado_pago', 'cash', 'transfer']),
      cash_paid_with: z.number().int().min(0).max(10_000_000).optional(),
    }),
    /** Honeypot: real users never see this field. */
    website: z.string().max(200).optional(),
    turnstile_token: z.string().max(4096).optional(),
  })
  .superRefine(requireTypeFields)

export const GetOrderSchema = z.object({ code: z.string().trim().min(3).max(20), token: z.string().trim().min(16).max(128) })

export const MpPreferenceSchema = z.object({ order_code: z.string().trim().min(3).max(20), public_token: z.string().trim().min(16).max(128) })

export const InviteStaffSchema = z.object({ email: z.email().max(120), role: z.enum(['admin', 'kitchen']), full_name: z.string().trim().max(80).optional() })

export const CloudinarySignSchema = z.object({
  kind: z.enum(['menu', 'brand']),
  /** Optional slug used to build a stable public_id (takitho/menu/<slug>). */
  slug: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional(),
})

export type OrderInput = z.infer<typeof OrderInputSchema>
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>

/** Parse a JSON body or throw the 422 VALIDATION_ERROR of the contract. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new HttpError('VALIDATION_ERROR', 'Hay datos que no son válidos. Revisalos y probá de nuevo.', z.flattenError(result.error))
  }
  return result.data
}
