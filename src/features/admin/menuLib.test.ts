import { describe, expect, it } from 'vitest'
import {
  categoryFormSchema,
  groupFormSchema,
  imageProblem,
  productFormSchema,
  slugify,
  uniqueSlug,
} from './menuLib'

describe('slugify', () => {
  it('drops accents and punctuation', () => {
    expect(slugify('Tacos al pastor con piña')).toBe('tacos-al-pastor-con-pina')
    expect(slugify('  ¡Agua de Horchata!  ')).toBe('agua-de-horchata')
    expect(slugify('Combo 2x1 (Pareja)')).toBe('combo-2x1-pareja')
  })

  it('caps the length without leaving a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(59)} b`)
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('is empty for names with nothing usable', () => {
    expect(slugify('¡¡¡')).toBe('')
  })
})

describe('uniqueSlug', () => {
  it('keeps the base when free and numbers it when taken', () => {
    expect(uniqueSlug('Flan', new Set())).toBe('flan')
    expect(uniqueSlug('Flan', new Set(['flan']))).toBe('flan-2')
    expect(uniqueSlug('Flan', new Set(['flan', 'flan-2']))).toBe('flan-3')
  })

  it('falls back to a generic base for unusable names', () => {
    expect(uniqueSlug('¡¡¡', new Set())).toBe('item')
  })
})

describe('imageProblem', () => {
  it('accepts the usual photo formats', () => {
    expect(imageProblem({ type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(imageProblem({ type: 'image/png', size: 1000 })).toBeNull()
    expect(imageProblem({ type: 'image/webp', size: 5 * 1024 * 1024 })).toBeNull()
  })

  it('rejects other types, heavy and empty files', () => {
    expect(imageProblem({ type: 'image/svg+xml', size: 1000 })).toMatch(/JPG, PNG o WebP/)
    expect(imageProblem({ type: 'application/pdf', size: 1000 })).toMatch(/JPG, PNG o WebP/)
    expect(imageProblem({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/)
    expect(imageProblem({ type: 'image/jpeg', size: 0 })).toMatch(/vacío/)
  })
})

describe('productFormSchema', () => {
  const valid = {
    name: ' Tacos ',
    categoryId: 'c1',
    type: 'single',
    description: '',
    unitLabel: '3 unidades',
    price: '7200',
    spicyLevel: '2',
    tags: ['veggie'],
  } as const

  it('turns what the owner typed into stored values', () => {
    const r = productFormSchema.safeParse(valid)
    expect(r.success && r.data).toMatchObject({ name: 'Tacos', price: 7200, spicyLevel: 2, tags: ['veggie'] })
  })

  it.each(['', '72,50', '-5', '1e3', 'abc', '1000001'])('rejects the price %j', (price) => {
    expect(productFormSchema.safeParse({ ...valid, price }).success).toBe(false)
  })

  it('needs a name and a category', () => {
    expect(productFormSchema.safeParse({ ...valid, name: ' ' }).success).toBe(false)
    expect(productFormSchema.safeParse({ ...valid, categoryId: '' }).success).toBe(false)
  })

  it('refuses unknown tags and spice levels', () => {
    expect(productFormSchema.safeParse({ ...valid, tags: ['nuevo'] }).success).toBe(false)
    expect(productFormSchema.safeParse({ ...valid, spicyLevel: '4' }).success).toBe(false)
  })
})

describe('categoryFormSchema', () => {
  it('needs a name', () => {
    expect(categoryFormSchema.safeParse({ name: '', description: '' }).success).toBe(false)
    expect(categoryFormSchema.safeParse({ name: 'Tacos', description: '' }).success).toBe(true)
  })
})

describe('groupFormSchema', () => {
  const base = { name: 'Tortilla', isRequired: true, minSelect: '1', maxSelect: '1' }

  it('accepts a required single choice', () => {
    expect(groupFormSchema.safeParse(base).success).toBe(true)
  })

  it('keeps min ≤ max, max ≥ 1 and required ⇒ min ≥ 1', () => {
    expect(groupFormSchema.safeParse({ ...base, minSelect: '3', maxSelect: '2' }).success).toBe(false)
    expect(
      groupFormSchema.safeParse({ ...base, maxSelect: '0', minSelect: '0', isRequired: false }).success,
    ).toBe(false)
    expect(groupFormSchema.safeParse({ ...base, minSelect: '0' }).success).toBe(false)
    expect(
      groupFormSchema.safeParse({ ...base, isRequired: false, minSelect: '0', maxSelect: '3' }).success,
    ).toBe(true)
  })
})
