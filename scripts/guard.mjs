// "Guard" from CONSTRAINTS.md: flags a weakened quality bar in the working tree.
// Looks at added lines (git diff vs HEAD + untracked files) for new suppressions, skipped tests and
// leaked env files. Usage: node scripts/guard.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const run = (args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return ''
  }
}

const RULES = [
  {
    re: /@ts-ignore|@ts-nocheck/,
    why: 'TypeScript suppression (use @ts-expect-error with a reason, and log it in CONSTRAINTS.md §7)',
  },
  { re: /eslint-disable/, why: 'ESLint suppression (log it in CONSTRAINTS.md §7)' },
  { re: /\b(?:it|test|describe)\.(?:skip|only)\b|\bx(?:it|describe)\(/, why: 'skipped/focused test' },
  { re: /\bas any\b|:\s*any\b/, why: 'explicit any' },
]
const ignore = /^(?:docs\/|CONSTRAINTS\.md|scripts\/guard\.mjs|package-lock\.json)/

const problems = []
const check = (file, line, text) => {
  if (ignore.test(file)) return
  for (const { re, why } of RULES)
    if (re.test(text)) problems.push(`${file}:${line}  ${why}\n    ${text.trim()}`)
}

// Added lines in tracked files
let file = ''
let lineNo = 0
for (const row of run(['diff', '--unified=0', 'HEAD']).split('\n')) {
  if (row.startsWith('+++ b/')) file = row.slice(6)
  else if (row.startsWith('@@')) lineNo = Number(/\+(\d+)/.exec(row)?.[1] ?? 0) - 1
  else if (row.startsWith('+') && !row.startsWith('+++')) {
    lineNo++
    check(file, lineNo, row.slice(1))
  }
}
// Untracked source files (new code is not in the diff)
for (const f of run(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) {
  if (!/\.(?:ts|tsx|js|mjs)$/.test(f)) continue
  readFileSync(f, 'utf8')
    .split('\n')
    .forEach((text, i) => check(f, i + 1, text))
}

// Secrets / env hygiene
const tracked = run(['ls-files']).split('\n')
for (const f of tracked)
  if (/(^|\/)\.env(?:\.(?!example$).+)?$/.test(f))
    problems.push(`${f}  env file is tracked (only .env.example is allowed)`)

if (problems.length > 0) {
  console.error('Guard found a weakened bar:\n' + problems.join('\n'))
  process.exit(1)
}
console.log('guard: clean')
