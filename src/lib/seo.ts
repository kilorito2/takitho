import { useEffect } from 'react'
import { isFilled } from './links'

const DEFAULT_TITLE = 'Takitho · Tacos de barrio, pedí online'

interface PageMeta {
  /** Page-specific part; the brand is appended ("Menú · Takitho"). Omit for the home page. */
  title?: string
  description?: string
  /** Private or transactional pages (cart, order tracking, staff) stay out of search results. */
  noindex?: boolean
}

export const pageTitle = (title?: string): string => (title ? `${title} · Takitho` : DEFAULT_TITLE)

function setMeta(name: string, content: string | null): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (content === null) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('meta')
    el.name = name
    document.head.append(el)
  }
  el.content = content
}

/** Sets title, description and robots for the current page and restores the previous values when it unmounts. */
export function usePageMeta({ title, description, noindex = false }: PageMeta): void {
  useEffect(() => {
    const previousTitle = document.title
    const previousDescription =
      document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? null
    document.title = pageTitle(title)
    if (description) setMeta('description', description)
    setMeta('robots', noindex ? 'noindex, nofollow' : null)
    return () => {
      document.title = previousTitle
      setMeta('description', previousDescription)
      setMeta('robots', null)
    }
  }, [title, description, noindex])
}

/* ------------------------------------------------------------------ structured data */

export interface RestaurantInput {
  name: string
  tagline: string
  address: string
  whatsapp: string
  instagram: string
  mapsUrl: string
  /** Canonical site address (https://…), no trailing slash. */
  siteUrl: string
  image: string
  shifts: readonly { weekday: number; opensAt: string; closesAt: string }[]
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

const hhmm = (t: string) => t.slice(0, 5)

/**
 * schema.org/Restaurant for Google. Only real data goes in: fields still holding the `[COMPLETAR]` placeholder
 * are left out instead of publishing a placeholder as if it were a fact.
 */
export function restaurantJsonLd(r: RestaurantInput): Record<string, unknown> {
  const phone = isFilled(r.whatsapp) ? `+${r.whatsapp.replace(/\D/g, '')}` : null
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: r.name,
    description: r.tagline,
    url: r.siteUrl,
    image: `${r.siteUrl}${r.image}`,
    servesCuisine: ['Mexicana', 'Tacos'],
    priceRange: '$$',
    hasMenu: `${r.siteUrl}/menu`,
    acceptsReservations: false,
    ...(isFilled(r.address)
      ? { address: { '@type': 'PostalAddress', streetAddress: r.address, addressCountry: 'AR' } }
      : {}),
    ...(phone ? { telephone: phone } : {}),
    ...(isFilled(r.instagram)
      ? { sameAs: [`https://www.instagram.com/${r.instagram.replace(/^@/, '')}`] }
      : {}),
    ...(isFilled(r.mapsUrl) ? { hasMap: r.mapsUrl } : {}),
    ...(r.shifts.length > 0
      ? {
          openingHoursSpecification: r.shifts.map((s) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: DAY_NAMES[s.weekday],
            opens: hhmm(s.opensAt),
            closes: hhmm(s.closesAt),
          })),
        }
      : {}),
    potentialAction: {
      '@type': 'OrderAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${r.siteUrl}/menu`,
        actionPlatform: 'http://schema.org/DesktopWebPlatform',
      },
      deliveryMethod: [
        'http://purl.org/goodrelations/v1#DeliveryModePickUp',
        'http://purl.org/goodrelations/v1#DeliveryModeOwnFleet',
      ],
    },
  }
}
