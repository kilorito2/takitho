// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createKeyStore } from './idempotency'

describe('createKeyStore', () => {
  const counter = () => {
    let n = 0
    return () => `key-${++n}`
  }

  it('returns the same key for the same content, however many retries', () => {
    const store = createKeyStore(counter())
    const first = store.keyFor('order-a')
    expect(store.keyFor('order-a')).toBe(first)
    expect(store.keyFor('order-a')).toBe(first)
  })

  it('rotates the key when the content changes', () => {
    const store = createKeyStore(counter())
    const a = store.keyFor('order-a')
    const b = store.keyFor('order-b')
    expect(b).not.toBe(a)
    expect(store.keyFor('order-b')).toBe(b)
  })

  it('starts fresh after reset (a new order), even with identical content', () => {
    const store = createKeyStore(counter())
    const a = store.keyFor('order-a')
    store.reset()
    expect(store.keyFor('order-a')).not.toBe(a)
  })

  it('generates real UUIDs by default', () => {
    expect(createKeyStore().keyFor('x')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
