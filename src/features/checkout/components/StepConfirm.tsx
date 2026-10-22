import { Ticket, TicketDivider, TicketLine, TicketTitle } from '@/components/ui/Ticket'
import { formatARS } from '@/lib/money'
import { formatArPhone, normalizeArPhone } from '@/lib/phone'
import type { QuoteDto } from '@/types/api'
import type { CheckoutValues } from '../schema'

const TYPE_TEXT = {
  pickup: 'Retiro en el local',
  delivery: 'Delivery',
  dine_in: 'Comer en el local',
} as const
const METHOD_TEXT = { mercado_pago: 'Mercado Pago', cash: 'Efectivo', transfer: 'Transferencia' } as const

interface Props {
  quote: QuoteDto | undefined
  values: CheckoutValues
  tableNumber: number | null
  zoneName: string | undefined
  whenText: string
}

/** Last look before confirming. Every number comes from the server quote. */
export function StepConfirm({ quote, values, tableNumber, zoneName, whenText }: Props) {
  const phone = normalizeArPhone(values.phone)
  return (
    <section aria-labelledby="confirm-title" className="space-y-4">
      <h2 id="confirm-title" className="font-display text-2xl">
        Revisá y confirmá
      </h2>
      <Ticket>
        <TicketTitle>Tu comanda</TicketTitle>
        <TicketDivider />
        {quote ? (
          <>
            <ul className="space-y-1">
              {quote.lines.map((l, i) => (
                <li key={`${l.product_id}-${i}`}>
                  <TicketLine
                    label={`${l.quantity} × ${l.name}`}
                    value={formatARS(l.line_total)}
                    sub={l.modifiers.length > 0 ? l.modifiers.map((m) => m.name).join(' · ') : undefined}
                  />
                </li>
              ))}
            </ul>
            <TicketDivider />
            <TicketLine label="Subtotal" value={formatARS(quote.subtotal)} />
            {quote.discount > 0 && (
              <TicketLine
                label={`Descuento${quote.coupon ? ` · ${quote.coupon.label}` : ''}`}
                value={`− ${formatARS(quote.discount)}`}
              />
            )}
            {quote.delivery_fee > 0 && (
              <TicketLine
                label={`Envío${zoneName ? ` · ${zoneName}` : ''}`}
                value={formatARS(quote.delivery_fee)}
              />
            )}
            {quote.tip > 0 && <TicketLine label="Propina" value={formatARS(quote.tip)} />}
            <TicketDivider />
            <TicketLine label="Total" value={formatARS(quote.total)} strong />
          </>
        ) : (
          <p>Calculando…</p>
        )}
      </Ticket>
      <dl className="grid gap-2 rounded-md border-2 border-line bg-card p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-bold">Cómo</dt>
          <dd>
            {TYPE_TEXT[values.type]}
            {values.type === 'dine_in' && tableNumber !== null ? ` · mesa ${tableNumber}` : ''}
            {values.type === 'delivery' && (
              <span className="block text-ink-soft">
                {values.street} {values.number}
                {values.floorApt ? `, ${values.floorApt}` : ''}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-bold">Cuándo</dt>
          <dd>{whenText}</dd>
        </div>
        <div>
          <dt className="font-bold">A nombre de</dt>
          <dd>
            {values.name.trim()}
            <span className="block text-ink-soft">{phone.ok ? formatArPhone(phone.e164) : values.phone}</span>
          </dd>
        </div>
        <div>
          <dt className="font-bold">Pago</dt>
          <dd>
            {METHOD_TEXT[values.method]}
            {values.method === 'cash' && values.cashPaidWith.trim() !== '' && (
              <span className="block text-ink-soft">Con ${values.cashPaidWith.trim()}</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  )
}
