import { staffClient } from '@/lib/supabaseStaff'
import type { CouponRow } from './promos'

export interface AdminCoupon extends CouponRow {
  id: string
  uses_count: number
}

export const couponsKey = ['admin', 'coupons'] as const

export async function fetchCoupons(): Promise<AdminCoupon[]> {
  const { data, error } = await staffClient()
    .from('coupons')
    .select(
      'id, code, label, kind, value, scope, scope_ids, weekdays, starts_at, ends_at, max_uses, uses_count, max_uses_per_phone, min_purchase, auto_apply, is_active',
    )
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data
}

/** Friendly message for the one failure the owner can cause: a code that already exists. */
function explain(error: { message: string; code?: string }): Error {
  return new Error(error.code === '23505' ? 'Ya existe un cupón con ese código.' : error.message)
}

export async function saveCoupon(id: string | undefined, row: CouponRow): Promise<void> {
  const { error } = id
    ? await staffClient().from('coupons').update(row).eq('id', id)
    : await staffClient().from('coupons').insert(row)
  if (error) throw explain(error)
}

export async function setCouponActive(id: string, active: boolean): Promise<void> {
  const { error } = await staffClient().from('coupons').update({ is_active: active }).eq('id', id)
  if (error) throw new Error(error.message)
}
