// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cloudinaryPlaceholder, cloudinarySrcSet, cloudinaryUrl } from './cloudinary'

describe('cloudinary urls', () => {
  it('builds f_auto,q_auto square crops at the requested width', () => {
    expect(cloudinaryUrl('demo', 'takitho/menu/flan', { width: 320 })).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,ar_1:1,w_320/takitho/menu/flan',
    )
  })

  it('applies the device pixel ratio and custom ratios', () => {
    expect(cloudinaryUrl('demo', 'a/b', { width: 200, dpr: 2, ratio: '4:3' })).toContain('ar_4:3,w_400')
  })

  it('builds a srcset with w descriptors for the menu widths', () => {
    const set = cloudinarySrcSet('demo', 'takitho/menu/flan')
    expect(set.split(', ')).toHaveLength(4)
    expect(set).toMatch(/w_160\/takitho\/menu\/flan 160w, .*w_720\/takitho\/menu\/flan 720w$/)
  })

  it('has a tiny blurred placeholder', () => {
    expect(cloudinaryPlaceholder('demo', 'takitho/menu/flan')).toContain('w_24,e_blur:800')
  })
})
