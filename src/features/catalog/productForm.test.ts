// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  initialState,
  setNote,
  setQuantity,
  stateFromLine,
  toggleOption,
  validateState,
  viewOf,
  NOTE_MAX,
} from './productForm'
import type { Menu, MenuGroup, MenuProduct } from './types'

const tortilla: MenuGroup = {
  id: 'g-t',
  name: 'Tortilla',
  minSelect: 1,
  maxSelect: 1,
  isRequired: true,
  modifiers: [
    { id: 'maiz', name: 'Maíz', priceDelta: 0, isAvailable: true },
    { id: 'harina', name: 'Harina', priceDelta: 0, isAvailable: true },
  ],
}
const salsas: MenuGroup = {
  id: 'g-s',
  name: 'Salsas',
  minSelect: 0,
  maxSelect: 2,
  isRequired: false,
  modifiers: [
    { id: 'verde', name: 'Verde', priceDelta: 0, isAvailable: true },
    { id: 'roja', name: 'Roja', priceDelta: 0, isAvailable: true },
    { id: 'habanero', name: 'Habanero', priceDelta: 0, isAvailable: false },
  ],
}
const extras: MenuGroup = {
  id: 'g-e',
  name: 'Extras',
  minSelect: 0,
  maxSelect: 3,
  isRequired: false,
  modifiers: [
    { id: 'queso', name: 'Queso extra', priceDelta: 900, isAvailable: true },
    { id: 'guac', name: 'Guacamole', priceDelta: 1500, isAvailable: true },
  ],
}
const dos: MenuGroup = {
  id: 'g-2',
  name: 'Elegí 2 aguas',
  minSelect: 2,
  maxSelect: 2,
  isRequired: true,
  modifiers: [
    { id: 'h', name: 'Horchata', priceDelta: 0, isAvailable: true },
    { id: 'j', name: 'Jamaica', priceDelta: 0, isAvailable: true },
    { id: 't', name: 'Tamarindo', priceDelta: 0, isAvailable: true },
  ],
}

const product = (over: Partial<MenuProduct> = {}): MenuProduct => ({
  id: 'p',
  categoryId: null,
  type: 'single',
  name: 'Tacos al pastor',
  slug: 'x',
  description: '',
  unitLabel: '',
  price: 7200,
  imagePublicId: null,
  spicyLevel: 1,
  tags: [],
  isAvailable: true,
  groupIds: ['g-t', 'g-s', 'g-e'],
  combo: [],
  ...over,
})
const menuWith = (p: MenuProduct): Menu => ({
  categories: [],
  products: [p],
  groups: { 'g-t': tortilla, 'g-s': salsas, 'g-e': extras, 'g-2': dos },
  productsById: { [p.id]: p },
})

describe('initialState', () => {
  it('preselects the first available option of required single-choice groups only', () => {
    const p = product()
    expect(initialState(menuWith(p), p).selection).toEqual({ 'g-t': ['maiz'], 'g-s': [], 'g-e': [] })
  })

  it('does not preselect multi-choice required groups', () => {
    const p = product({ groupIds: ['g-2'] })
    expect(initialState(menuWith(p), p).selection).toEqual({ 'g-2': [] })
  })
})

describe('toggleOption', () => {
  const p = product({ groupIds: ['g-t', 'g-s', 'g-e', 'g-2'] })
  const menu = menuWith(p)

  it('swaps the choice in a single-choice group and never leaves a required one empty', () => {
    let s = initialState(menu, p)
    s = toggleOption(s, tortilla, 'harina')
    expect(s.selection['g-t']).toEqual(['harina'])
    s = toggleOption(s, tortilla, 'harina')
    expect(s.selection['g-t']).toEqual(['harina'])
  })

  it('adds and removes options in multi-choice groups and stops at the maximum', () => {
    let s = initialState(menu, p)
    s = toggleOption(s, salsas, 'verde')
    s = toggleOption(s, salsas, 'roja')
    s = toggleOption(s, salsas, 'habanero')
    expect(s.selection['g-s']).toEqual(['verde', 'roja'])
    s = toggleOption(s, salsas, 'verde')
    expect(s.selection['g-s']).toEqual(['roja'])
  })

  it('does not mutate the previous state', () => {
    const s = initialState(menu, p)
    const snapshot = JSON.stringify(s)
    toggleOption(s, salsas, 'verde')
    expect(JSON.stringify(s)).toBe(snapshot)
  })
})

describe('validation and live price', () => {
  const p = product({ groupIds: ['g-t', 'g-s', 'g-e', 'g-2'] })
  const menu = menuWith(p)

  it('asks for the required groups that are still empty', () => {
    const issues = validateState(menu, p, initialState(menu, p))
    expect(issues).toEqual([{ groupId: 'g-2', groupName: 'Elegí 2 aguas', message: 'Elegí al menos 2.' }])
  })

  it('reports a missing single choice with the singular message', () => {
    const issues = validateState(menu, p, {
      selection: { 'g-t': [], 'g-s': [], 'g-e': [], 'g-2': ['h', 'j'] },
      quantity: 1,
      note: '',
    })
    expect(issues[0]?.message).toBe('Elegí una opción.')
  })

  it('updates the price as options and quantity change', () => {
    let s = initialState(menu, p)
    s = toggleOption(s, dos, 'h')
    s = toggleOption(s, dos, 'j')
    expect(viewOf(menu, p, s)).toMatchObject({ unitPrice: 7200, total: 7200, canAdd: true, issues: [] })
    s = toggleOption(s, extras, 'queso')
    s = toggleOption(s, extras, 'guac')
    s = setQuantity(s, 3)
    const v = viewOf(menu, p, s)
    expect(v.unitPrice).toBe(7200 + 900 + 1500)
    expect(v.total).toBe(9600 * 3)
    expect(v.modifierNames).toEqual(['Maíz', 'Queso extra', 'Guacamole', 'Horchata', 'Jamaica'])
  })

  it('blocks adding a sold-out product even when the options are valid', () => {
    const sold = product({ isAvailable: false, groupIds: ['g-t'] })
    expect(viewOf(menuWith(sold), sold, initialState(menuWith(sold), sold)).canAdd).toBe(false)
  })
})

describe('quantity and note', () => {
  it('clamps quantity to 1..20 and truncates the note', () => {
    const p = product()
    const s = initialState(menuWith(p), p)
    expect(setQuantity(s, 0).quantity).toBe(1)
    expect(setQuantity(s, 50).quantity).toBe(20)
    expect(setQuantity(s, 4.8).quantity).toBe(4)
    expect(setNote(s, 'x'.repeat(300)).note).toHaveLength(NOTE_MAX)
  })
})

describe('stateFromLine (editing from the cart)', () => {
  it('restores the saved options, quantity and note', () => {
    const p = product()
    const s = stateFromLine(menuWith(p), p, {
      modifierIds: ['harina', 'verde', 'queso'],
      quantity: 2,
      note: 'sin cebolla',
    })
    expect(s).toEqual({
      selection: { 'g-t': ['harina'], 'g-s': ['verde'], 'g-e': ['queso'] },
      quantity: 2,
      note: 'sin cebolla',
    })
  })
})
