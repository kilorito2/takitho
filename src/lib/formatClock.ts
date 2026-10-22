import { localParts } from './hours'

/** "19 h" / "19:30 h" in the shop's time zone — how the shop talks about opening time. */
export function formatClock(date: Date, tz: string): string {
  const p = localParts(date, tz)
  return p.minute === 0 ? `${p.hour} h` : `${p.hour}:${String(p.minute).padStart(2, '0')} h`
}
