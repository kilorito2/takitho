import { z } from 'zod'
import { normalizeArPhone } from '@/lib/phone'
import { parseAmount } from './money'

/** Checkout form values. Everything is a string/enum because that is what inputs produce. */
export const checkoutSchema = z
  .object({
    type: z.enum(['pickup', 'delivery', 'dine_in']),
    zoneId: z.string(),
    street: z.string().trim().max(80),
    number: z.string().trim().max(12),
    floorApt: z.string().trim().max(30),
    references: z.string().trim().max(140),
    whenMode: z.enum(['asap', 'scheduled']),
    slot: z.string(),
    name: z.string().trim().min(2, 'Decinos tu nombre.').max(60, 'Es muy largo: ponelo más corto.'),
    phone: z
      .string()
      .refine(
        (v) => normalizeArPhone(v).ok,
        'Revisá el WhatsApp: tiene que ser un celular argentino (ej. 11 1234-5678).',
      ),
    method: z.enum(['mercado_pago', 'cash', 'transfer']),
    cashPaidWith: z.string(),
    tipChoice: z.string(),
    tipCustom: z.string(),
    /** Honeypot: humans never see or fill it. */
    website: z.string().max(0),
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) => {
      ctx.addIssue({ code: 'custom', path: [path], message })
    }
    if (v.type === 'delivery') {
      if (!v.zoneId) add('zoneId', 'Elegí tu zona de entrega.')
      if (v.street.length < 2) add('street', 'Decinos la calle.')
      if (v.number.length < 1) add('number', 'Falta la altura.')
    }
    if (v.whenMode === 'scheduled' && !v.slot) add('slot', 'Elegí un horario.')
    if (v.method === 'cash' && v.cashPaidWith.trim() !== '' && parseAmount(v.cashPaidWith) === null) {
      add('cashPaidWith', 'Escribí un monto en pesos, por ejemplo 20000.')
    }
    if (v.tipChoice === 'custom' && v.tipCustom.trim() !== '' && parseAmount(v.tipCustom) === null) {
      add('tipCustom', 'Escribí un monto en pesos, por ejemplo 500.')
    }
  })

export type CheckoutValues = z.infer<typeof checkoutSchema>

export const defaultValues = (over: Partial<CheckoutValues> = {}): CheckoutValues => ({
  type: 'pickup',
  zoneId: '',
  street: '',
  number: '',
  floorApt: '',
  references: '',
  whenMode: 'asap',
  slot: '',
  name: '',
  phone: '',
  method: 'cash',
  cashPaidWith: '',
  tipChoice: '0',
  tipCustom: '',
  website: '',
  ...over,
})

/** Which fields each step owns, so "Siguiente" validates only its own part. */
export const STEP_FIELDS: readonly (readonly (keyof CheckoutValues)[])[] = [
  ['type', 'zoneId', 'street', 'number'],
  ['whenMode', 'slot'],
  ['name', 'phone'],
  ['method', 'cashPaidWith', 'tipChoice', 'tipCustom'],
  [],
]

export const STEP_TITLES = ['Cómo lo querés', 'Cuándo', 'Tus datos', 'Pago', 'Confirmar'] as const
