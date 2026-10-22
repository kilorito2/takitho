import { Link } from 'react-router'
import { Clock, ExternalLink, MapPin, MessageCircle, Tag } from 'lucide-react'
import { Pizarron, TalaveraStrip, ChalkHeading } from '@/components/illustrations/Decor'
import { Fachada } from '@/components/illustrations/Fachada'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { Badge } from '@/components/ui/Badge'
import { useUi } from '@/features/cart/ui'
import { ProductCard } from '@/features/catalog/components/ProductCard'
import { StoreBanner } from '@/features/catalog/components/StoreBanner'
import { hoursLines } from '@/features/catalog/hoursText'
import { useHours, useMenu, useNow, usePromos, useStore, useStoreStatus } from '@/features/catalog/hooks'
import { promoDaysText, promoValidToday } from '@/features/catalog/promos'
import { isFilled, mapsLink, socialLink, whatsappLink } from '@/lib/links'
import { RestaurantJsonLd } from './RestaurantJsonLd'

/** "El localcito": facade, honest open/closed state, today's promos, house favourites, where and when. */
export function HomePage() {
  const store = useStore()
  const { status } = useStoreStatus()
  const menu = useMenu()
  const promos = usePromos()
  const hours = useHours()
  const now = useNow(60_000)
  const openProduct = useUi((s) => s.openProduct)

  const info = store.data
  const featured =
    menu.data?.products.filter((p) => p.tags.includes('destacado') && p.isAvailable).slice(0, 4) ?? []
  const tz = info?.timezone ?? 'America/Argentina/Buenos_Aires'
  const todayPromos = (promos.data ?? []).filter((p) => promoValidToday(p, now, tz))
  const otherPromos = (promos.data ?? []).filter((p) => !promoValidToday(p, now, tz))

  const maps = info ? mapsLink(info.address, info.mapsUrl) : null
  const wa = info ? whatsappLink(info.whatsapp) : null
  const socials: { label: string; href: string }[] = info
    ? [
        { label: 'Instagram', href: socialLink('instagram', info.instagram) },
        { label: 'Facebook', href: socialLink('facebook', info.facebook) },
        { label: 'TikTok', href: socialLink('tiktok', info.tiktok) },
      ].flatMap((s) => (s.href ? [{ label: s.label, href: s.href }] : []))
    : []

  return (
    <>
      <RestaurantJsonLd />
      <section className="mx-auto max-w-5xl px-4 pb-6">
        <Fachada open={status?.canOrderNow ?? false} className="mx-auto max-w-3xl" />
        <div className="mx-auto mt-5 max-w-xl text-center">
          <h1 className="text-4xl sm:text-5xl">Tacos de barrio, pedí online</h1>
          <p className="mt-2 text-lg text-ink-soft">Retiro en el local, delivery o en tu mesa.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link to="/menu" className={buttonClasses({ size: 'xl' })}>
              Hacer pedido
            </Link>
            <Link to="/mis-pedidos" className={buttonClasses({ size: 'xl', variant: 'outline' })}>
              Mis pedidos
            </Link>
          </div>
          {/* Below the buttons and with a reserved height: the banner appears once the hours are loaded without moving anything. */}
          <div className="mt-4 min-h-24 text-left">
            <StoreBanner />
          </div>
        </div>
      </section>

      <TalaveraStrip />

      {promos.isPending && (
        <div aria-hidden className="mx-auto max-w-5xl px-4 py-8">
          <div className="h-64 rounded-md bg-ink/10" />
        </div>
      )}
      {(todayPromos.length > 0 || otherPromos.length > 0) && (
        <section aria-labelledby="promos" className="mx-auto max-w-5xl px-4 py-8">
          <Pizarron>
            <div id="promos">
              <ChalkHeading>Promos del día</ChalkHeading>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[...todayPromos, ...otherPromos].map((p) => {
                const today = todayPromos.includes(p)
                return (
                  <li
                    key={p.id}
                    className="flex items-start gap-3 rounded-md border-2 border-tiza/40 p-3 text-tiza"
                  >
                    <Tag aria-hidden className="mt-1 size-5 shrink-0 text-maiz" />
                    <div>
                      <p className="font-display text-xl text-tortilla">{p.label}</p>
                      <p className="text-sm text-tiza/85">{promoDaysText(p)}</p>
                      {today ? (
                        <Badge tone="promo" className="mt-1">
                          Vale hoy
                        </Badge>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Pizarron>
        </section>
      )}

      {menu.isPending && (
        <div aria-hidden className="mx-auto max-w-5xl px-4 pb-8">
          <div className="h-[30rem] rounded-md bg-ink/10" />
        </div>
      )}
      {featured.length > 0 && (
        <section aria-labelledby="destacados" className="mx-auto max-w-5xl px-4 pb-8">
          <h2 id="destacados" className="mb-4 text-3xl">
            De la casa
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {featured.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onOpen={(prod) => {
                  openProduct(prod.id)
                }}
              />
            ))}
          </div>
          <Link to="/menu" className={`${buttonClasses({ variant: 'outline', size: 'lg' })} mt-5`}>
            Ver el menú completo
          </Link>
        </section>
      )}

      <section aria-labelledby="donde" className="bg-card py-8">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 md:grid-cols-2">
          <div>
            <h2 id="donde" className="mb-3 text-3xl">
              Dónde estamos
            </h2>
            <p className="flex items-start gap-2 text-lg">
              <MapPin aria-hidden className="mt-1 size-5 shrink-0 text-brand-text" />
              <span>{info ? info.address : 'Cargando…'}</span>
            </p>
            {maps && (
              <a
                href={maps}
                target="_blank"
                rel="noopener noreferrer"
                className={`${buttonClasses({ variant: 'outline' })} mt-3`}
              >
                Cómo llegar <ExternalLink aria-hidden className="size-4" />
              </a>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses({ variant: 'secondary' })}
                >
                  <MessageCircle aria-hidden className="size-5" /> Escribinos por WhatsApp
                </a>
              )}
              {socials.map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses({ variant: 'outline' })}
                >
                  {label}
                </a>
              ))}
              {info && !isFilled(info.whatsapp) && socials.length === 0 && (
                <p className="text-sm text-ink-soft">WhatsApp y redes: [COMPLETAR]</p>
              )}
            </div>
          </div>
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-3xl">
              <Clock aria-hidden className="size-6" /> Horarios
            </h2>
            <dl className="divide-y-2 divide-line border-y-2 border-line">
              {(hours.data ? hoursLines(hours.data) : []).map((l) => (
                <div key={l.weekday} className="flex justify-between gap-4 py-2">
                  <dt className="font-bold">{l.day}</dt>
                  <dd className={l.text === 'Cerrado' ? 'text-ink-soft' : 'font-mono tabular-nums'}>
                    {l.text}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-sm text-ink-soft">
              Los horarios que cruzan la medianoche cierran de madrugada.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
