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
import { SortableList } from '../../components/SortableList'
import { saveCategory, saveOrder, setCategoryActive, type AdminCategory, type AdminMenu } from '../../menuApi'
import { categoryFormSchema, type CategoryFormInput } from '../../menuLib'

export function CategoriesTab({ menu }: { menu: AdminMenu }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<AdminCategory | 'new' | null>(null)
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'menu'] })
    await queryClient.invalidateQueries({ queryKey: ['menu'] })
  }
  const fail = () => toast.error('No se pudo guardar el cambio.')
  const reorder = useMutation({
    mutationFn: (ids: string[]) => saveOrder('categories', ids),
    onSuccess: refresh,
    onError: fail,
  })
  const active = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setCategoryActive(id, on),
    onSuccess: refresh,
    onError: fail,
  })

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-ink-soft">
          El orden de acá es el orden del menú. Ocultar una categoría la saca del menú sin borrar sus
          productos.
        </p>
        <Button
          leadingIcon={<Plus aria-hidden className="size-5" />}
          onClick={() => {
            setEditing('new')
          }}
        >
          Nueva categoría
        </Button>
      </div>
      <SortableList
        items={menu.categories}
        label="Categorías"
        nameOf={(c) => c.name}
        disabled={reorder.isPending}
        onReorder={(ids) => {
          reorder.mutate(ids)
        }}
      >
        {(c) => (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {c.name} {!c.isActive && <Badge tone="muted">Oculta</Badge>}
              </p>
              <p className="truncate text-sm text-ink-soft">
                {menu.products.filter((p) => p.categoryId === c.id).length} productos
                {c.description ? ` · ${c.description}` : ''}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Editar ${c.name}`}
              onClick={() => {
                setEditing(c)
              }}
              className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
            >
              <Pencil aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              aria-label={c.isActive ? `Ocultar ${c.name}` : `Mostrar ${c.name}`}
              onClick={() => {
                active.mutate({ id: c.id, on: !c.isActive })
              }}
              className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
            >
              {c.isActive ? (
                <EyeOff aria-hidden className="size-5" />
              ) : (
                <Eye aria-hidden className="size-5" />
              )}
            </button>
          </div>
        )}
      </SortableList>
      {editing && (
        <CategoryForm
          key={editing === 'new' ? 'new' : editing.id}
          category={editing === 'new' ? null : editing}
          menu={menu}
          onClose={() => {
            setEditing(null)
          }}
          onSaved={refresh}
        />
      )}
    </>
  )
}

function CategoryForm({
  category,
  menu,
  onClose,
  onSaved,
}: {
  category: AdminCategory | null
  menu: AdminMenu
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { register, handleSubmit, formState } = useForm<CategoryFormInput>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: category?.name ?? '', description: category?.description ?? '' },
  })
  const save = useMutation({
    mutationFn: (form: CategoryFormInput) =>
      saveCategory(
        {
          ...(category ? { id: category.id } : {}),
          name: form.name.trim(),
          description: form.description.trim(),
        },
        menu.categories,
      ),
    onSuccess: async () => {
      toast.success(category ? 'Categoría actualizada.' : 'Categoría creada.')
      await onSaved()
      onClose()
    },
    onError: () => toast.error('No se pudo guardar la categoría.'),
  })
  return (
    <Modal open onClose={onClose} title={category ? `Editar ${category.name}` : 'Nueva categoría'}>
      <form
        onSubmit={(e) =>
          void handleSubmit((form) => {
            save.mutate(form)
          })(e)
        }
        className="space-y-4"
        noValidate
      >
        <TextField label="Nombre" error={formState.errors.name?.message} {...register('name')} />
        <TextField
          label="Descripción (opcional)"
          error={formState.errors.description?.message}
          {...register('description')}
        />
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
