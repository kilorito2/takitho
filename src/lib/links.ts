// Contact links built without any paid API (no Google Maps key, no SMS): plain URLs only.
const PLACEHOLDER = /\[COMPLETAR/i

/** True when the owner has filled the value in (the seed ships "[COMPLETAR]"). */
export const isFilled = (value: string): boolean => value.trim() !== '' && !PLACEHOLDER.test(value)

/** Digits only, ready for wa.me (Argentine mobiles: 549…). Returns null for placeholders or non-numbers. */
export function whatsappDigits(value: string): string | null {
  if (!isFilled(value)) return null
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 ? digits : null
}

export function whatsappLink(value: string, message?: string): string | null {
  const digits = whatsappDigits(value)
  if (!digits) return null
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`
}

/** A saved Google Maps URL wins; otherwise a search link for the address; otherwise nothing. */
export function mapsLink(address: string, mapsUrl: string): string | null {
  if (isFilled(mapsUrl) && /^https?:\/\//i.test(mapsUrl.trim())) return mapsUrl.trim()
  if (isFilled(address))
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  return null
}

const handle = (value: string): string => value.trim().replace(/^@/, '').replace(/\/+$/, '')

export function socialLink(kind: 'instagram' | 'facebook' | 'tiktok', value: string): string | null {
  if (!isFilled(value)) return null
  const v = value.trim()
  if (/^https?:\/\//i.test(v)) return v
  const h = handle(v)
  if (!/^[\w.-]+$/.test(h)) return null
  if (kind === 'instagram') return `https://www.instagram.com/${h}`
  if (kind === 'facebook') return `https://www.facebook.com/${h}`
  return `https://www.tiktok.com/@${h}`
}
