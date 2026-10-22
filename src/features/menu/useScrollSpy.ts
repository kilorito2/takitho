import { useEffect, useState } from 'react'

/** Scrollspy: the section whose heading is closest to the top band of the viewport is the active one. `ids` must be memoized. */
export function useScrollSpy(ids: readonly string[]): string | null {
  const [seen, setSeen] = useState<string | null>(null)
  // Until the observer reports something (or if the section vanished), the first section is the active one.
  const active = seen && ids.includes(seen) ? seen : (ids[0] ?? null)
  useEffect(() => {
    if (ids.length === 0) return
    const visible = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top)
          else visible.delete(e.target.id)
        }
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0]?.[0]
        if (top) setSeen(top)
      },
      // A thin band just under the sticky header + tabs.
      { rootMargin: '-140px 0px -65% 0px', threshold: [0, 1] },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => {
      observer.disconnect()
    }
  }, [ids])
  return active
}
