// Pure helpers over the menu: adapting it to the pricing core and searching/filtering it.
import type { PricingProduct } from '@/lib/pricing'
import type { Menu, MenuProduct } from './types'

/** The catalogue as the shared pricing module wants it (used for instant previews only). */
export function toPricingProducts(menu: Menu): PricingProduct[] {
  return menu.products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    categoryId: p.categoryId,
    isAvailable: p.isAvailable,
    groups: p.groupIds.flatMap((id) => {
      const g = menu.groups[id]
      return g
        ? [
            {
              id: g.id,
              name: g.name,
              minSelect: g.minSelect,
              maxSelect: g.maxSelect,
              isRequired: g.isRequired,
              modifiers: g.modifiers,
            },
          ]
        : []
    }),
  }))
}

/** Lower-case, accent-less text so "Jamaica", "jamáica" and "JAMAICA" all match. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export type DietFilter = 'veggie' | 'sin_tacc' | 'picante'

export interface MenuFilters {
  query: string
  diets: readonly DietFilter[]
}

const matchesDiet = (product: MenuProduct, diet: DietFilter): boolean =>
  diet === 'picante' ? product.spicyLevel > 0 : product.tags.includes(diet)

/** All selected diet filters must match (AND), and the text must appear in the name or description. */
export function filterProducts(
  products: readonly MenuProduct[],
  { query, diets }: MenuFilters,
): MenuProduct[] {
  const q = normalizeText(query)
  return products.filter((p) => {
    if (!diets.every((d) => matchesDiet(p, d))) return false
    if (!q) return true
    return normalizeText(`${p.name} ${p.description}`).includes(q)
  })
}

export interface MenuSection {
  id: string
  name: string
  description: string
  slug: string
  products: MenuProduct[]
}

/** Groups products by category in menu order, dropping empty sections. */
export function groupByCategory(menu: Menu, products: readonly MenuProduct[]): MenuSection[] {
  return menu.categories
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      slug: c.slug,
      products: products.filter((p) => p.categoryId === c.id),
    }))
    .filter((s) => s.products.length > 0)
}
