import { axe } from 'vitest-axe'
import { expect } from 'vitest'

/** Fails with the list of axe violations (rule id + help text) instead of an opaque matcher message. */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const results = await axe(container)
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}
