import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MailPlus, Power } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Dialog'
import { SelectField, TextField } from '@/components/ui/Field'
import { toast } from '@/components/ui/toastStore'
import { ApiError } from '@/lib/api'
import { useStaffStore } from '@/features/staff/store'
import { PageHeader } from '../components/PageHeader'
import {
  fetchTeam,
  inviteFormSchema,
  inviteMember,
  teamKey,
  updateMember,
  type InviteFormInput,
  type InviteFormValues,
  type Member,
} from '../teamApi'

const ROLE_LABEL = { admin: 'Administración', kitchen: 'Cocina' } as const

export function TeamPage() {
  const queryClient = useQueryClient()
  const me = useStaffStore((s) => s.staff)
  const team = useQuery({ queryKey: teamKey, queryFn: fetchTeam })
  const [inviting, setInviting] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: teamKey })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { role?: 'admin' | 'kitchen'; isActive?: boolean } }) =>
      updateMember(id, patch),
    onSuccess: refresh,
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo guardar el cambio.'),
  })

  return (
    <>
      <PageHeader
        title="Equipo"
        description="Quién puede entrar a la cocina y a la administración. No hay registro público: invitás por email y la persona elige su contraseña."
        actions={
          <Button
            leadingIcon={<MailPlus aria-hidden className="size-5" />}
            onClick={() => {
              setInviting(true)
            }}
          >
            Invitar a alguien
          </Button>
        }
      />
      {team.isError && (
        <p role="alert" className="font-bold text-brand-text">
          No pudimos cargar el equipo.
        </p>
      )}
      <ul className="space-y-3">
        {team.data?.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center gap-3 rounded-md border-2 border-line bg-card p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {m.name || m.email} {m.id === me?.id && <Badge tone="neutral">Vos</Badge>}{' '}
                {!m.isActive && <Badge tone="muted">Desactivada</Badge>}
              </p>
              <p className="truncate text-ink-soft">{m.email}</p>
            </div>
            <label className="text-sm">
              <span className="sr-only">Rol de {m.name || m.email}</span>
              <select
                value={m.role}
                onChange={(e) => {
                  update.mutate({
                    id: m.id,
                    patch: { role: e.target.value === 'admin' ? 'admin' : 'kitchen' },
                  })
                }}
                className="min-h-11 rounded-md border-2 border-line bg-card px-2"
              >
                {(Object.keys(ROLE_LABEL) as Member['role'][]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="outline"
              leadingIcon={<Power aria-hidden className="size-4" />}
              onClick={() => {
                update.mutate({ id: m.id, patch: { isActive: !m.isActive } })
              }}
              aria-label={
                m.isActive ? `Desactivar a ${m.name || m.email}` : `Reactivar a ${m.name || m.email}`
              }
            >
              {m.isActive ? 'Desactivar' : 'Reactivar'}
            </Button>
          </li>
        ))}
      </ul>
      {inviting && (
        <InviteForm
          onClose={() => {
            setInviting(false)
          }}
          onSaved={refresh}
        />
      )}
    </>
  )
}

function InviteForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const { register, handleSubmit, formState } = useForm<InviteFormInput, unknown, InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: '', fullName: '', role: 'kitchen' },
  })
  const e = formState.errors
  const invite = useMutation({
    mutationFn: inviteMember,
    onSuccess: async (_data, v) => {
      toast.success(`Le mandamos la invitación a ${v.email}.`)
      await onSaved()
      onClose()
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError || error instanceof Error ? error.message : 'No se pudo invitar.',
      ),
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="Invitar a alguien"
      description="Le llega un email para elegir su contraseña. Podés cambiar el rol o desactivarla cuando quieras."
    >
      <form
        onSubmit={(ev) =>
          void handleSubmit((v) => {
            invite.mutate(v)
          })(ev)
        }
        className="space-y-4"
        noValidate
      >
        <TextField
          label="Email"
          type="email"
          autoComplete="off"
          error={e.email?.message}
          {...register('email')}
        />
        <TextField label="Nombre (opcional)" error={e.fullName?.message} {...register('fullName')} />
        <SelectField label="Rol" {...register('role')}>
          <option value="kitchen">Cocina: ve el tablero y avanza pedidos</option>
          <option value="admin">Administración: todo, incluida la cocina</option>
        </SelectField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={invite.isPending}>
            Enviar invitación
          </Button>
        </div>
      </form>
    </Modal>
  )
}
