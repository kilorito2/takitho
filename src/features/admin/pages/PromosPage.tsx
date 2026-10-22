import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Power } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Dialog'
import { SelectField, TextField } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toastStore'
import { useMenu } from '@/features/catalog/hooks'
import { PageHeader } from '../components/PageHeader'
import {
  couponFormSchema,
  couponToRow,
  describeCoupon,
  WEEKDAYS,
  type CouponFormInput,
  type CouponFormValues,
} from '../promos'
import { couponsKey, fetchCoupons, saveCoupon, setCouponActive, type AdminCoupon } from '../promosApi'

const KIND_LABEL = { percent: 'Porcentaje', fixed: 'Monto fijo', two_for_one: '2x1' } as const

const dayOf = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

export function PromosPage() {
  const queryClient = useQueryClient()
  const coupons = useQuery({ queryKey: couponsKey, queryFn: fetchCoupons })
  const [editing, setEditing] = useState<AdminCoupon | 'new' | null>(null)
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: couponsKey })
    await queryClient.invalidateQueries({ queryKey: ['promos'] })
  }
  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setCouponActive(id, on),
    onSuccess: refresh,
    onError: () => toast.error('No se pudo cambiar el cupón.'),
  })

  return (
    <>
      <PageHeader
        title="Promos y cupones"
        description="Cupones con código y promociones que se aplican solas (aparecen en el inicio). Los días de la semana cuentan por día de negocio."
        actions={
          <Button
            leadingIcon={<Plus aria-hidden className="size-5" />}
            onClick={() => {
              setEditing('new')
            }}
          >
            Nueva promo
          </Button>
        }
      />
      {coupons.isPending && <Skeleton className="h-48" />}
      {coupons.isError && (
        <p role="alert" className="font-bold text-brand-text">
          No pudimos cargar las promos.
        </p>
      )}
      {coupons.data?.length === 0 && <p className="text-ink-soft">Todavía no creaste ninguna promo.</p>}
      <ul className="space-y-3">
        {coupons.data?.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-3 rounded-md border-2 border-line bg-card p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {c.label} {c.code && <Badge tone="neutral">{c.code}</Badge>}{' '}
                {c.auto_apply && <Badge tone="promo">Se aplica sola</Badge>}{' '}
                {!c.is_active && <Badge tone="muted">Pausada</Badge>}
              </p>
              <p className="text-ink-soft">{describeCoupon(c)}</p>
              <p className="text-sm text-ink-soft">
                Usada {c.uses_count} {c.uses_count === 1 ? 'vez' : 'veces'}
                {c.max_uses ? ` de ${c.max_uses}` : ''}
              </p>
            </div>
            <Button
              variant="outline"
              leadingIcon={<Pencil aria-hidden className="size-4" />}
              onClick={() => {
                setEditing(c)
              }}
              aria-label={`Editar ${c.label}`}
            >
              Editar
            </Button>
            <Button
              variant="outline"
              leadingIcon={<Power aria-hidden className="size-4" />}
              onClick={() => {
                toggle.mutate({ id: c.id, on: !c.is_active })
              }}
              aria-label={c.is_active ? `Pausar ${c.label}` : `Reactivar ${c.label}`}
            >
              {c.is_active ? 'Pausar' : 'Reactivar'}
            </Button>
          </li>
        ))}
      </ul>
      {editing && (
        <CouponForm
          key={editing === 'new' ? 'new' : editing.id}
          coupon={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null)
          }}
          onSaved={refresh}
        />
      )}
    </>
  )
}

function CouponForm({
  coupon,
  onClose,
  onSaved,
}: {
  coupon: AdminCoupon | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const menu = useMenu()
  const { register, handleSubmit, control, formState } = useForm<CouponFormInput, unknown, CouponFormValues>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: {
      code: coupon?.code ?? '',
      label: coupon?.label ?? '',
      kind: coupon?.kind ?? 'percent',
      value: coupon ? String(coupon.value) : '',
      scope: coupon?.scope ?? 'all',
      categoryId: coupon?.scope === 'category' ? (coupon.scope_ids[0] ?? '') : '',
      productIds: coupon?.scope === 'products' ? coupon.scope_ids : [],
      weekdays: coupon?.weekdays ?? [],
      startsAt: dayOf(coupon?.starts_at ?? null),
      endsAt: dayOf(coupon?.ends_at ?? null),
      maxUses: coupon?.max_uses ? String(coupon.max_uses) : '',
      maxUsesPerPhone: coupon?.max_uses_per_phone ? String(coupon.max_uses_per_phone) : '',
      minPurchase: coupon?.min_purchase ? String(coupon.min_purchase) : '',
      autoApply: coupon?.auto_apply ?? false,
      isActive: coupon?.is_active ?? true,
    },
  })
  const kind = useWatch({ control, name: 'kind' })
  const scope = useWatch({ control, name: 'scope' })
  const e = formState.errors

  const save = useMutation({
    mutationFn: (form: CouponFormValues) => saveCoupon(coupon?.id, couponToRow(form)),
    onSuccess: async () => {
      toast.success(coupon ? 'Promo actualizada.' : 'Promo creada.')
      await onSaved()
      onClose()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo guardar.'),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={coupon ? `Editar ${coupon.label}` : 'Nueva promo'}
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
            label="Nombre que ve el cliente"
            error={e.label?.message}
            {...register('label')}
            fieldClassName="sm:col-span-2"
          />
          <TextField
            label="Código (opcional si se aplica sola)"
            autoCapitalize="characters"
            hint="Ej.: BIENVENIDA10"
            error={e.code?.message}
            {...register('code')}
          />
          <label className="inline-flex min-h-12 items-center gap-2 self-end">
            <input type="checkbox" className="size-5" {...register('autoApply')} />
            Se aplica sola (sin código)
          </label>
          <SelectField label="Tipo de descuento" {...register('kind')}>
            {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </SelectField>
          {kind !== 'two_for_one' && (
            <TextField
              label={kind === 'percent' ? 'Porcentaje' : 'Monto (pesos)'}
              inputMode="numeric"
              error={e.value?.message}
              {...register('value')}
            />
          )}
          <SelectField label="Se aplica a" error={e.scope?.message} {...register('scope')}>
            <option value="all">Todo el pedido</option>
            <option value="category">Una categoría</option>
            <option value="products">Productos puntuales</option>
          </SelectField>
          {scope === 'category' && (
            <SelectField label="Categoría" error={e.categoryId?.message} {...register('categoryId')}>
              <option value="">Elegí una…</option>
              {menu.data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          )}
        </div>

        {scope === 'products' && (
          <Controller
            control={control}
            name="productIds"
            render={({ field }) => (
              <fieldset>
                <legend className="mb-1 font-bold">Productos</legend>
                <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                  {menu.data?.products.map((p) => (
                    <label key={p.id} className="inline-flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={field.value.includes(p.id)}
                        onChange={(ev) => {
                          field.onChange(
                            ev.target.checked
                              ? [...field.value, p.id]
                              : field.value.filter((id) => id !== p.id),
                          )
                        }}
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
                {e.productIds?.message && (
                  <p role="alert" className="mt-1 text-sm font-bold text-brand-text">
                    {e.productIds.message}
                  </p>
                )}
              </fieldset>
            )}
          />
        )}

        <Controller
          control={control}
          name="weekdays"
          render={({ field }) => (
            <fieldset>
              <legend className="mb-1 font-bold">Días de la semana</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => {
                  const on = field.value.includes(d.id)
                  return (
                    <label
                      key={d.id}
                      className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border-2 px-4 font-bold has-[:focus-visible]:outline-2 ${on ? 'border-ink bg-ink text-paper-bg' : 'border-line'}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={(ev) => {
                          field.onChange(
                            ev.target.checked
                              ? [...field.value, d.id]
                              : field.value.filter((x) => x !== d.id),
                          )
                        }}
                      />
                      {d.label}
                    </label>
                  )
                })}
              </div>
              <p className="mt-1 text-sm text-ink-soft">Sin marcar = todos los días.</p>
            </fieldset>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Desde (opcional)" type="date" {...register('startsAt')} />
          <TextField label="Hasta (opcional)" type="date" error={e.endsAt?.message} {...register('endsAt')} />
          <TextField
            label="Compra mínima (pesos)"
            inputMode="numeric"
            error={e.minPurchase?.message}
            {...register('minPurchase')}
          />
          <TextField
            label="Usos máximos en total"
            inputMode="numeric"
            error={e.maxUses?.message}
            {...register('maxUses')}
          />
          <TextField
            label="Usos máximos por teléfono"
            inputMode="numeric"
            error={e.maxUsesPerPhone?.message}
            {...register('maxUsesPerPhone')}
          />
          <label className="inline-flex min-h-12 items-center gap-2 self-end">
            <input type="checkbox" className="size-5" {...register('isActive')} />
            Activa
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            {coupon ? 'Guardar cambios' : 'Crear promo'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
