import { staffClient } from '@/lib/supabaseStaff'

export const tablesKey = ['admin', 'tables'] as const

export interface AdminTable {
  id: string
  number: number
  label: string
  isActive: boolean
}

export async function fetchTables(): Promise<AdminTable[]> {
  const { data, error } = await staffClient()
    .from('tables')
    .select('id, number, label, is_active')
    .order('number')
  if (error) throw new Error(error.message)
  return data.map((t) => ({ id: t.id, number: t.number, label: t.label, isActive: t.is_active }))
}

export async function saveTable(input: { id?: string; number: number; label: string }): Promise<void> {
  const db = staffClient()
  const { error } = input.id
    ? await db.from('tables').update({ number: input.number, label: input.label }).eq('id', input.id)
    : await db.from('tables').insert({ number: input.number, label: input.label })
  if (error) throw new Error(error.code === '23505' ? 'Ya existe una mesa con ese número.' : error.message)
}

export async function setTableActive(id: string, active: boolean): Promise<void> {
  const { error } = await staffClient().from('tables').update({ is_active: active }).eq('id', id)
  if (error) throw new Error(error.message)
}
