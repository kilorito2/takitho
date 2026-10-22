import { z } from 'zod'

/** "Tacos al pastor con piña" → "tacos-al-pastor-con-pina" (what the database stores in `slug` and Cloudinary in `public_id`). */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/** A slug that is not in `taken`: appends -2, -3… (slugs are unique across the table). */
export function uniqueSlug(name: string, taken: ReadonlySet<string>): string {
  const base = slugify(name) || 'item'
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, 56)}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** First problem with a file chosen for upload, in words for the owner; null when it is fine. */
export function imageProblem(file: { type: string; size: number }): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return 'La foto tiene que ser JPG, PNG o WebP.'
  if (file.size > IMAGE_MAX_BYTES) return 'La foto pesa más de 5 MB. Probá con una más liviana.'
  if (file.size === 0) return 'El archivo está vacío.'
  return null
}

export const TAGS = [
  { id: 'veggie', label: 'Vegetariano' },
  { id: 'sin_tacc', label: 'Sin TACC' },
  { id: 'destacado', label: 'Destacado' },
] as const

const intFromText = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Ingresá un número.')
    .regex(/^\d+$/, 'Solo números enteros, sin puntos ni signos.')
    .transform(Number)
    .pipe(z.number().max(max, 'Es demasiado alto.'))

/** The product form as the owner types it (strings) → the values the database stores. */
export const productFormSchema = z.object({
  name: z.string().trim().min(2, 'Poné un nombre.').max(60, 'Máximo 60 letras.'),
  categoryId: z.string().min(1, 'Elegí una categoría.'),
  type: z.enum(['single', 'combo']),
  description: z.string().trim().max(200, 'Máximo 200 letras.'),
  unitLabel: z.string().trim().max(30, 'Máximo 30 letras.'),
  price: intFromText(1_000_000),
  spicyLevel: z.enum(['0', '1', '2', '3']).transform(Number),
  tags: z.array(z.enum(['veggie', 'sin_tacc', 'destacado'])),
})

export type ProductFormInput = z.input<typeof productFormSchema>
export type ProductFormOutput = z.output<typeof productFormSchema>

export const categoryFormSchema = z.object({
  name: z.string().trim().min(2, 'Poné un nombre.').max(40, 'Máximo 40 letras.'),
  description: z.string().trim().max(160, 'Máximo 160 letras.'),
})
export type CategoryFormInput = z.input<typeof categoryFormSchema>

export const groupFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Poné un nombre.').max(40, 'Máximo 40 letras.'),
    isRequired: z.boolean(),
    minSelect: intFromText(20),
    maxSelect: intFromText(20),
  })
  .superRefine((g, ctx) => {
    if (g.maxSelect < 1)
      ctx.addIssue({ code: 'custom', path: ['maxSelect'], message: 'Tiene que poder elegirse al menos 1.' })
    if (g.minSelect > g.maxSelect)
      ctx.addIssue({ code: 'custom', path: ['minSelect'], message: 'El mínimo no puede superar al máximo.' })
    if (g.isRequired && g.minSelect < 1)
      ctx.addIssue({ code: 'custom', path: ['minSelect'], message: 'Si es obligatorio, el mínimo es 1.' })
  })
export type GroupFormInput = z.input<typeof groupFormSchema>
