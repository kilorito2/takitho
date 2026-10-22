import { createPortal } from 'react-dom'
import { formatARS } from '@/lib/money'
import { formatArPhone } from '@/lib/phone'
import { formatClock } from '@/lib/formatClock'
import { cashToCollect, typeLabel, type KitchenOrder } from '../model'
import '../print.css'

export type PaperWidth = '58' | '80'

/**
 * Thermal-printer comanda (58 or 80 mm). Rendered into <body> next to #root so the print stylesheet can hide the
 * whole app and print only this: black on white, monospace, no colour, no shadows.
 */
export function PrintTicket({ order, paper, tz }: { order: KitchenOrder; paper: PaperWidth; tz: string }) {
  const cash = cashToCollect(order)
  const placed = formatClock(new Date(order.createdAt), tz)
  return createPortal(
    <div id="print-root" data-paper={paper} data-testid="print-ticket">
      <style>{`@media print { @page { size: ${paper}mm auto; margin: 2mm; } }`}</style>
      <p className="pt-brand">TAKITHO</p>
      <p className="pt-code">{order.code}</p>
      <p className="pt-big">{typeLabel(order)}</p>
      <p>Hora: {placed}</p>
      {order.scheduledFor && (
        <p className="pt-big">Programado: {formatClock(new Date(order.scheduledFor), tz)}</p>
      )}
      <hr />
      <p>
        {order.customerName} · {formatArPhone(order.customerPhone)}
      </p>
      {order.address && <p>{order.address}</p>}
      <hr />
      {order.items.map((item) => (
        <div key={item.id} className="pt-item">
          <p className="pt-big">
            {item.quantity}× {item.name}
          </p>
          {item.modifiers.map((m) => (
            <p key={m} className="pt-mod">
              + {m}
            </p>
          ))}
          {item.note && <p className="pt-note">** {item.note} **</p>}
        </div>
      ))}
      <hr />
      <p className="pt-big">Total {formatARS(order.total)}</p>
      {cash ? (
        <p>
          COBRAR en efectivo{cash.paidWith !== null ? ` · paga con ${formatARS(cash.paidWith)}` : ''}
          {cash.change !== null && cash.change > 0 ? ` · vuelto ${formatARS(cash.change)}` : ''}
        </p>
      ) : (
        <p>{order.paymentStatus === 'paid' ? 'PAGADO' : 'Pago pendiente'}</p>
      )}
    </div>,
    document.body,
  )
}
