import { z } from 'zod'

export const WEEKDAYS = [
  { id: 1, label: 'Lun' },
  { id: 2, label: 'Mar' },
  { id: 3, label: 'Mié' },
  { id: 4, label: 'Jue' },
  { id: 5, label: 'Vie' },
  { id: 6, label: 'Sáb' },
  { id: 0, label: 'Dom' },
] as const

const optionalInt = (max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+$/.test(v), 'Solo números enteros.')
    .refine((v) => !/^\d+$/.test(v) || Number(v) <= max, 'Es demasiado alto.')

/** The coupon form as typed. Cross-field rules live in `superRefine` so each message lands on the right field. */
export const couponFormSchema = z
  .object({
    code: z.string().trim(),
    label: z.string().trim().min(3, 'Poné un nombre que vea el cliente.').max(60, 'Máximo 60 letras.'),
    kind: z.enum(['percent', 'fixed', 'two_for_one']),
    value: optionalInt(1_000_000),
    scope: z.enum(['all', 'category', 'products']),
    categoryId: z.string(),
    productIds: z.array(z.string()),
    weekdays: z.array(z.number().int().min(0).max(6)),
    startsAt: z.string(),
    endsAt: z.string(),
    maxUses: optionalInt(1_000_000),
    maxUsesPerPhone: optionalInt(1000),
    minPurchase: optionalInt(1_000_000),
    autoApply: z.boolean(),
    isActive: z.boolean(),
  })
  .superRefine((c, ctx) => {
    const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    const code = c.code.toUpperCase()
    if (!c.autoApply && code === '') fail('code', 'Poné un código o marcá "se aplica sola".')
    if (code !== '' && !/^[A-Z0-9_-]{3,20}$/.test(code))
      fail('code', 'De 3 a 20 letras, números, guion o guion bajo, sin espacios.')
    const value = c.value === '' ? 0 : Number(c.value)
    if (c.kind === 'percent' && (value < 1 || value > 100)) fail('value', 'El porcentaje va de 1 a 100.')
    if (c.kind === 'fixed' && value < 1) fail('value', 'Poné el monto a descontar, en pesos.')
    if (c.scope === 'category' && c.categoryId === '') fail('categoryId', 'Elegí la categoría.')
    if (c.scope === 'products' && c.productIds.length === 0) fail('productIds', 'Elegí al menos un producto.')
    if (c.kind === 'two_for_one' && c.scope === 'all')
      fail('scope', 'El 2x1 se aplica a una categoría o a productos puntuales.')
    if (c.startsAt !== '' && c.endsAt !== '' && c.endsAt < c.startsAt)
      fail('endsAt', 'No puede terminar antes de empezar.')
  })

export type CouponFormInput = z.input<typeof couponFormSchema>
export type CouponFormValues = z.output<typeof couponFormSchema>

export interface CouponRow {
  code: string | null
  label: string
  kind: 'percent' | 'fixed' | 'two_for_one'
  value: number
  scope: 'all' | 'category' | 'products'
  scope_ids: string[]
  weekdays: number[]
  starts_at: string | null
  ends_at: string | null
  max_uses: number | null
  max_uses_per_phone: number | null
  min_purchase: number
  auto_apply: boolean
  is_active: boolean
}

const intOrNull = (v: string): number | null => (v === '' ? null : Number(v))

/**
 * Form → database row. Dates are whole days in the shop's time zone: a promo "until the 31st" runs through the end of
 * that day (23:59:59 Buenos Aires), not until midnight at its start.
 */
export function couponToRow(form: CouponFormValues, tzOffset = '-03:00'): CouponRow {
  const code = form.code.trim().toUpperCase()
  return {
    code: code === '' ? null : code,
    label: form.label.trim(),
    kind: form.kind,
    value: form.kind === 'two_for_one' ? 0 : Number(form.value || 0),
    scope: form.scope,
    scope_ids:
      form.scope === 'category' ? [form.categoryId] : form.scope === 'products' ? form.productIds : [],
    weekdays: [...form.weekdays].sort((a, b) => a - b),
    starts_at: form.startsAt === '' ? null : `${form.startsAt}T00:00:00${tzOffset}`,
    ends_at: form.endsAt === '' ? null : `${form.endsAt}T23:59:59${tzOffset}`,
    max_uses: intOrNull(form.maxUses),
    max_uses_per_phone: intOrNull(form.maxUsesPerPhone),
    min_purchase: Number(form.minPurchase || 0),
    auto_apply: form.autoApply,
    is_active: form.isActive,
  }
}

/** A short sentence for the list: "20 % de descuento · solo Vie, Sáb · hasta 31/10". */
export function describeCoupon(
  c: Pick<CouponRow, 'kind' | 'value' | 'weekdays' | 'ends_at' | 'min_purchase'>,
): string {
  const parts: string[] = []
  parts.push(
    c.kind === 'percent'
      ? `${c.value} % de descuento`
      : c.kind === 'fixed'
        ? `$ ${c.value.toLocaleString('es-AR')} de descuento`
        : '2x1',
  )
  if (c.weekdays.length > 0 && c.weekdays.length < 7)
    parts.push(
      `solo ${WEEKDAYS.filter((d) => c.weekdays.includes(d.id))
        .map((d) => d.label)
        .join(', ')}`,
    )
  if (c.min_purchase > 0) parts.push(`desde $ ${c.min_purchase.toLocaleString('es-AR')}`)
  if (c.ends_at) parts.push(`hasta ${c.ends_at.slice(8, 10)}/${c.ends_at.slice(5, 7)}`)
  return parts.join(' · ')
}
