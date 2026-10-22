import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { NotFoundPage } from './NotFoundPage'
import { usePageMeta } from '@/lib/seo'

/** Route error boundary: same voice as the rest of the shop, with a way out. */
export function ErrorPage() {
  usePageMeta({ title: 'Algo salió mal', noindex: true })
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />

  return (
    <section
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 py-16 text-center"
      role="alert"
    >
      <svg viewBox="0 0 160 110" className="w-48" aria-hidden>
        <ellipse cx="80" cy="82" rx="68" ry="20" fill="#1e1a17" />
        <ellipse cx="80" cy="77" rx="62" ry="16" fill="#3a322d" />
        <path d="M138 72l18-6" stroke="#1e1a17" strokeWidth="8" strokeLinecap="round" />
        <path d="M50 70q30-34 60 0" fill="#f6d58a" stroke="#1e1a17" strokeWidth="3.5" />
        <path d="M64 52l-6-12M80 46v-14M96 52l6-12" stroke="#c8102e" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <h1 className="mt-6 text-4xl text-ink">Se nos quemó una tortilla</h1>
      <p className="mt-3 text-ink-soft">
        Algo salió mal de nuestro lado. Probá de nuevo; si sigue, avisanos por WhatsApp.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button
          size="lg"
          onClick={() => {
            window.location.reload()
          }}
        >
          Reintentar
        </Button>
        <Link to="/" className={buttonClasses({ size: 'lg', variant: 'outline' })}>
          Ir al inicio
        </Link>
      </div>
    </section>
  )
}
