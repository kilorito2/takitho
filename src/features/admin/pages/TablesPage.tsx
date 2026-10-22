import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown, Pencil, Plus, Power } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Dialog'
import { TextField } from '@/components/ui/Field'
import { toast } from '@/components/ui/toastStore'
import { isFilled } from '@/lib/links'
import { PageHeader } from '../components/PageHeader'
import { downloadBlob } from '../csv'
import { fetchSettings, settingsKey } from '../settingsApi'
import { nextTableNumber, tableFormSchema, type TableFormInput } from '../tables'
import { fetchTables, saveTable, setTableActive, tablesKey, type AdminTable } from '../tablesApi'

export function TablesPage() {
  const queryClient = useQueryClient()
  const tables = useQuery({ queryKey: tablesKey, queryFn: fetchTables })
  const settings = useQuery({ queryKey: settingsKey, queryFn: fetchSettings })
  const [editing, setEditing] = useState<AdminTable | 'new' | null>(null)
  const [printing, setPrinting] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: tablesKey })
  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setTableActive(id, on),
    onSuccess: refresh,
    onError: () => toast.error('No se pudo cambiar la mesa.'),
  })

  // QR links must point to the public site: the configured address, or this site when it is not set yet.
  const configured = settings.data?.public_url ?? ''
  const hasConfigured = configured !== '' && isFilled(configured)
  const baseUrl = hasConfigured ? configured : window.location.origin
  const active = (tables.data ?? []).filter((t) => t.isActive)

  const print = async () => {
    setPrinting(true)
    try {
      const { buildTableCardsPdf } = await import('../tablesPdf')
      downloadBlob('mesas-takitho.pdf', await buildTableCardsPdf(active, baseUrl))
    } catch {
      toast.error('No se pudo armar el PDF. Probá de nuevo.')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Mesas"
        description="Cada mesa tiene su QR: el cliente lo escanea, pide desde el celular y el pedido te llega con el número de mesa."
        actions={
          <>
            <Button
              variant="outline"
              disabled={active.length === 0}
              loading={printing}
              leadingIcon={<FileDown aria-hidden className="size-5" />}
              onClick={() => void print()}
            >
              Descargar QR (PDF)
            </Button>
            <Button
              leadingIcon={<Plus aria-hidden className="size-5" />}
              onClick={() => {
                setEditing('new')
              }}
            >
              Nueva mesa
            </Button>
          </>
        }
      />
      {!hasConfigured && (
        <p className="mb-4 rounded-md border-2 border-maiz bg-maiz/20 p-3">
          Todavía no cargaste la dirección de la web en «Local». Los QR van a apuntar a {baseUrl}.
        </p>
      )}
      {tables.data?.length === 0 && <p className="text-ink-soft">Todavía no hay mesas.</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tables.data?.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-md border-2 border-line bg-card p-3">
            <p className="font-display text-3xl">{t.number}</p>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{t.label || `Mesa ${t.number}`}</p>
              {!t.isActive && <Badge tone="muted">Fuera de servicio</Badge>}
            </div>
            <button
              type="button"
              aria-label={`Editar mesa ${t.number}`}
              onClick={() => {
                setEditing(t)
              }}
              className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
            >
              <Pencil aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              aria-label={
                t.isActive
                  ? `Sacar de servicio la mesa ${t.number}`
                  : `Volver a poner en servicio la mesa ${t.number}`
              }
              onClick={() => {
                toggle.mutate({ id: t.id, on: !t.isActive })
              }}
              className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
            >
              <Power aria-hidden className="size-5" />
            </button>
          </li>
        ))}
      </ul>
      {editing && (
        <TableForm
          key={editing === 'new' ? 'new' : editing.id}
          table={editing === 'new' ? null : editing}
          taken={(tables.data ?? []).map((t) => t.number)}
          onClose={() => {
            setEditing(null)
          }}
          onSaved={refresh}
        />
      )}
    </>
  )
}

function TableForm({
  table,
  taken,
  onClose,
  onSaved,
}: {
  table: AdminTable | null
  taken: number[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { register, handleSubmit, formState } = useForm<
    TableFormInput,
    unknown,
    { number: number; label: string }
  >({
    resolver: zodResolver(tableFormSchema),
    defaultValues: { number: String(table?.number ?? nextTableNumber(taken)), label: table?.label ?? '' },
  })
  const save = useMutation({
    mutationFn: (v: { number: number; label: string }) =>
      saveTable({ ...(table ? { id: table.id } : {}), ...v }),
    onSuccess: async () => {
      toast.success(table ? 'Mesa actualizada.' : 'Mesa creada.')
      await onSaved()
      onClose()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo guardar.'),
  })
  return (
    <Modal open onClose={onClose} title={table ? `Editar mesa ${table.number}` : 'Nueva mesa'}>
      <form
        onSubmit={(ev) =>
          void handleSubmit((v) => {
            save.mutate(v)
          })(ev)
        }
        className="space-y-4"
        noValidate
      >
        <TextField
          label="Número"
          inputMode="numeric"
          error={formState.errors.number?.message}
          {...register('number')}
        />
        <TextField
          label="Nombre (opcional)"
          hint="Ej.: Patio, Barra"
          error={formState.errors.label?.message}
          {...register('label')}
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
