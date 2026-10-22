// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { checkoutSchema, defaultValues, type CheckoutValues } from './schema'

const valid = (over: Partial<CheckoutValues> = {}) =>
  defaultValues({ name: 'Ana Pérez', phone: '11 1234-5678', ...over })
const errors = (v: CheckoutValues): Record<string, string> => {
  const r = checkoutSchema.safeParse(v)
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]))
}

describe('checkoutSchema', () => {
  it('accepts a minimal pickup order', () => {
    expect(checkoutSchema.safeParse(valid()).success).toBe(true)
  })

  it('requires name and an Argentine mobile, in any typed format', () => {
    expect(errors(valid({ name: 'A' }))).toHaveProperty('name')
    expect(errors(valid({ phone: '12345' }))).toHaveProperty('phone')
    for (const phone of ['011 15 1234-5678', '+54 9 11 1234 5678', '1112345678'])
      expect(errors(valid({ phone }))).toEqual({})
  })

  it('needs zone, street and number for delivery', () => {
    expect(Object.keys(errors(valid({ type: 'delivery' })))).toEqual(['zoneId', 'street', 'number'])
    expect(
      errors(valid({ type: 'delivery', zoneId: 'z', street: 'Av. Siempreviva', number: '742' })),
    ).toEqual({})
    expect(errors(valid({ type: 'pickup' }))).toEqual({})
  })

  it('needs a slot when scheduling', () => {
    expect(errors(valid({ whenMode: 'scheduled' }))).toHaveProperty('slot')
    expect(errors(valid({ whenMode: 'scheduled', slot: '2026-10-20T22:00:00.000Z' }))).toEqual({})
  })

  it('validates the cash amount and the custom tip only when typed', () => {
    expect(errors(valid({ method: 'cash', cashPaidWith: '' }))).toEqual({})
    expect(errors(valid({ method: 'cash', cashPaidWith: '20.000' }))).toEqual({})
    expect(errors(valid({ method: 'cash', cashPaidWith: 'mucho' }))).toHaveProperty('cashPaidWith')
    expect(errors(valid({ method: 'transfer', cashPaidWith: 'mucho' }))).toEqual({})
    expect(errors(valid({ tipChoice: 'custom', tipCustom: 'x' }))).toHaveProperty('tipCustom')
    expect(errors(valid({ tipChoice: 'custom', tipCustom: '500' }))).toEqual({})
  })

  it('rejects a filled honeypot', () => {
    expect(errors(valid({ website: 'http://spam.example' }))).toHaveProperty('website')
  })
})
