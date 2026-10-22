/**
 * The idempotency key (ADR-0008) is created ONCE per distinct order content and reused on every retry, so a double
 * tap or a network retry can never create two orders. If the customer changes anything, the key rotates.
 * It is never derived from a timestamp or generated per attempt.
 */
export function createKeyStore(newKey: () => string = () => crypto.randomUUID()) {
  let current: { hash: string; key: string } | null = null
  return {
    keyFor(contentHash: string): string {
      if (current?.hash !== contentHash) current = { hash: contentHash, key: newKey() }
      return current.key
    },
    /** After a successful order the next one starts fresh. */
    reset(): void {
      current = null
    },
  }
}
