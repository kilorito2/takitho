import { Link } from 'react-router'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { usePageMeta } from '@/lib/seo'

export function NotFoundPage() {
  usePageMeta({ title: 'Página no encontrada', noindex: true })
  return (
    <section className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <svg viewBox="0 0 160 110" className="w-48" aria-hidden>
        <ellipse cx="80" cy="82" rx="68" ry="20" fill="#1e1a17" />
        <ellipse cx="80" cy="77" rx="62" ry="16" fill="#3a322d" />
        <path d="M138 72l18-6" stroke="#1e1a17" strokeWidth="8" strokeLinecap="round" />
        <path
          d="M54 56q26-14 52 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="2 8"
          strokeLinecap="round"
          opacity=".5"
        />
      </svg>
      <h1 className="mt-6 text-4xl text-ink">Se nos acabaron las tortillas para esta página</h1>
      <p className="mt-3 text-ink-soft">El link que seguiste no existe o ya lo sacamos de la carta.</p>
      <Link to="/" className={`${buttonClasses({ size: 'lg' })} mt-8`}>
        Volver al inicio
      </Link>
    </section>
  )
}
