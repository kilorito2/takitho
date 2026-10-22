// Pure core (ADR-0004): no imports, shared with the Edge Functions.
// Argentine mobile numbers → E.164 (+549 + area code + number = 10 national digits).

export type PhoneResult = { ok: true; e164: string } | { ok: false }

const INVALID: PhoneResult = { ok: false }

/**
 * Accepts the many ways people type an Argentine mobile:
 * "11 1234-5678", "011 15 1234-5678", "+54 9 11 1234 5678", "0351 15 5123456", "351 555 1234".
 */
export function normalizeArPhone(input: string): PhoneResult {
  let digits = input.replace(/\D/g, '')
  if (digits.length < 10) return INVALID

  // Country code: "54..." (with an optional mobile "9").
  if (digits.startsWith('54') && digits.length >= 12) {
    digits = digits.slice(2)
    if (digits.startsWith('9') && digits.length === 11) digits = digits.slice(1)
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }

  // Legacy mobile marker "15" after the area code, e.g. 11 15 1234 5678.
  if (digits.length === 12) {
    for (const areaLen of [2, 3, 4]) {
      if (digits.slice(areaLen, areaLen + 2) === '15') {
        digits = digits.slice(0, areaLen) + digits.slice(areaLen + 2)
        break
      }
    }
  }

  if (digits.length !== 10) return INVALID
  // Area codes start with 2–9, except Buenos Aires which is exactly "11".
  if (digits.startsWith('0')) return INVALID
  if (digits.startsWith('1') && !digits.startsWith('11')) return INVALID
  return { ok: true, e164: `+549${digits}` }
}

/** "+5491112345678" → "11 1234-5678". Non-AR-mobile input is returned unchanged. */
export function formatArPhone(e164: string): string {
  const match = /^\+549(\d{10})$/.exec(e164)
  const national = match?.[1]
  if (!national) return e164
  if (national.startsWith('11')) return `${national.slice(0, 2)} ${national.slice(2, 6)}-${national.slice(6)}`
  return `${national.slice(0, 3)} ${national.slice(3, 6)}-${national.slice(6)}`
}
