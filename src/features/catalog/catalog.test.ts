// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { filterProducts, groupByCategory, normalizeText, toPricingProducts } from './catalog'
import type { Menu, MenuProduct } from './types'

const p = (over: Partial<MenuProduct>): MenuProduct => ({
  id: 'p',
  categoryId: 'c1',
  type: 'single',
  name: 'Producto',
  slug: 'producto',
  description: '',
  unitLabel: '',
  price: 1000,
  imagePublicId: null,
  spicyLevel: 0,
  tags: [],
  isAvailable: true,
  groupIds: [],
  combo: [],
  ...over,
})

const menu: Menu = {
  categories: [
    { id: 'c1', name: 'Tacos', slug: 'tacos', description: '' },
    { id: 'c2', name: 'Bebidas', slug: 'bebidas', description: '' },
    { id: 'c3', name: 'Postres', slug: 'postres', description: '' },
  ],
  products: [
    p({
      id: 'a',
      name: 'Tacos al pastor',
      description: 'Con piña',
      spicyLevel: 1,
      groupIds: ['g1', 'missing'],
    }),
    p({ id: 'b', name: 'Tacos de hongos', tags: ['veggie'], spicyLevel: 2 }),
    p({ id: 'c', name: 'Agua de jamaica', categoryId: 'c2', tags: ['veggie', 'sin_tacc'] }),
  ],
  groups: {
    g1: {
      id: 'g1',
      name: 'Tortilla',
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      modifiers: [{ id: 'm1', name: 'Maíz', priceDelta: 0, isAvailable: true }],
    },
  },
  productsById: {},
}

describe('toPricingProducts', () => {
  it('maps the menu to the shared pricing shape and skips unknown groups', () => {
    const [first] = toPricingProducts(menu)
    expect(first).toMatchObject({ id: 'a', price: 1000, categoryId: 'c1', isAvailable: true })
    expect(first?.groups).toHaveLength(1)
    expect(first?.groups[0]).toMatchObject({
      id: 'g1',
      isRequired: true,
      modifiers: [{ id: 'm1', name: 'Maíz' }],
    })
  })
})

describe('normalizeText', () => {
  it('ignores case and accents', () => {
    expect(normalizeText('  JAMÁICA ')).toBe('jamaica')
    expect(normalizeText('Piña')).toBe('pina')
  })
})

describe('filterProducts', () => {
  const all = menu.products
  it('returns everything without filters', () => {
    expect(filterProducts(all, { query: '', diets: [] })).toHaveLength(3)
  })

  it('searches name and description, ignoring accents', () => {
    expect(filterProducts(all, { query: 'jamáica', diets: [] }).map((x) => x.id)).toEqual(['c'])
    expect(filterProducts(all, { query: 'PINA', diets: [] }).map((x) => x.id)).toEqual(['a'])
    expect(filterProducts(all, { query: 'nada', diets: [] })).toEqual([])
  })

  it('applies diet filters and combines them with AND', () => {
    expect(filterProducts(all, { query: '', diets: ['veggie'] }).map((x) => x.id)).toEqual(['b', 'c'])
    expect(filterProducts(all, { query: '', diets: ['veggie', 'sin_tacc'] }).map((x) => x.id)).toEqual(['c'])
    expect(filterProducts(all, { query: '', diets: ['picante'] }).map((x) => x.id)).toEqual(['a', 'b'])
    expect(filterProducts(all, { query: 'hongos', diets: ['veggie', 'picante'] }).map((x) => x.id)).toEqual([
      'b',
    ])
  })
})

describe('groupByCategory', () => {
  it('keeps the menu order and drops empty categories', () => {
    const sections = groupByCategory(menu, menu.products)
    expect(sections.map((s) => s.name)).toEqual(['Tacos', 'Bebidas'])
    expect(sections[0]?.products.map((x) => x.id)).toEqual(['a', 'b'])
  })
})
