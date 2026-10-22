import { z } from 'zod'
import { api } from '@/lib/client'
import { staffClient } from '@/lib/supabaseStaff'

export const teamKey = ['admin', 'team'] as const

export interface Member {
  id: string
  name: string
  email: string
  role: 'admin' | 'kitchen'
  isActive: boolean
}

export async function fetchTeam(): Promise<Member[]> {
  const { data, error } = await staffClient()
    .from('profiles')
    .select('id, full_name, email, role, is_active')
    .order('created_at')
  if (error) throw new Error(error.message)
  return data.map((p) => ({
    id: p.id,
    name: p.full_name,
    email: p.email,
    role: p.role,
    isActive: p.is_active,
  }))
}

/** The database refuses to leave the shop without an active admin (`LAST_ADMIN`); say it in words. */
function explain(message: string): Error {
  return new Error(
    message.includes('LAST_ADMIN')
      ? 'No se puede: tiene que quedar al menos una persona administradora activa.'
      : message,
  )
}

export async function updateMember(
  id: string,
  patch: { role?: 'admin' | 'kitchen'; isActive?: boolean },
): Promise<void> {
  const { error } = await staffClient()
    .from('profiles')
    .update({
      ...(patch.role ? { role: patch.role } : {}),
      ...(patch.isActive === undefined ? {} : { is_active: patch.isActive }),
    })
    .eq('id', id)
  if (error) throw explain(error.message)
}

export const inviteFormSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Escribí un email válido.')),
  fullName: z.string().trim().max(60, 'Máximo 60 letras.'),
  role: z.enum(['admin', 'kitchen']),
})
export type InviteFormInput = z.input<typeof inviteFormSchema>
export type InviteFormValues = z.output<typeof inviteFormSchema>

export async function inviteMember(v: InviteFormValues): Promise<void> {
  const session = (await staffClient().auth.getSession()).data.session
  if (!session) throw new Error('Tu sesión venció. Volvé a entrar.')
  await api().call(
    'invite-staff',
    { email: v.email, role: v.role, ...(v.fullName ? { full_name: v.fullName } : {}) },
    { accessToken: session.access_token },
  )
}
