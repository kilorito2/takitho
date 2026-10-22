import { staffClient } from '@/lib/supabaseStaff'
import { parseNeighborhoods, parseTipPresets, type SettingsFormValues, type ShiftDraft } from './settings'

export const settingsKey = ['admin', 'settings'] as const
export const hoursKey = ['admin', 'hours'] as const
export const zonesKey = ['admin', 'zones'] as const

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/* ----------------------------------------------------------------- store settings */

export async function fetchSettings() {
  const { data, error } = await staffClient().from('store_settings').select('*').eq('id', 1).single()
  check(error)
  return data
}

export type StoreSettingsRow = NonNullable<Awaited<ReturnType<typeof fetchSettings>>>

export async function saveSettings(v: SettingsFormValues): Promise<void> {
  const { error } = await staffClient()
    .from('store_settings')
    .update({
      name: v.name,
      tagline: v.tagline,
      address: v.address,
      maps_url: v.mapsUrl,
      whatsapp: v.whatsapp,
      instagram: v.instagram,
      facebook: v.facebook,
      tiktok: v.tiktok,
      public_url: v.publicUrl,
      transfer_alias: v.transferAlias,
      transfer_cbu: v.transferCbu.replaceAll(' ', ''),
      transfer_holder: v.transferHolder,
      prep_minutes: v.prepMinutes,
      timer_warn_minutes: v.timerWarnMinutes,
      timer_late_minutes: v.timerLateMinutes,
      pending_payment_ttl_min: v.pendingPaymentTtlMin,
      max_schedule_days: v.maxScheduleDays,
      tip_presets: parseTipPresets(v.tipPresets) ?? [0, 5, 10],
      pay_mp_enabled: v.payMpEnabled,
      pay_cash_enabled: v.payCashEnabled,
      pay_transfer_enabled: v.payTransferEnabled,
      is_paused: v.isPaused,
      is_closed_manually: v.isClosedManually,
      accepts_scheduled_when_closed: v.acceptsScheduledWhenClosed,
    })
    .eq('id', 1)
  check(error)
}

/* ----------------------------------------------------------------- opening hours */

export async function fetchShifts(): Promise<ShiftDraft[]> {
  const { data, error } = await staffClient()
    .from('opening_hours')
    .select('weekday, opens_at, closes_at')
    .order('weekday')
    .order('opens_at')
  check(error)
  return (data ?? []).map((r) => ({
    weekday: r.weekday,
    opensAt: r.opens_at.slice(0, 5),
    closesAt: r.closes_at.slice(0, 5),
  }))
}

/** The whole week is replaced atomically in Postgres (`replace_opening_hours`), never half-written. */
export async function saveShifts(shifts: readonly ShiftDraft[]): Promise<void> {
  const { error } = await staffClient().rpc('replace_opening_hours', {
    p_shifts: shifts.map((s) => ({ weekday: s.weekday, opens_at: s.opensAt, closes_at: s.closesAt })),
  })
  check(error)
}

/* ----------------------------------------------------------------- delivery zones */

export interface AdminZone {
  id: string
  name: string
  neighborhoods: string[]
  fee: number
  minOrder: number
  isActive: boolean
  sort: number
}

export async function fetchAdminZones(): Promise<AdminZone[]> {
  const { data, error } = await staffClient()
    .from('delivery_zones')
    .select('id, name, neighborhoods, fee, min_order, is_active, sort')
    .order('sort')
  check(error)
  return (data ?? []).map((z) => ({
    id: z.id,
    name: z.name,
    neighborhoods: z.neighborhoods,
    fee: z.fee,
    minOrder: z.min_order,
    isActive: z.is_active,
    sort: z.sort,
  }))
}

export async function saveZone(
  input: { id?: string; name: string; neighborhoods: string; fee: number; minOrder: number },
  existing: readonly AdminZone[],
): Promise<void> {
  const values = {
    name: input.name,
    neighborhoods: parseNeighborhoods(input.neighborhoods),
    fee: input.fee,
    min_order: input.minOrder,
  }
  const db = staffClient()
  if (input.id) {
    const { error } = await db.from('delivery_zones').update(values).eq('id', input.id)
    check(error)
    return
  }
  const { error } = await db
    .from('delivery_zones')
    .insert({ ...values, sort: Math.max(0, ...existing.map((z) => z.sort)) + 1 })
  check(error)
}

export async function setZoneActive(id: string, active: boolean): Promise<void> {
  const { error } = await staffClient().from('delivery_zones').update({ is_active: active }).eq('id', id)
  check(error)
}

export async function saveZoneOrder(ids: readonly string[]): Promise<void> {
  const results = await Promise.all(
    ids.map((id, i) =>
      staffClient()
        .from('delivery_zones')
        .update({ sort: i + 1 })
        .eq('id', id),
    ),
  )
  for (const r of results) check(r.error)
}
