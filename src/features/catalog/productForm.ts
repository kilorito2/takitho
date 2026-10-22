// Pure state machine behind the product sheet: which options are chosen, what is missing, live unit price.
import { MAX_LINE_QUANTITY, priceLine, type PricingProduct } from '@/lib/pricing'
import type { Menu, MenuGroup, MenuProduct } from './types'
import { toPricingProducts } from './catalog'

export type Selection = Record<string, string[]>

export interface FormState {
  selection: Selection
  quantity: number
  note: string
}

export const NOTE_MAX = 140

export const groupsOf = (menu: Menu, product: MenuProduct): MenuGroup[] =>
  product.groupIds.flatMap((id) => {
    const g = menu.groups[id]
    return g ? [g] : []
  })

/** Effective minimum: a required group always needs at least one option. */
export const minOf = (g: MenuGroup): number => (g.isRequired ? Math.max(1, g.minSelect) : g.minSelect)
export const isSingleChoice = (g: MenuGroup): boolean => g.maxSelect === 1

/**
 * Initial choices. Required single-choice groups (tortilla, "¿con todo?") start on their first available option,
 * so the customer only has to touch what they want to change.
 */
export function initialState(menu: Menu, product: MenuProduct): FormState {
  const selection: Selection = {}
  for (const g of groupsOf(menu, product)) {
    const first = g.modifiers.find((m) => m.isAvailable)
    selection[g.id] = g.isRequired && isSingleChoice(g) && first ? [first.id] : []
  }
  return { selection, quantity: 1, note: '' }
}

/** State for editing a line already in the cart. */
export function stateFromLine(
  menu: Menu,
  product: MenuProduct,
  line: { modifierIds: readonly string[]; quantity: number; note: string },
): FormState {
  const chosen = new Set(line.modifierIds)
  const selection: Selection = {}
  for (const g of groupsOf(menu, product))
    selection[g.id] = g.modifiers.filter((m) => chosen.has(m.id)).map((m) => m.id)
  return { selection, quantity: line.quantity, note: line.note }
}

/** Toggle an option respecting the group's maximum (single-choice groups swap, multi groups stop at max). */
export function toggleOption(state: FormState, group: MenuGroup, modifierId: string): FormState {
  const current = state.selection[group.id] ?? []
  let next: string[]
  if (current.includes(modifierId)) {
    // A required single choice cannot be un-picked, only swapped.
    next = group.isRequired && isSingleChoice(group) ? current : current.filter((id) => id !== modifierId)
  } else if (isSingleChoice(group)) {
    next = [modifierId]
  } else if (current.length >= group.maxSelect) {
    next = current
  } else {
    next = [...current, modifierId]
  }
  return { ...state, selection: { ...state.selection, [group.id]: next } }
}

export const setQuantity = (state: FormState, quantity: number): FormState => ({
  ...state,
  quantity: Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(quantity))),
})

export const setNote = (state: FormState, note: string): FormState => ({
  ...state,
  note: note.slice(0, NOTE_MAX),
})

export function modifierIdsOf(menu: Menu, product: MenuProduct, state: FormState): string[] {
  return groupsOf(menu, product).flatMap((g) => state.selection[g.id] ?? [])
}

export interface GroupIssue {
  groupId: string
  groupName: string
  /** es-AR, shown under the group. */
  message: string
}

export function validateState(menu: Menu, product: MenuProduct, state: FormState): GroupIssue[] {
  const issues: GroupIssue[] = []
  for (const g of groupsOf(menu, product)) {
    const count = (state.selection[g.id] ?? []).length
    const min = minOf(g)
    if (count < min) {
      issues.push({
        groupId: g.id,
        groupName: g.name,
        message: min === 1 ? 'Elegí una opción.' : `Elegí al menos ${min}.`,
      })
    } else if (count > g.maxSelect) {
      issues.push({ groupId: g.id, groupName: g.name, message: `Podés elegir hasta ${g.maxSelect}.` })
    }
  }
  return issues
}

export interface FormView {
  modifierIds: string[]
  unitPrice: number
  total: number
  issues: GroupIssue[]
  canAdd: boolean
  modifierNames: string[]
}

/** Everything the sheet renders, derived from the state (price comes from the same module as the server). */
export function viewOf(menu: Menu, product: MenuProduct, state: FormState): FormView {
  const modifierIds = modifierIdsOf(menu, product, state)
  const issues = validateState(menu, product, state)
  const pricing: PricingProduct | undefined = toPricingProducts({ ...menu, products: [product] })[0]
  const priced = pricing
    ? priceLine(pricing, { productId: product.id, quantity: state.quantity, modifierIds })
    : null
  const unitPrice = priced?.ok
    ? priced.value.unitTotal
    : product.price + sumDeltas(menu, product, modifierIds)
  const names = groupsOf(menu, product).flatMap((g) =>
    g.modifiers.filter((m) => modifierIds.includes(m.id)).map((m) => m.name),
  )
  return {
    modifierIds,
    unitPrice,
    total: unitPrice * state.quantity,
    issues,
    canAdd: issues.length === 0 && product.isAvailable,
    modifierNames: names,
  }
}

function sumDeltas(menu: Menu, product: MenuProduct, ids: readonly string[]): number {
  return groupsOf(menu, product).reduce(
    (sum, g) => sum + g.modifiers.filter((m) => ids.includes(m.id)).reduce((s, m) => s + m.priceDelta, 0),
    0,
  )
}
