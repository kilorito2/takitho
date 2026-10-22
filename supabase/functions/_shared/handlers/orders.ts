import { HttpError } from '../errors.ts'
import { clientIp, json, readJson } from '../http.ts'
import { createOrder, enforceRateLimit, ipKey, prepareOrder, toQuoteDto } from '../order-pipeline.ts'
import type { Deps } from '../ports.ts'
import { CreateOrderSchema, GetOrderSchema, OrderInputSchema, parseBody } from '../schemas.ts'

/** POST quote-order — authoritative totals, no side effects (docs/API.md §3.1). */
export async function handleQuoteOrder(req: Request, deps: Deps): Promise<Response> {
  const input = parseBody(OrderInputSchema, await readJson(req))
  await enforceRateLimit(deps, await ipKey(deps, 'quote', clientIp(req)), deps.config.limits.quoteIp)
  const prepared = await prepareOrder(deps, input, { enforceStore: false, phone: '' })
  return json(200, toQuoteDto(prepared))
}

/** POST create-order (docs/API.md §3.2). */
export async function handleCreateOrder(req: Request, deps: Deps): Promise<Response> {
  const body = parseBody(CreateOrderSchema, await readJson(req))
  const result = await createOrder(deps, body, clientIp(req))
  return json(result.status, result.body)
}

/** POST get-order — public tracking; needs the code AND the secret token (ADR-0013). */
export async function handleGetOrder(req: Request, deps: Deps): Promise<Response> {
  const { code, token } = parseBody(GetOrderSchema, await readJson(req))
  await enforceRateLimit(deps, await ipKey(deps, 'get-order', clientIp(req)), deps.config.limits.getOrderIp)
  const order = await deps.repo.getOrderByToken(token)
  // Same answer for "wrong code" and "wrong token": nothing to enumerate.
  if (!order || order.code.toLowerCase() !== code.toLowerCase()) throw new HttpError('NOT_FOUND', 'No encontramos ese pedido.')
  const settings = await deps.repo.loadSettings()
  const showTransfer = order.paymentMethod === 'transfer' && order.paymentStatus === 'pending' && order.status !== 'cancelled'
  return json(200, {
    code: order.code,
    status: order.status,
    type: order.type,
    payment_method: order.paymentMethod,
    payment_status: order.paymentStatus,
    created_at: order.createdAt,
    scheduled_for: order.scheduledFor,
    estimated_minutes: order.estimatedMinutes,
    items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, modifiers: i.modifiers, note: i.note, line_total: i.lineTotal })),
    subtotal: order.subtotal,
    discount: order.discount,
    delivery_fee: order.deliveryFee,
    tip: order.tip,
    total: order.total,
    table_number: order.tableNumber,
    history: order.history,
    store: { name: settings.name, whatsapp: settings.whatsapp },
    ...(showTransfer ? { transfer: { alias: settings.transferAlias, cbu: settings.transferCbu, holder: settings.transferHolder } } : {}),
  })
}
