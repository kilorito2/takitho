// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseEnv } from './env'

const valid = {
  VITE_SUPABASE_URL: 'https://abc.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnop',
  VITE_CLOUDINARY_CLOUD_NAME: 'tzfvhzgb',
}

describe('parseEnv', () => {
  it('accepts the required variables and treats the rest as optional', () => {
    expect(parseEnv(valid)).toMatchObject(valid)
    expect(parseEnv({ ...valid, VITE_SITE_URL: 'http://localhost:5173' }).VITE_SITE_URL).toBe(
      'http://localhost:5173',
    )
  })

  it('names every missing or invalid variable in a readable error', () => {
    expect(() => parseEnv({ VITE_SUPABASE_URL: 'no-es-una-url' })).toThrow(
      /VITE_SUPABASE_URL.*VITE_SUPABASE_PUBLISHABLE_KEY.*VITE_CLOUDINARY_CLOUD_NAME/,
    )
    expect(() => parseEnv({})).toThrow(/\.env/)
  })
})
