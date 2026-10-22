import { api } from '@/lib/client'
import { staffClient } from '@/lib/supabaseStaff'
import { imageProblem, uniqueSlug, type ProductFormOutput } from './menuLib'

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

function rows<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  check(result.error)
  return result.data ?? []
}

export const adminMenuKey = ['admin', 'menu'] as const

/* ------------------------------------------------------------------ read */

export interface AdminCategory {
  id: string
  name: string
  slug: string
  description: string
  sort: number
  isActive: boolean
}

export interface AdminProduct {
  id: string
  categoryId: string | null
  type: 'single' | 'combo'
  name: string
  slug: string
  description: string
  unitLabel: string
  price: number
  imagePublicId: string | null
  spicyLevel: number
  tags: string[]
  isAvailable: boolean
  isActive: boolean
  sort: number
  groupIds: string[]
  combo: { productId: string; quantity: number }[]
}

export interface AdminModifier {
  id: string
  name: string
  priceDelta: number
  isAvailable: boolean
  isActive: boolean
  sort: number
}

export interface AdminGroup {
  id: string
  name: string
  minSelect: number
  maxSelect: number
  isRequired: boolean
  isActive: boolean
  sort: number
  modifiers: AdminModifier[]
}

export interface AdminMenu {
  categories: AdminCategory[]
  products: AdminProduct[]
  groups: AdminGroup[]
}

export async function fetchAdminMenu(): Promise<AdminMenu> {
  const db = staffClient()
  const [cats, prods, links, combos, groups] = await Promise.all([
    db.from('categories').select('id, name, slug, description, sort, is_active').order('sort'),
    db
      .from('products')
      .select(
        'id, category_id, type, name, slug, description, unit_label, price, image_public_id, spicy_level, tags, is_available, is_active, sort',
      )
      .order('sort'),
    db.from('product_modifier_groups').select('product_id, group_id, sort').order('sort'),
    db.from('combo_items').select('combo_id, product_id, quantity'),
    db
      .from('modifier_groups')
      .select(
        'id, name, min_select, max_select, is_required, is_active, sort, modifiers(id, name, price_delta, is_available, is_active, sort)',
      )
      .order('sort'),
  ])
  const catRows = rows(cats)
  const prodRows = rows(prods)
  const linkRows = rows(links)
  const comboRows = rows(combos)
  const groupRows = rows(groups)
  return {
    categories: catRows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      sort: c.sort,
      isActive: c.is_active,
    })),
    products: prodRows.map((p) => ({
      id: p.id,
      categoryId: p.category_id,
      type: p.type,
      name: p.name,
      slug: p.slug,
      description: p.description,
      unitLabel: p.unit_label,
      price: p.price,
      imagePublicId: p.image_public_id,
      spicyLevel: p.spicy_level,
      tags: p.tags,
      isAvailable: p.is_available,
      isActive: p.is_active,
      sort: p.sort,
      groupIds: linkRows.filter((l) => l.product_id === p.id).map((l) => l.group_id),
      combo: comboRows
        .filter((c) => c.combo_id === p.id)
        .map((c) => ({ productId: c.product_id, quantity: c.quantity })),
    })),
    groups: groupRows.map((g) => ({
      id: g.id,
      name: g.name,
      minSelect: g.min_select,
      maxSelect: g.max_select,
      isRequired: g.is_required,
      isActive: g.is_active,
      sort: g.sort,
      modifiers: [...g.modifiers]
        .sort((a, b) => a.sort - b.sort)
        .map((m) => ({
          id: m.id,
          name: m.name,
          priceDelta: m.price_delta,
          isAvailable: m.is_available,
          isActive: m.is_active,
          sort: m.sort,
        })),
    })),
  }
}

/* ------------------------------------------------------------------ categories */

export async function saveCategory(
  input: { id?: string; name: string; description: string },
  existing: readonly AdminCategory[],
): Promise<void> {
  const db = staffClient()
  if (input.id) {
    const { error } = await db
      .from('categories')
      .update({ name: input.name, description: input.description })
      .eq('id', input.id)
    check(error)
    return
  }
  const slug = uniqueSlug(input.name, new Set(existing.map((c) => c.slug)))
  const sort = Math.max(0, ...existing.map((c) => c.sort)) + 1
  const { error } = await db
    .from('categories')
    .insert({ name: input.name, description: input.description, slug, sort })
  check(error)
}

export async function setCategoryActive(id: string, active: boolean): Promise<void> {
  const { error } = await staffClient().from('categories').update({ is_active: active }).eq('id', id)
  check(error)
}

type Sortable = 'categories' | 'products' | 'modifier_groups' | 'modifiers'

/** Persists a new order: row `i` of `ids` gets `sort = i + 1`. Lists are short (dozens), so one update each is fine. */
export async function saveOrder(table: Sortable, ids: readonly string[]): Promise<void> {
  const results = await Promise.all(
    ids.map((id, i) =>
      staffClient()
        .from(table)
        .update({ sort: i + 1 })
        .eq('id', id),
    ),
  )
  for (const r of results) check(r.error)
}

/* ------------------------------------------------------------------ products */

export interface ProductSave {
  id?: string
  form: ProductFormOutput
  imagePublicId: string | null
  groupIds: string[]
  combo: { productId: string; quantity: number }[]
}

export async function saveProduct(input: ProductSave, existing: readonly AdminProduct[]): Promise<string> {
  const db = staffClient()
  const { form } = input
  const values = {
    category_id: form.categoryId,
    type: form.type,
    name: form.name,
    description: form.description,
    unit_label: form.unitLabel,
    price: form.price,
    spicy_level: form.spicyLevel,
    tags: form.tags,
    image_public_id: input.imagePublicId,
  }
  let id = input.id
  if (id) {
    const { error } = await db.from('products').update(values).eq('id', id)
    check(error)
  } else {
    const slug = uniqueSlug(form.name, new Set(existing.map((p) => p.slug)))
    const sort =
      Math.max(0, ...existing.filter((p) => p.categoryId === form.categoryId).map((p) => p.sort)) + 1
    const { data, error } = await db
      .from('products')
      .insert({ ...values, slug, sort })
      .select('id')
      .single()
    check(error)
    id = data?.id
  }
  if (!id) throw new Error('No se pudo guardar el producto.')

  const removedLinks = await db.from('product_modifier_groups').delete().eq('product_id', id)
  check(removedLinks.error)
  if (input.groupIds.length > 0) {
    const { error } = await db
      .from('product_modifier_groups')
      .insert(input.groupIds.map((group_id, i) => ({ product_id: id, group_id, sort: i + 1 })))
    check(error)
  }

  const removedCombo = await db.from('combo_items').delete().eq('combo_id', id)
  check(removedCombo.error)
  if (form.type === 'combo' && input.combo.length > 0) {
    const { error } = await db
      .from('combo_items')
      .insert(input.combo.map((c) => ({ combo_id: id, product_id: c.productId, quantity: c.quantity })))
    check(error)
  }
  return id
}

/** Products are never deleted (past orders keep their snapshot): they are hidden from the menu instead. */
export async function setProductActive(id: string, active: boolean): Promise<void> {
  const { error } = await staffClient().from('products').update({ is_active: active }).eq('id', id)
  check(error)
}

export async function setProductAvailable(id: string, available: boolean): Promise<void> {
  const { error } = await staffClient().rpc('set_product_available', {
    p_product_id: id,
    p_available: available,
  })
  check(error)
}

/* ------------------------------------------------------------------ option groups */

export async function saveGroup(
  input: { id?: string; name: string; isRequired: boolean; minSelect: number; maxSelect: number },
  existing: readonly AdminGroup[],
): Promise<void> {
  const db = staffClient()
  const values = {
    name: input.name,
    is_required: input.isRequired,
    min_select: input.minSelect,
    max_select: input.maxSelect,
  }
  if (input.id) {
    const { error } = await db.from('modifier_groups').update(values).eq('id', input.id)
    check(error)
    return
  }
  const sort = Math.max(0, ...existing.map((g) => g.sort)) + 1
  const { error } = await db.from('modifier_groups').insert({ ...values, sort })
  check(error)
}

export async function setGroupActive(id: string, active: boolean): Promise<void> {
  const { error } = await staffClient().from('modifier_groups').update({ is_active: active }).eq('id', id)
  check(error)
}

export async function saveModifier(
  input: { id?: string; groupId: string; name: string; priceDelta: number },
  siblings: readonly AdminModifier[],
): Promise<void> {
  const db = staffClient()
  if (input.id) {
    const { error } = await db
      .from('modifiers')
      .update({ name: input.name, price_delta: input.priceDelta })
      .eq('id', input.id)
    check(error)
    return
  }
  const sort = Math.max(0, ...siblings.map((m) => m.sort)) + 1
  const { error } = await db
    .from('modifiers')
    .insert({ group_id: input.groupId, name: input.name, price_delta: input.priceDelta, sort })
  check(error)
}

export async function setModifierActive(id: string, active: boolean): Promise<void> {
  const { error } = await staffClient().from('modifiers').update({ is_active: active }).eq('id', id)
  check(error)
}

export async function setModifierAvailable(id: string, available: boolean): Promise<void> {
  const { error } = await staffClient().rpc('set_modifier_available', {
    p_modifier_id: id,
    p_available: available,
  })
  check(error)
}

/* ------------------------------------------------------------------ photos */

interface SignedUpload {
  api_key: string
  timestamp: number
  signature: string
  public_id: string
  params: Record<string, string>
  upload_url: string
}

/**
 * Direct signed upload to Cloudinary (ADR-0009): the API secret never leaves the Edge Function. Resolves to the
 * `public_id` to store; if anything fails the product keeps its previous photo because nothing is saved until then.
 */
export async function uploadProductImage(file: File, slug: string): Promise<string> {
  const problem = imageProblem(file)
  if (problem) throw new Error(problem)
  const session = (await staffClient().auth.getSession()).data.session
  if (!session) throw new Error('Tu sesión venció. Volvé a entrar.')
  const sign = await api().call<SignedUpload>(
    'cloudinary-sign',
    { kind: 'menu', slug },
    { accessToken: session.access_token },
  )
  const form = new FormData()
  form.set('file', file)
  form.set('api_key', sign.api_key)
  form.set('timestamp', String(sign.timestamp))
  form.set('signature', sign.signature)
  for (const [k, v] of Object.entries(sign.params)) form.set(k, v)
  const res = await fetch(sign.upload_url, { method: 'POST', body: form })
  if (!res.ok) throw new Error('Cloudinary no aceptó la foto. Probá con otra.')
  const body = (await res.json()) as { public_id?: string }
  return body.public_id ?? sign.public_id
}
