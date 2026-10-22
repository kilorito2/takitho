// Dev-only gallery of the design system (route /_kit, excluded from production builds).
import { useState, type ReactNode } from 'react'
import { Flame, Leaf, WheatOff } from 'lucide-react'
import { ChalkHeading, PapelPicado, Pizarron, TalaveraStrip } from '@/components/illustrations/Decor'
import { Fachada } from '@/components/illustrations/Fachada'
import {
  Badge,
  Button,
  Chip,
  Modal,
  Sheet,
  Skeleton,
  SkeletonGroup,
  SpiceLevel,
  ThemeToggle,
  Ticket,
  TicketDivider,
  TicketLine,
  TicketTitle,
  TortillaLoader,
  toast,
} from '@/components/ui'
import { Logo } from '@/components/ui/Logo'
import { formatARS } from '@/lib/money'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t-2 border-line py-6">
      <h2 className="mb-4 text-2xl">{title}</h2>
      {children}
    </section>
  )
}

export function KitPage() {
  const [open, setOpen] = useState(true)
  const [modal, setModal] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [chip, setChip] = useState<string[]>(['veggie'])
  const toggle = (id: string) => {
    setChip((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-3xl">Kit de diseño</h1>
        <ThemeToggle />
      </header>

      <Block title="Logo">
        <div className="flex flex-wrap items-center gap-8">
          <Logo variant="full" className="h-14 w-auto" />
          <Logo variant="isotipo" className="size-16" />
        </div>
      </Block>

      <Block title="Fachada">
        <PapelPicado />
        <Fachada open={open} />
        <div className="mt-3">
          <Button
            variant="outline"
            onClick={() => {
              setOpen((o) => !o)
            }}
          >
            Girar cartel ({open ? 'abierto' : 'cerrado'})
          </Button>
        </div>
      </Block>

      <Block title="Botones">
        <div className="flex flex-wrap items-center gap-4">
          <Button>Sumar a la comanda</Button>
          <Button variant="secondary">Ver el menú</Button>
          <Button variant="outline">Cancelar</Button>
          <Button variant="ghost">Repetir pedido</Button>
          <Button loading>Enviando</Button>
          <Button disabled>No disponible</Button>
          <Button size="xl">Listo</Button>
        </div>
      </Block>

      <Block title="Chips y badges">
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtros">
          <Chip
            selected={chip.includes('veggie')}
            onClick={() => {
              toggle('veggie')
            }}
            icon={<Leaf aria-hidden className="size-4" />}
          >
            Veggie
          </Chip>
          <Chip
            selected={chip.includes('tacc')}
            onClick={() => {
              toggle('tacc')
            }}
            icon={<WheatOff aria-hidden className="size-4" />}
          >
            Sin TACC
          </Chip>
          <Chip
            selected={chip.includes('hot')}
            onClick={() => {
              toggle('hot')
            }}
            icon={<Flame aria-hidden className="size-4" />}
          >
            Picante
          </Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="veggie" icon={<Leaf aria-hidden className="size-3" />}>
            Veggie
          </Badge>
          <Badge tone="gluten" icon={<WheatOff aria-hidden className="size-3" />}>
            Sin TACC
          </Badge>
          <Badge tone="spicy" icon={<Flame aria-hidden className="size-3" />}>
            Picante
          </Badge>
          <Badge tone="promo">Martes 2x1</Badge>
          <Badge tone="muted">Agotado</Badge>
          {[0, 1, 2, 3].map((n) => (
            <SpiceLevel key={n} level={n as 0 | 1 | 2 | 3} />
          ))}
        </div>
      </Block>

      <Block title="Pizarrón y azulejos">
        <Pizarron>
          <ChalkHeading>Tacos</ChalkHeading>
          <p className="font-chalk text-2xl">Orden de 3 · maíz o harina</p>
        </Pizarron>
        <TalaveraStrip className="mt-4" />
      </Block>

      <Block title="Tu comanda (ticket)">
        <div className="max-w-sm">
          <Ticket>
            <TicketTitle>Tu comanda</TicketTitle>
            <TicketDivider />
            <TicketLine
              label="2 × Tacos al pastor"
              value={formatARS(13600)}
              sub="Maíz · Salsa verde · Queso"
            />
            <TicketLine label="1 × Horchata" value={formatARS(2500)} />
            <TicketDivider />
            <TicketLine label="Subtotal" value={formatARS(16100)} />
            <TicketLine label="Envío" value={formatARS(1500)} />
            <TicketLine label="Total" value={formatARS(17600)} strong />
          </Ticket>
        </div>
      </Block>

      <Block title="Carga">
        <SkeletonGroup label="Cargando el menú…" className="grid max-w-sm gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </SkeletonGroup>
        <TortillaLoader className="mt-6" />
      </Block>

      <Block title="Diálogos y avisos">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setModal(true)
            }}
          >
            Abrir modal
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSheet(true)
            }}
          >
            Abrir hoja
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              toast.success('Sumado a la comanda')
            }}
          >
            Aviso ok
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              toast.error('Se cortó la señal', { description: 'Probá de nuevo en un toque.' })
            }}
          >
            Aviso error
          </Button>
        </div>
        <Modal
          open={modal}
          onClose={() => {
            setModal(false)
          }}
          title="¿Cancelar el pedido?"
          description="Esto no se puede deshacer."
        >
          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => {
                setModal(false)
              }}
            >
              Sí, cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setModal(false)
              }}
            >
              Volver
            </Button>
          </div>
        </Modal>
        <Sheet
          open={sheet}
          onClose={() => {
            setSheet(false)
          }}
          title="Tacos al pastor"
          description="Orden de 3 con piña, cebolla y cilantro."
        >
          <p className="py-4">Acá va la ficha del producto con modificadores.</p>
          <Button
            block
            onClick={() => {
              setSheet(false)
            }}
          >
            Sumar · {formatARS(6000)}
          </Button>
        </Sheet>
      </Block>
    </main>
  )
}
