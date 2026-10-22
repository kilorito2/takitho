import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Pencil, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Dialog'
import { TextField } from '@/components/ui/Field'
import { toast } from '@/components/ui/toastStore'
import { formatARS } from '@/lib/money'
import { Panel } from '../../components/PageHeader'
import { SortableList } from '../../components/SortableList'
import { zoneFormSchema, type ZoneFormInput } from '../../settings'
import {
  fetchAdminZones,
  saveZone,
  saveZoneOrder,
  setZoneActive,
  zonesKey,
  type AdminZone,
} from '../../settingsApi'

export function ZonesEditor() {
  const queryClient = useQueryClient()
  const zones = useQuery({ queryKey: zonesKey, queryFn: fetchAdminZones })
  const [editing, setEditing] = useState<AdminZone | 'new' | null>(null)
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: zonesKey })
    await queryClient.invalidateQueries({ queryKey: ['zones'] })
  }
  const fail = () => toast.error('No se pudo guardar el cambio.')
  const reorder = useMutation({ mutationFn: saveZoneOrder, onSuccess: refresh, onError: fail })
  const active = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setZoneActive(id, on),
    onSuccess: refresh,
    onError: fail,
  })

  return (
    <Panel
      title="Zonas de delivery"
      actions={
        <Button
          variant="outline"
          leadingIcon={<Plus aria-hidden className="size-4" />}
          onClick={() => {
            setEditing('new')
          }}
        >
          Nueva zona
        </Button>
      }
    >
      {zones.data?.length === 0 && (
        <p className="text-ink-soft">Sin zonas: los clientes no pueden pedir delivery.</p>
      )}
      <SortableList
        items={zones.data ?? []}
        label="Zonas de delivery"
        nameOf={(z) => z.name}
        disabled={reorder.isPending}
        onReorder={(ids) => {
          reorder.mutate(ids)
        }}
      >
        {(z) => (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {z.name} {!z.isActive && <Badge tone="muted">Pausada</Badge>}
              </p>
              <p className="text-sm text-ink-soft">
                Envío {formatARS(z.fee)} · mínimo {formatARS(z.minOrder)}
                {z.neighborhoods.length > 0 ? ` · ${z.neighborhoods.join(', ')}` : ''}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Editar ${z.name}`}
              onClick={() => {
                setEditing(z)
              }}
              className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
            >
              <Pencil aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              aria-label={z.isActive ? `Pausar ${z.name}` : `Reactivar ${z.name}`}
              onClick={() => {
                active.mutate({ id: z.id, on: !z.isActive })
              }}
              className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
            >
              {z.isActive ? (
                <EyeOff aria-hidden className="size-5" />
              ) : (
                <Eye aria-hidden className="size-5" />
              )}
            </button>
          </div>
        )}
      </SortableList>
      {editing && (
        <ZoneForm
          key={editing === 'new' ? 'new' : editing.id}
          zone={editing === 'new' ? null : editing}
          all={zones.data ?? []}
          onClose={() => {
            setEditing(null)
          }}
          onSaved={refresh}
        />
      )}
    </Panel>
  )
}

function ZoneForm({
  zone,
  all,
  onClose,
  onSaved,
}: {
  zone: AdminZone | null
  all: AdminZone[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { register, handleSubmit, formState } = useForm<
    ZoneFormInput,
    unknown,
    { name: string; neighborhoods: string; fee: number; minOrder: number }
  >({
    resolver: zodResolver(zoneFormSchema),
    defaultValues: {
      name: zone?.name ?? '',
      neighborhoods: zone?.neighborhoods.join(', ') ?? '',
      fee: String(zone?.fee ?? ''),
      minOrder: String(zone?.minOrder ?? ''),
    },
  })
  const e = formState.errors
  const save = useMutation({
    mutationFn: (v: { name: string; neighborhoods: string; fee: number; minOrder: number }) =>
      saveZone({ ...(zone ? { id: zone.id } : {}), ...v }, all),
    onSuccess: async () => {
      toast.success(zone ? 'Zona actualizada.' : 'Zona creada.')
      await onSaved()
      onClose()
    },
    onError: () => toast.error('No se pudo guardar la zona.'),
  })
  return (
    <Modal open onClose={onClose} title={zone ? `Editar ${zone.name}` : 'Nueva zona'}>
      <form
        onSubmit={(ev) =>
          void handleSubmit((v) => {
            save.mutate(v)
          })(ev)
        }
        className="space-y-4"
        noValidate
      >
        <TextField label="Nombre" error={e.name?.message} {...register('name')} />
        <TextField
          label="Barrios"
          hint="Separados por coma. Se le muestran al cliente."
          error={e.neighborhoods?.message}
          {...register('neighborhoods')}
        />
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Costo de envío (pesos)"
            inputMode="numeric"
            error={e.fee?.message}
            {...register('fee')}
          />
          <TextField
            label="Pedido mínimo (pesos)"
            inputMode="numeric"
            error={e.minOrder?.message}
            {...register('minOrder')}
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
