// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type { PricingProduct } from '@/lib/pricing'
import { blocking, orderable, revalidateCart } from './revalidate'
import { cartCount, sameLine, useCart, type NewCartItem } from './store'

const item = (over: Partial<NewCartItem> = {}): NewCartItem => ({
  productId: 'p1',
  quantity: 1,
  modifierIds: ['m1'],
  note: '',
  snapshot: { name: 'Tacos al pastor', unitPrice: 7200, imagePublicId: null, modifierNames: ['Maíz'] },
  ...over,
})

beforeEach(() => {
  useCart.setState({ items: [], couponCode: null })
})

describe('cart store', () => {
  it('adds lines and merges identical ones (same product, options in any order, same note)', () => {
    const { add } = useCart.getState()
    add(item({ modifierIds: ['m1', 'm2'] }))
    add(item({ modifierIds: ['m2', 'm1'], quantity: 2 }))
    add(item({ modifierIds: ['m1', 'm2'], note: 'sin cebolla' }))
    const items = useCart.getState().items
    expect(items).toHaveLength(2)
    expect(items[0]?.quantity).toBe(3)
    expect(items[1]?.note).toBe('sin cebolla')
    expect(items[0]?.id).not.toBe(items[1]?.id)
  })

  it('caps a line at 20 units and never goes below 1', () => {
    const { add, setQuantity } = useCart.getState()
    add(item({ quantity: 19 }))
    add(item({ quantity: 5 }))
    const id = useCart.getState().items[0]?.id ?? ''
    expect(useCart.getState().items[0]?.quantity).toBe(20)
    setQuantity(id, 0)
    expect(useCart.getState().items[0]?.quantity).toBe(1)
    setQuantity(id, 99.9)
    expect(useCart.getState().items[0]?.quantity).toBe(20)
  })

  it('removes, replaces and clears', () => {
    const { add, remove, replaceItem, setCoupon, clear } = useCart.getState()
    add(item())
    add(item({ productId: 'p2', modifierIds: [] }))
    const [first, second] = useCart.getState().items
    replaceItem(first?.id ?? '', item({ productId: 'p1', modifierIds: ['m9'], quantity: 3 }))
    expect(useCart.getState().items[0]).toMatchObject({ id: first?.id, modifierIds: ['m9'], quantity: 3 })
    remove(second?.id ?? '')
    expect(useCart.getState().items).toHaveLength(1)
    setCoupon('  martes ')
    expect(useCart.getState().couponCode).toBe('MARTES')
    setCoupon('   ')
    expect(useCart.getState().couponCode).toBeNull()
    clear()
    expect(useCart.getState()).toMatchObject({ items: [], couponCode: null })
  })

  it('loads a previous order ("repetir pedido") with fresh line ids', () => {
    useCart.getState().load([item({ quantity: 2 }), item({ productId: 'p2', quantity: 30 })])
    const items = useCart.getState().items
    expect(items.map((i) => i.quantity)).toEqual([2, 20])
    expect(new Set(items.map((i) => i.id)).size).toBe(2)
  })

  it('counts units', () => {
    useCart.getState().add(item({ quantity: 2 }))
    useCart.getState().add(item({ productId: 'p2', modifierIds: [], quantity: 3 }))
    expect(cartCount(useCart.getState().items)).toBe(5)
  })

  it('sameLine ignores whitespace around the note', () => {
    expect(sameLine(item({ note: ' hola ' }), item({ note: 'hola' }))).toBe(true)
  })
})

describe('persistence', () => {
  const saved = {
    id: 'x',
    productId: 'p1',
    quantity: 2,
    modifierIds: [],
    note: '',
    snapshot: { name: 'n', unitPrice: 1, imagePublicId: null, modifierNames: [] },
  }
  const withStorage = (version: number) => {
    const store = new Map<string, string>()
    store.set('takitho-cart', JSON.stringify({ state: { items: [saved], couponCode: 'MARTES' }, version }))
    const local = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    Object.defineProperty(globalThis, 'window', { value: { localStorage: local }, configurable: true })
    return store
  }

  it('survives a reload: rehydrates the saved cart and keeps saving changes', async () => {
    const store = withStorage(1)
    await useCart.persist.rehydrate()
    expect(useCart.getState().items).toEqual([saved])
    expect(useCart.getState().couponCode).toBe('MARTES')
    useCart.getState().setQuantity('x', 5)
    expect(JSON.parse(store.get('takitho-cart') ?? '{}')).toMatchObject({
      version: 1,
      state: { items: [{ quantity: 5 }] },
    })
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('drops a cart written by an unknown schema version instead of risking a broken checkout', async () => {
    withStorage(0)
    await useCart.persist.rehydrate()
    expect(useCart.getState().items).toEqual([])
    Reflect.deleteProperty(globalThis, 'window')
  })
})

describe('revalidateCart', () => {
  const group = {
    id: 'g1',
    name: 'Tortilla',
    minSelect: 1,
    maxSelect: 1,
    isRequired: true,
    modifiers: [
      { id: 'm1', name: 'Maíz', priceDelta: 0, isAvailable: true },
      { id: 'm2', name: 'Harina', priceDelta: 0, isAvailable: false },
    ],
  }
  const product = (over: Partial<PricingProduct> = {}): PricingProduct => ({
    id: 'p1',
    name: 'Tacos al pastor',
    price: 7200,
    categoryId: null,
    isAvailable: true,
    groups: [group],
    ...over,
  })
  const line = (over: Partial<NewCartItem> = {}) => ({ ...item(over), id: 'l1' })

  it('marks an unchanged line as ok', () => {
    const [v] = revalidateCart([line()], [product()])
    expect(v).toMatchObject({ status: 'ok', unitPrice: 7200, message: null })
  })

  it('warns when the price changed, in both directions, and exposes the live price', () => {
    const up = revalidateCart([line()], [product({ price: 7800 })])[0]
    expect(up).toMatchObject({
      status: 'price_changed',
      unitPrice: 7800,
      previousUnitPrice: 7200,
      message: 'Tacos al pastor subió de precio.',
    })
    const down = revalidateCart([line()], [product({ price: 6000 })])[0]
    expect(down?.message).toBe('Tacos al pastor bajó de precio.')
  })

  it('accounts for modifier prices when comparing', () => {
    const withExtra = {
      ...group,
      modifiers: [{ id: 'm1', name: 'Maíz', priceDelta: 500, isAvailable: true }],
    }
    const [v] = revalidateCart(
      [
        line({
          snapshot: { name: 'Tacos al pastor', unitPrice: 7200, imagePublicId: null, modifierNames: [] },
        }),
      ],
      [product({ groups: [withExtra] })],
    )
    expect(v).toMatchObject({ status: 'price_changed', unitPrice: 7700 })
  })

  it('flags sold-out products and options, removed products and options that no longer apply', () => {
    expect(revalidateCart([line()], [product({ isAvailable: false })])[0]).toMatchObject({
      status: 'unavailable',
      message: 'Se nos terminó Tacos al pastor por hoy.',
    })
    expect(revalidateCart([line({ modifierIds: ['m2'] })], [product()])[0]?.status).toBe('unavailable')
    expect(revalidateCart([line()], [])[0]).toMatchObject({
      status: 'removed',
      message: 'Tacos al pastor ya no está en el menú.',
    })
    expect(revalidateCart([line({ modifierIds: [] })], [product()])[0]?.status).toBe('invalid')
    expect(revalidateCart([line({ modifierIds: ['zzz'] })], [product()])[0]?.status).toBe('invalid')
  })

  it('splits what can still be ordered from what blocks the checkout', () => {
    const views = revalidateCart(
      [line(), { ...line({ productId: 'gone' }), id: 'l2' }, { ...line(), id: 'l3' }],
      [product({ price: 7300 })],
    )
    expect(orderable(views).map((v) => v.item.id)).toEqual(['l1', 'l3'])
    expect(blocking(views).map((v) => v.item.id)).toEqual(['l2'])
  })
})
