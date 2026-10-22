import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl md:text-4xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A bordered block with a heading: the unit every admin screen is built from. */
export function Panel({
  title,
  children,
  actions,
  id,
}: {
  title: string
  children: ReactNode
  actions?: ReactNode
  id?: string
}) {
  const headingId = id ?? `panel-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`
  return (
    <section aria-labelledby={headingId} className="rounded-md border-2 border-line bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="font-display text-xl">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  )
}
