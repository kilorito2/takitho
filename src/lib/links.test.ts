// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isFilled, mapsLink, socialLink, whatsappLink } from './links'

describe('links', () => {
  it('treats the seed placeholder and blanks as not filled', () => {
    expect(isFilled('[COMPLETAR]')).toBe(false)
    expect(isFilled('  ')).toBe(false)
    expect(isFilled('[COMPLETAR: calle]')).toBe(false)
    expect(isFilled('Av. Siempreviva 742')).toBe(true)
  })

  it('builds wa.me links from Argentine numbers in any format and encodes the message', () => {
    expect(whatsappLink('+54 9 11 5555-0000')).toBe('https://wa.me/5491155550000')
    expect(whatsappLink('5491155550000', 'Hola, soy Ana: pedido TK-0427')).toBe(
      'https://wa.me/5491155550000?text=Hola%2C%20soy%20Ana%3A%20pedido%20TK-0427',
    )
    expect(whatsappLink('[COMPLETAR]')).toBeNull()
    expect(whatsappLink('123')).toBeNull()
  })

  it('prefers a saved maps URL, falls back to a search link, and gives up on placeholders', () => {
    expect(mapsLink('Av. X 1', 'https://maps.app.goo.gl/abc')).toBe('https://maps.app.goo.gl/abc')
    expect(mapsLink('Av. Siempreviva 742, CABA', '[COMPLETAR]')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Av.%20Siempreviva%20742%2C%20CABA',
    )
    expect(mapsLink('[COMPLETAR]', '[COMPLETAR]')).toBeNull()
    expect(mapsLink('Av. X 1', 'javascript:alert(1)')).toContain('google.com/maps')
  })

  it('builds profile links from handles or accepts full URLs, rejecting junk', () => {
    expect(socialLink('instagram', '@takitho.tacos')).toBe('https://www.instagram.com/takitho.tacos')
    expect(socialLink('tiktok', 'takitho')).toBe('https://www.tiktok.com/@takitho')
    expect(socialLink('facebook', 'https://facebook.com/takitho')).toBe('https://facebook.com/takitho')
    expect(socialLink('instagram', '[COMPLETAR]')).toBeNull()
    expect(socialLink('instagram', 'no es un handle!')).toBeNull()
  })
})
