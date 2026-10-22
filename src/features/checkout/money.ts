/** Round `n` up to the next multiple of `step`. */
const roundUp = (n: number, step: number): number => Math.ceil(n / step) * step

/**
 * Quick answers for "¿Con cuánto pagás?": exact amount first, then the bills people actually hand over
 * (next 1.000 / 5.000 / 10.000 / 20.000 / 50.000), no duplicates, never below the total, at most 4.
 */
export function cashSuggestions(total: number): number[] {
  if (total <= 0) return []
  const out = new Set<number>([total])
  for (const step of [1000, 5000, 10000, 20000, 50000]) out.add(roundUp(total, step))
  return [...out].sort((a, b) => a - b).slice(0, 4)
}

/** Tip as a percentage of the subtotal, rounded to the nearest 10 pesos (nobody tips $ 723). */
export function tipFromPercent(subtotal: number, percent: number): number {
  if (percent <= 0 || subtotal <= 0) return 0
  return Math.round((subtotal * percent) / 100 / 10) * 10
}

/** Parses "12.500" / "12500" / "$ 12.500" typed by a person into whole pesos, or null if it is not a plain amount. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[\s$]/g, '').replace(/\./g, '')
  if (!/^\d{1,9}$/.test(cleaned)) return null
  return Number(cleaned)
}
