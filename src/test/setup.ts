import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_key_000000')
vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'demo')

afterEach(() => {
  cleanup()
})
