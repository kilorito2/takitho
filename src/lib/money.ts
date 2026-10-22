// Pure core (ADR-0004): no imports, shared with the Edge Functions via scripts/sync-shared.mjs.
// All amounts are whole ARS pesos (integers).

const ars = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

/** "$ 1.500" — es-AR formatting, no decimals. */
export function formatARS(amount: number): string {
  return ars.format(amount)
}

/** Money is a non-negative safe integer. */
export function isMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Truncate to an integer and clamp into [min, max]; NaN falls back to `min`. */
export function clampInt(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

export type CashChange = { ok: true; change: number } | { ok: false; shortBy: number }

/** "¿Con cuánto pagás?" → change to give back, or how much is missing. */
export function cashChange(total: number, paidWith: number): CashChange {
  if (paidWith < total) return { ok: false, shortBy: total - paidWith }
  return { ok: true, change: paidWith - total }
}
