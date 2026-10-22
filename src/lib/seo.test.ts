import { describe, expect, it } from 'vitest'
import { pageTitle, restaurantJsonLd, type RestaurantInput } from './seo'

const base: RestaurantInput = {
  name: 'Takitho',
  tagline: 'Tacos de barrio',
  address: 'Av. Siempreviva 742',
  whatsapp: '+54 9 11 5555-0000',
  instagram: '@takitho.tacos',
  mapsUrl: 'https://maps.app.goo.gl/abc',
  siteUrl: 'https://takitho.com.ar',
  image: '/brand/og-image.png',
  shifts: [
    { weekday: 5, opensAt: '19:00:00', closesAt: '02:00:00' },
    { weekday: 2, opensAt: '19:00', closesAt: '01:00' },
  ],
}

describe('pageTitle', () => {
  it('puts the brand last, and keeps the full tagline for the home page', () => {
    expect(pageTitle('Menú')).toBe('Menú · Takitho')
    expect(pageTitle()).toBe('Takitho · Tacos de barrio, pedí online')
  })
})

describe('restaurantJsonLd', () => {
  it('describes the restaurant with real data', () => {
    const ld = restaurantJsonLd(base)
    expect(ld).toMatchObject({
      '@type': 'Restaurant',
      name: 'Takitho',
      url: 'https://takitho.com.ar',
      image: 'https://takitho.com.ar/brand/og-image.png',
      telephone: '+5491155550000',
      hasMenu: 'https://takitho.com.ar/menu',
      address: { streetAddress: 'Av. Siempreviva 742', addressCountry: 'AR' },
      sameAs: ['https://www.instagram.com/takitho.tacos'],
    })
  })

  it('lists the opening hours with weekday names and HH:MM', () => {
    const ld = restaurantJsonLd(base) as { openingHoursSpecification: unknown[] }
    expect(ld.openingHoursSpecification).toEqual([
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Friday', opens: '19:00', closes: '02:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Tuesday', opens: '19:00', closes: '01:00' },
    ])
  })

  it('never publishes a [COMPLETAR] placeholder', () => {
    const ld = restaurantJsonLd({
      ...base,
      address: '[COMPLETAR]',
      whatsapp: '[COMPLETAR: número]',
      instagram: '[COMPLETAR]',
      mapsUrl: '[COMPLETAR]',
      shifts: [],
    })
    expect(JSON.stringify(ld)).not.toContain('COMPLETAR')
    expect(ld).not.toHaveProperty('address')
    expect(ld).not.toHaveProperty('telephone')
    expect(ld).not.toHaveProperty('openingHoursSpecification')
  })
})
