import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Pencil, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Dialog'
import { TextField } from '@/components/ui/Field'
import { toast } from '@/components/ui/toastStore'
import { formatARS } from '@/lib/money'
import { cn } from '@/lib/cn'
import { SortableList } from '../../components/SortableList'
import {
  saveGroup,
  saveModifier,
  saveOrder,
  setGroupActive,
  setModifierActive,
  setModifierAvailable,
  type AdminGroup,
  type AdminMenu,
  type AdminModifier,
} from '../../menuApi'
import { groupFormSchema, type GroupFormInput } from '../../menuLib'

export function GroupsTab({ menu }: { menu: AdminMenu }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<AdminGroup | 'new' | null>(null)
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'menu'] })
    await queryClient.invalidateQueries({ queryKey: ['menu'] })
  }
  const fail = () => toast.error('No se pudo guardar el cambio.')
  const reorderGroups = useMutation({
    mutationFn: (ids: string[]) => saveOrder('modifier_groups', ids),
    onSuccess: refresh,
    onError: fail,
  })
  const reorderModifiers = useMutation({
    mutationFn: (ids: string[]) => saveOrder('modifiers', ids),
    onSuccess: refresh,
    onError: fail,
  })
  const groupActive = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setGroupActive(id, on),
    onSuccess: refresh,
    onError: fail,
  })
  const modifierActive = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setModifierActive(id, on),
    onSuccess: refresh,
    onError: fail,
  })
  const modifierAvailable = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setModifierAvailable(id, on),
    onSuccess: refresh,
    onError: fail,
  })
  const [modifierEdit, setModifierEdit] = useState<{
    group: AdminGroup
    modifier: AdminModifier | null
  } | null>(null)

  const rule = (g: AdminGroup) =>
    g.maxSelect === 1
      ? g.isRequired
        ? 'Obligatorio · elige 1'
        : 'Opcional · elige 1'
      : `${g.isRequired ? 'Obligatorio' : 'Opcional'} · de ${g.minSelect} a ${g.maxSelect}`

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-ink-soft">
          Grupos de opciones que después se asignan a cada producto: tortilla, salsas, extras. El precio de
          una opción se suma al del producto.
        </p>
        <Button
          leadingIcon={<Plus aria-hidden className="size-5" />}
          onClick={() => {
            setEditing('new')
          }}
        >
          Nuevo grupo
        </Button>
      </div>

      <SortableList
        items={menu.groups}
        label="Grupos de opciones"
        nameOf={(g) => g.name}
        disabled={reorderGroups.isPending}
        onReorder={(ids) => {
          reorderGroups.mutate(ids)
        }}
      >
        {(g) => (
          <div>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {g.name} {!g.isActive && <Badge tone="muted">Oculto</Badge>}
                </p>
                <p className="text-sm text-ink-soft">
                  {rule(g)} · en {menu.products.filter((p) => p.groupIds.includes(g.id)).length} productos
                </p>
              </div>
              <button
                type="button"
                aria-label={`Editar ${g.name}`}
                onClick={() => {
                  setEditing(g)
                }}
                className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
              >
                <Pencil aria-hidden className="size-5" />
              </button>
              <button
                type="button"
                aria-label={g.isActive ? `Ocultar ${g.name}` : `Mostrar ${g.name}`}
                onClick={() => {
                  groupActive.mutate({ id: g.id, on: !g.isActive })
                }}
                className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
              >
                {g.isActive ? (
                  <EyeOff aria-hidden className="size-5" />
                ) : (
                  <Eye aria-hidden className="size-5" />
                )}
              </button>
            </div>
            <div className="mt-2 border-t-2 border-dashed border-line pt-2">
              <SortableList
                items={g.modifiers}
                label={`Opciones de ${g.name}`}
                nameOf={(m) => m.name}
                disabled={reorderModifiers.isPending}
                onReorder={(ids) => {
                  reorderModifiers.mutate(ids)
                }}
              >
                {(m) => (
                  <div className={cn('flex items-center gap-2', !m.isActive && 'opacity-60')}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        {m.name} {!m.isActive && <Badge tone="muted">Oculta</Badge>}
                      </p>
                      <p className="text-sm text-ink-soft">
                        {m.priceDelta === 0 ? 'Sin costo' : `+ ${formatARS(m.priceDelta)}`}
                      </p>
                    </div>
                    <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={m.isAvailable}
                        onChange={(e) => {
                          modifierAvailable.mutate({ id: m.id, on: e.target.checked })
                        }}
                        aria-label={`${m.name}: disponible`}
                      />
                      <span className="hidden sm:inline">{m.isAvailable ? 'Disponible' : 'Agotada'}</span>
                    </label>
                    <button
                      type="button"
                      aria-label={`Editar ${m.name}`}
                      onClick={() => {
                        setModifierEdit({ group: g, modifier: m })
                      }}
                      className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
                    >
                      <Pencil aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={m.isActive ? `Ocultar ${m.name}` : `Mostrar ${m.name}`}
                      onClick={() => {
                        modifierActive.mutate({ id: m.id, on: !m.isActive })
                      }}
                      className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
                    >
                      {m.isActive ? (
                        <EyeOff aria-hidden className="size-4" />
                      ) : (
                        <Eye aria-hidden className="size-4" />
                      )}
                    </button>
                  </div>
                )}
              </SortableList>
              <Button
                variant="ghost"
                className="mt-1"
                leadingIcon={<Plus aria-hidden className="size-4" />}
                onClick={() => {
                  setModifierEdit({ group: g, modifier: null })
                }}
              >
                Agregar opción a {g.name}
              </Button>
            </div>
          </div>
        )}
      </SortableList>

      {editing && (
        <GroupForm
          key={editing === 'new' ? 'new' : editing.id}
          group={editing === 'new' ? null : editing}
          menu={menu}
          onClose={() => {
            setEditing(null)
          }}
          onSaved={refresh}
        />
      )}
      {modifierEdit && (
        <ModifierForm
          key={modifierEdit.modifier?.id ?? `new-${modifierEdit.group.id}`}
          {...modifierEdit}
          onClose={() => {
            setModifierEdit(null)
          }}
          onSaved={refresh}
        />
      )}
    </>
  )
}

function GroupForm({
  group,
  menu,
  onClose,
  onSaved,
}: {
  group: AdminGroup | null
  menu: AdminMenu
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { register, handleSubmit, formState } = useForm<
    GroupFormInput,
    unknown,
    { name: string; isRequired: boolean; minSelect: number; maxSelect: number }
  >({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      name: group?.name ?? '',
      isRequired: group?.isRequired ?? false,
      minSelect: String(group?.minSelect ?? 0),
      maxSelect: String(group?.maxSelect ?? 1),
    },
  })
  const e = formState.errors
  const save = useMutation({
    mutationFn: (form: { name: string; isRequired: boolean; minSelect: number; maxSelect: number }) =>
      saveGroup({ ...(group ? { id: group.id } : {}), ...form }, menu.groups),
    onSuccess: async () => {
      toast.success(group ? 'Grupo actualizado.' : 'Grupo creado.')
      await onSaved()
      onClose()
    },
    onError: () => toast.error('No se pudo guardar el grupo.'),
  })
  return (
    <Modal open onClose={onClose} title={group ? `Editar ${group.name}` : 'Nuevo grupo de opciones'}>
      <form
        onSubmit={(ev) =>
          void handleSubmit((form) => {
            save.mutate(form)
          })(ev)
        }
        className="space-y-4"
        noValidate
      >
        <TextField
          label="Nombre"
          hint="Ej.: Tortilla, Salsas, Extras"
          error={e.name?.message}
          {...register('name')}
        />
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5" {...register('isRequired')} />
          Es obligatorio elegir
        </label>
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Mínimo a elegir"
            inputMode="numeric"
            error={e.minSelect?.message}
            {...register('minSelect')}
          />
          <TextField
            label="Máximo a elegir"
            inputMode="numeric"
            error={e.maxSelect?.message}
            {...register('maxSelect')}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ModifierForm({
  group,
  modifier,
  onClose,
  onSaved,
}: {
  group: AdminGroup
  modifier: AdminModifier | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [name, setName] = useState(modifier?.name ?? '')
  const [price, setPrice] = useState(String(modifier?.priceDelta ?? 0))
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (values: { name: string; priceDelta: number }) =>
      saveModifier(
        { ...(modifier ? { id: modifier.id } : {}), groupId: group.id, ...values },
        group.modifiers,
      ),
    onSuccess: async () => {
      toast.success(modifier ? 'Opción actualizada.' : 'Opción agregada.')
      await onSaved()
      onClose()
    },
    onError: () => toast.error('No se pudo guardar la opción.'),
  })
  const submit = () => {
    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > 40) {
      setError('Poné un nombre de hasta 40 letras.')
      return
    }
    if (!/^-?\d+$/.test(price.trim())) {
      setError('El precio es un número entero (0 si no cuesta).')
      return
    }
    setError(null)
    save.mutate({ name: trimmed, priceDelta: Number(price.trim()) })
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={modifier ? `Editar ${modifier.name}` : `Nueva opción en ${group.name}`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="space-y-4"
        noValidate
      >
        <TextField
          label="Nombre"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
          }}
        />
        <TextField
          label="Suma al precio (pesos)"
          inputMode="numeric"
          hint="0 si no cuesta. Puede ser negativo si descuenta."
          value={price}
          onChange={(e) => {
            setPrice(e.target.value)
          }}
        />
        {error && (
          <p role="alert" className="text-sm font-bold text-brand-text">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
