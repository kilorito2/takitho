import { businessDate } from '@/lib/hours'
import type { PromoInfo } from './types'

/** Is the promo valid on the business day of `now`? (Same rule as the server: night shifts count for the day they opened.) */
export function promoValidToday(promo: PromoInfo, now: Date, tz: string): boolean {
  if (promo.weekdays.length === 0) return true
  const weekday = new Date(`${businessDate(now, tz)}T00:00:00Z`).getUTCDay()
  return promo.weekdays.includes(weekday)
}

const DAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados']

/** "Los martes" / "Martes y jueves" / "Todos los días". */
export function promoDaysText(promo: PromoInfo): string {
  if (promo.weekdays.length === 0) return 'Todos los días'
  const days = promo.weekdays.map((d) => DAYS[d] ?? '')
  return `Los ${days.join(' y ')}`
}
