import { z } from 'zod'
import { staffClient } from '@/lib/supabaseStaff'

const num = z.number()
const dashboardSchema = z.object({
  from: z.string(),
  to: z.string(),
  totals: z.object({
    orders: num,
    sales: num,
    avg_ticket: num,
    tips: num,
    delivery_fees: num,
    discounts: num,
  }),
  by_day: z.array(z.object({ date: z.string(), orders: num, sales: num })),
  top_products: z.array(z.object({ name: z.string(), quantity: num, revenue: num })),
  by_hour: z.array(z.object({ hour: num, orders: num })),
  payment_mix: z.array(z.object({ method: z.string(), orders: num, sales: num })),
  by_type: z.array(z.object({ type: z.string(), orders: num, sales: num })),
})

export type Dashboard = z.infer<typeof dashboardSchema>

export async function fetchDashboard(from: string, to: string): Promise<Dashboard> {
  const { data, error } = await staffClient().rpc('admin_dashboard', { p_from: from, p_to: to })
  if (error) throw new Error(error.message)
  return dashboardSchema.parse(data)
}

export const alertsKey = ['admin', 'alerts'] as const

export interface AdminAlert {
  id: string
  kind: string
  orderId: string | null
  message: string
  createdAt: string
}

export async function fetchAlerts(): Promise<AdminAlert[]> {
  const { data, error } = await staffClient()
    .from('admin_alerts')
    .select('id, kind, order_id, message, created_at')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return data.map((a) => ({
    id: a.id,
    kind: a.kind,
    orderId: a.order_id,
    message: a.message,
    createdAt: a.created_at,
  }))
}

export async function resolveAlert(id: string): Promise<void> {
  const { error } = await staffClient()
    .from('admin_alerts')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
