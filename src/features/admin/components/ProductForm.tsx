import { useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Dialog'
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { toast } from '@/components/ui/toastStore'
import { ProductImage } from '@/features/catalog/components/ProductImage'
import { formatARS } from '@/lib/money'
import { saveProduct, uploadProductImage, type AdminMenu, type AdminProduct } from '../menuApi'
import {
  imageProblem,
  productFormSchema,
  TAGS,
  uniqueSlug,
  type ProductFormInput,
  type ProductFormOutput,
} from '../menuLib'

interface Props {
  open: boolean
  /** null = a new product. */
  product: AdminProduct | null
  menu: AdminMenu
  /** Category preselected for a new product. */
  defaultCategoryId?: string
  onClose: () => void
}

/** Create / edit a product. Mount with `key={product?.id ?? 'new'}` so the form starts from the right values. */
export function ProductForm({ open, product, menu, defaultCategoryId, onClose }: Props) {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [imagePublicId, setImagePublicId] = useState<string | null>(product?.imagePublicId ?? null)
  const [uploading, setUploading] = useState(false)
  const [groupIds, setGroupIds] = useState<string[]>(product?.groupIds ?? [])
  const [combo, setCombo] = useState<{ productId: string; quantity: number }[]>(product?.combo ?? [])
  const [comboPick, setComboPick] = useState('')

  const { register, handleSubmit, control, getValues, formState } = useForm<
    ProductFormInput,
    unknown,
    ProductFormOutput
  >({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: product?.name ?? '',
      categoryId:
        product?.categoryId ?? defaultCategoryId ?? menu.categories.find((c) => c.isActive)?.id ?? '',
      type: product?.type ?? 'single',
      description: product?.description ?? '',
      unitLabel: product?.unitLabel ?? '',
      price: String(product?.price ?? ''),
      spicyLevel: String(product?.spicyLevel ?? 0) as '0',
      tags: (product?.tags ?? []).filter((t): t is 'veggie' | 'sin_tacc' | 'destacado' =>
        TAGS.some((x) => x.id === t),
      ),
    },
  })
  const type = useWatch({ control, name: 'type' })
  const e = formState.errors

  const save = useMutation({
    mutationFn: (form: ProductFormOutput) =>
      saveProduct(
        { ...(product ? { id: product.id } : {}), form, imagePublicId, groupIds, combo },
        menu.products,
      ),
    onSuccess: async () => {
      toast.success(product ? 'Producto actualizado.' : 'Producto creado.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'menu'] })
      await queryClient.invalidateQueries({ queryKey: ['menu'] })
      onClose()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo guardar.'),
  })

  const onPhoto = async (file: File | undefined) => {
    if (!file) return
    const problem = imageProblem(file)
    if (problem) return toast.error(problem)
    const name = getValues('name').trim()
    if (name.length < 2 && !product)
      return toast.error('Primero poné el nombre del producto: la foto se guarda con ese nombre.')
    setUploading(true)
    try {
      const slug = product?.slug ?? uniqueSlug(name, new Set(menu.products.map((p) => p.slug)))
      setImagePublicId(await uploadProductImage(file, slug))
      toast.success('Foto subida. Se aplica cuando guardes el producto.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir la foto.')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const toggleGroup = (id: string, on: boolean) => {
    setGroupIds((current) => {
      const next = on ? [...current, id] : current.filter((g) => g !== id)
      // Keep the order the owner set in "Opciones".
      return menu.groups.filter((g) => next.includes(g.id)).map((g) => g.id)
    })
  }

  const singles = menu.products.filter((p) => p.type === 'single' && p.id !== product?.id)
  const nameOf = (id: string) => menu.products.find((p) => p.id === id)?.name ?? 'Producto'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? `Editar ${product.name}` : 'Nuevo producto'}
      className="max-w-2xl"
    >
      <form
        onSubmit={(ev) =>
          void handleSubmit((form) => {
            save.mutate(form)
          })(ev)
        }
        className="space-y-4"
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Nombre"
            error={e.name?.message}
            {...register('name')}
            fieldClassName="sm:col-span-2"
          />
          <SelectField label="Categoría" error={e.categoryId?.message} {...register('categoryId')}>
            <option value="">Elegí una…</option>
            {menu.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isActive ? '' : ' (oculta)'}
              </option>
            ))}
          </SelectField>
          <SelectField label="Tipo" {...register('type')}>
            <option value="single">Producto</option>
            <option value="combo">Combo</option>
          </SelectField>
          <TextField
            label="Precio (pesos)"
            inputMode="numeric"
            hint="Sin puntos ni centavos. Ej.: 7200"
            error={e.price?.message}
            {...register('price')}
          />
          <TextField
            label="Presentación"
            hint="Ej.: 3 unidades, 500 ml"
            error={e.unitLabel?.message}
            {...register('unitLabel')}
          />
          <TextAreaField
            label="Descripción"
            rows={2}
            error={e.description?.message}
            {...register('description')}
            fieldClassName="sm:col-span-2"
          />
          <SelectField label="Picante" {...register('spicyLevel')}>
            <option value="0">No pica</option>
            <option value="1">Suave</option>
            <option value="2">Medio</option>
            <option value="3">Fuerte</option>
          </SelectField>
        </div>

        <fieldset>
          <legend className="mb-1 font-bold">Etiquetas</legend>
          <div className="flex flex-wrap gap-4">
            {TAGS.map((t) => (
              <label key={t.id} className="inline-flex min-h-11 items-center gap-2">
                <input type="checkbox" value={t.id} className="size-5" {...register('tags')} />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <p className="mb-1 font-bold">Foto</p>
          <div className="flex items-center gap-4">
            <ProductImage
              publicId={imagePublicId}
              alt=""
              sizes="96px"
              className="size-24 shrink-0 rounded-md object-cover"
            />
            <div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                id="photo"
                tabIndex={-1}
                aria-label="Elegir la foto del producto"
                onChange={(ev) => void onPhoto(ev.target.files?.[0])}
              />
              <Button
                variant="outline"
                loading={uploading}
                leadingIcon={<ImagePlus aria-hidden className="size-5" />}
                onClick={() => fileInput.current?.click()}
              >
                {imagePublicId ? 'Cambiar foto' : 'Subir foto'}
              </Button>
              <p className="mt-1 text-sm text-ink-soft">JPG, PNG o WebP, hasta 5 MB. Cuadrada se ve mejor.</p>
            </div>
          </div>
        </div>

        {menu.groups.length > 0 && (
          <fieldset>
            <legend className="mb-1 font-bold">Opciones que se ofrecen</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {menu.groups
                .filter((g) => g.isActive)
                .map((g) => (
                  <label key={g.id} className="inline-flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={groupIds.includes(g.id)}
                      onChange={(ev) => {
                        toggleGroup(g.id, ev.target.checked)
                      }}
                    />
                    {g.name}
                    <span className="text-sm text-ink-soft">
                      {g.isRequired ? '(obligatorio)' : '(opcional)'}
                    </span>
                  </label>
                ))}
            </div>
          </fieldset>
        )}

        {type === 'combo' && (
          <fieldset className="space-y-2 rounded-md border-2 border-line p-3">
            <legend className="px-1 font-bold">Qué incluye el combo</legend>
            {combo.length === 0 && <p className="text-ink-soft">Agregá los productos que lleva.</p>}
            <ul className="space-y-2">
              {combo.map((c) => (
                <li key={c.productId} className="flex items-center justify-between gap-2">
                  <span>{nameOf(c.productId)}</span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Una unidad menos de ${nameOf(c.productId)}`}
                      disabled={c.quantity <= 1}
                      onClick={() => {
                        setCombo((list) =>
                          list.map((x) =>
                            x.productId === c.productId ? { ...x, quantity: x.quantity - 1 } : x,
                          ),
                        )
                      }}
                      className="grid size-11 place-items-center rounded-md border-2 border-line disabled:opacity-40"
                    >
                      <Minus aria-hidden className="size-4" />
                    </button>
                    <span className="w-6 text-center font-mono">{c.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Una unidad más de ${nameOf(c.productId)}`}
                      onClick={() => {
                        setCombo((list) =>
                          list.map((x) =>
                            x.productId === c.productId ? { ...x, quantity: x.quantity + 1 } : x,
                          ),
                        )
                      }}
                      className="grid size-11 place-items-center rounded-md border-2 border-line"
                    >
                      <Plus aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Sacar ${nameOf(c.productId)} del combo`}
                      onClick={() => {
                        setCombo((list) => list.filter((x) => x.productId !== c.productId))
                      }}
                      className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <select
                aria-label="Producto para agregar al combo"
                value={comboPick}
                onChange={(ev) => {
                  setComboPick(ev.target.value)
                }}
                className="min-h-11 flex-1 rounded-md border-2 border-line bg-card px-2"
              >
                <option value="">Elegí un producto…</option>
                {singles
                  .filter((p) => !combo.some((c) => c.productId === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatARS(p.price)}
                    </option>
                  ))}
              </select>
              <Button
                variant="outline"
                disabled={comboPick === ''}
                onClick={() => {
                  setCombo((list) => [...list, { productId: comboPick, quantity: 1 }])
                  setComboPick('')
                }}
              >
                Agregar
              </Button>
            </div>
          </fieldset>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending || uploading}>
            {product ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
