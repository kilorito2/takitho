import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { SkeletonGroup, Skeleton } from '@/components/ui/Skeleton'
import { ApiError } from '@/lib/api'
import { api } from '@/lib/client'
import { formatARS } from '@/lib/money'
import { buildOrderInput, useQuote } from '@/features/cart/quote'
import { cartCount, useCart, type NewCartItem } from '@/features/cart/store'
import { useMyOrders } from '@/features/cart/myOrders'
import { useTable } from '@/features/cart/table'
import { useUi } from '@/features/cart/ui'
import { useHours, useNow, useStore, useStoreStatus, useZones } from '@/features/catalog/hooks'
import { StepConfirm } from './components/StepConfirm'
import { StepContact } from './components/StepContact'
import { StepPayment } from './components/StepPayment'
import { StepType } from './components/StepType'
import { StepWhen } from './components/StepWhen'
import { useDraft } from './draft'
import { createKeyStore } from './idempotency'
import { parseAmount, tipFromPercent } from './money'
import { checkoutSchema, defaultValues, STEP_FIELDS, STEP_TITLES, type CheckoutValues } from './schema'
import { slotOptions } from './slots'
import { buildCreateRequest, orderShape, submitOrder } from './submit'
import { usePageMeta } from '@/lib/seo'

const DELIVERY_EXTRA_MINUTES = 15

/** Checkout in five steps: how, when, who, how to pay, confirm. Totals always come from the server quote. */
export function CheckoutPage() {
  usePageMeta({ title: 'Tu pedido', noindex: true })
  const navigate = useNavigate()
  const items = useCart((s) => s.items)
  const couponCode = useCart((s) => s.couponCode)
  const clearCart = useCart((s) => s.clear)
  const setCartOpen = useUi((s) => s.setCartOpen)
  const tableNumber = useTable((s) => s.tableNumber)
  const draft = useDraft()
  const addOrder = useMyOrders((s) => s.add)
  const store = useStore()
  const hours = useHours()
  const zones = useZones()
  const { status } = useStoreStatus()
  const now = useNow(60_000)

  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<ApiError | null>(null)
  const keys = useRef(createKeyStore())
  const heading = useRef<HTMLHeadingElement>(null)

  const form = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    mode: 'onTouched',
    defaultValues: defaultValues({
      type: tableNumber !== null ? 'dine_in' : 'pickup',
      name: draft.name,
      phone: draft.phone,
    }),
  })
  const watched = useWatch({ control: form.control })
  const values = useMemo(() => ({ ...defaultValues(), ...watched }), [watched])

  const canOrderNow = status?.canOrderNow ?? true
  const canSchedule = status?.canSchedule ?? true
  const info = store.data
  const zone = zones.data?.find((z) => z.id === values.zoneId)

  const slots = useMemo(
    () =>
      info && hours.data
        ? slotOptions(now, hours.data, info.timezone, {
            prepMinutes: info.prepMinutes,
            maxDays: info.maxScheduleDays,
          })
        : [],
    [info, hours.data, now],
  )
  // Closed or paused → only scheduled orders. A slot that expired while the form was open is dropped.
  useEffect(() => {
    if (!canOrderNow && form.getValues('whenMode') === 'asap' && canSchedule)
      form.setValue('whenMode', 'scheduled')
  }, [canOrderNow, canSchedule, form])
  useEffect(() => {
    const slot = form.getValues('slot')
    if (slot && !slots.some((s) => s.value === slot)) form.setValue('slot', '')
  }, [slots, form])

  const localSubtotal = items.reduce((n, i) => n + i.snapshot.unitPrice * i.quantity, 0)
  const tipPresets = info?.tipPresets ?? [0, 5, 10]
  const baseForTip = localSubtotal
  const tipAmounts = Object.fromEntries(tipPresets.map((p) => [p, tipFromPercent(baseForTip, p)]))
  const tip =
    values.tipChoice === 'custom'
      ? (parseAmount(values.tipCustom) ?? 0)
      : (tipAmounts[Number(values.tipChoice)] ?? 0)

  const context = useMemo(
    () => ({ items, values, couponCode, tableNumber, tip }),
    [items, values, couponCode, tableNumber, tip],
  )
  const orderInput = useMemo(
    () => (items.length > 0 ? buildOrderInput(items, orderShape(context)) : null),
    [items, context],
  )
  const quote = useQuote(orderInput)
  const quoteError = quote.error instanceof ApiError ? quote.error : null
  const total = quote.data?.total ?? localSubtotal + tip

  const goTo = (n: number) => {
    setStep(n)
    window.requestAnimationFrame(() => heading.current?.focus())
  }

  const next = async () => {
    const ok = await form.trigger([...(STEP_FIELDS[step] ?? [])])
    if (!ok) return
    if (step === 0 && quoteError?.code === 'BELOW_MIN_ORDER') return
    goTo(step + 1)
  }

  const submit = async () => {
    const valid = await form.trigger()
    if (!valid) {
      const firstBad = STEP_FIELDS.findIndex((fields) => fields.some((f) => form.formState.errors[f]))
      if (firstBad >= 0) goTo(firstBad)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    const request = buildCreateRequest(
      context,
      keys.current.keyFor(JSON.stringify(buildCreateRequest(context, ''))),
    )
    try {
      const result = await submitOrder(api(), request)
      if (result.kind === 'error') {
        setSubmitError(result.error)
        if (result.error.code === 'INVALID_SLOT') form.setValue('slot', '')
        if ((result.error.code === 'STORE_CLOSED' || result.error.code === 'STORE_PAUSED') && canSchedule)
          form.setValue('whenMode', 'scheduled')
        if (result.step !== null) goTo(result.step)
        return
      }
      const saved: NewCartItem[] = items.map(({ id: _id, ...rest }) => rest)
      addOrder({
        code: result.order.code,
        token: result.order.public_token,
        createdAt: new Date().toISOString(),
        total: result.order.total,
        type: values.type,
        paymentMethod: values.method,
        items: saved,
      })
      draft.remember(values.name.trim(), values.phone.trim())
      keys.current.reset()
      clearCart()
      const track = `/pedido/${encodeURIComponent(result.order.code)}?t=${encodeURIComponent(result.order.public_token)}`
      if (result.kind === 'redirect') window.location.assign(result.url)
      else void navigate(result.paymentError ? `${track}&pago=error` : track)
    } catch {
      setSubmitError(
        new ApiError(
          'INTERNAL',
          'Algo salió mal de nuestro lado. Tu pedido no se envió: probá de nuevo.',
          500,
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!info || !hours.data || !zones.data) {
    return (
      <SkeletonGroup label="Cargando…" className="mx-auto max-w-2xl space-y-3 px-4 py-8">
        <Skeleton className="h-10" />
        <Skeleton className="h-40" />
      </SkeletonGroup>
    )
  }

  if (items.length === 0) {
    return (
      <section className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-3xl">Tu bandeja está vacía…</h1>
        <p className="mt-2 text-ink-soft">y eso se arregla.</p>
        <Link to="/menu" className={`${buttonClasses({ size: 'lg' })} mt-6`}>
          Ver el menú
        </Link>
      </section>
    )
  }

  const whenText =
    values.whenMode === 'scheduled' && values.slot
      ? (slots.find((s) => s.value === values.slot)?.day ?? '') +
        ' · ' +
        (slots.find((s) => s.value === values.slot)?.time ?? '')
      : `Lo antes posible (unos ${info.prepMinutes + (values.type === 'delivery' ? DELIVERY_EXTRA_MINUTES : 0)} min)`
  const quoteMessage =
    quoteError && (quoteError.code === 'BELOW_MIN_ORDER' || quoteError.code === 'INVALID_TABLE')
      ? quoteError.message
      : null
  const orderProblem = quoteError && !quoteMessage ? quoteError : null
  const last = step === STEP_TITLES.length - 1

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link to="/menu" className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-brand-text">
        <ArrowLeft aria-hidden className="size-4" /> Seguir pidiendo
      </Link>
      <h1 ref={heading} tabIndex={-1} className="mb-4 text-3xl outline-none">
        Tu pedido
      </h1>

      <ol aria-label="Pasos" className="mb-6 grid grid-cols-5 gap-1">
        {STEP_TITLES.map((t, i) => (
          <li key={t} aria-current={i === step ? 'step' : undefined} className="text-center">
            <span
              className={`mx-auto mb-1 grid size-8 place-items-center rounded-full border-2 font-mono text-sm font-bold ${i <= step ? 'border-(--shadow-ink) bg-brand text-on-brand' : 'border-line text-ink-soft'}`}
            >
              {i + 1}
            </span>
            <span className={`hidden text-xs sm:block ${i === step ? 'font-bold' : 'text-ink-soft'}`}>
              {t}
            </span>
            <span className="sr-only sm:hidden">{t}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (last) void submit()
            else void next()
          }}
          className="space-y-6"
        >
          {orderProblem && (
            <div role="alert" className="rounded-md border-2 border-chile bg-chile/10 p-3">
              <p className="font-bold">{orderProblem.message}</p>
              {(orderProblem.code === 'ITEM_UNAVAILABLE' || orderProblem.code === 'INVALID_MODIFIERS') && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    setCartOpen(true)
                  }}
                >
                  Revisar mi bandeja
                </Button>
              )}
            </div>
          )}
          {step === 0 && (
            <StepType
              form={form}
              type={values.type}
              zones={zones.data}
              tableNumber={tableNumber}
              quoteMessage={quoteMessage}
            />
          )}
          {step === 1 && (
            <StepWhen
              form={form}
              whenMode={values.whenMode}
              canOrderNow={canOrderNow}
              canSchedule={canSchedule}
              slots={slots}
              prepMinutes={info.prepMinutes}
              extraMinutes={values.type === 'delivery' ? DELIVERY_EXTRA_MINUTES : 0}
            />
          )}
          {step === 2 && <StepContact form={form} />}
          {step === 3 && (
            <StepPayment
              form={form}
              values={values}
              total={total}
              methods={{
                mercado_pago: info.payMpEnabled,
                cash: info.payCashEnabled,
                transfer: info.payTransferEnabled,
              }}
              tipPresets={tipPresets}
              tipAmounts={tipAmounts}
            />
          )}
          {step === 4 && (
            <StepConfirm
              quote={quote.data}
              values={values}
              tableNumber={tableNumber}
              zoneName={zone?.name}
              whenText={whenText}
            />
          )}

          {submitError && (
            <div role="alert" className="rounded-md border-2 border-chile bg-chile/10 p-3">
              <p className="font-bold">{submitError.message}</p>
              {submitError.retryAfterSeconds !== null && (
                <p className="text-sm">Probá de nuevo en {submitError.retryAfterSeconds} segundos.</p>
              )}
              {(submitError.code === 'ITEM_UNAVAILABLE' ||
                submitError.code === 'INVALID_COUPON' ||
                submitError.code === 'INVALID_MODIFIERS') && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    setCartOpen(true)
                  }}
                >
                  Revisar mi bandeja
                </Button>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  goTo(step - 1)
                }}
              >
                Atrás
              </Button>
            )}
            <Button
              type="submit"
              size="lg"
              className="flex-1"
              loading={submitting}
              disabled={submitting || (step === 0 && quoteError?.code === 'BELOW_MIN_ORDER')}
            >
              {last ? `Confirmar pedido · ${formatARS(total)}` : 'Siguiente'}
            </Button>
          </div>
          {last && (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <ShieldCheck aria-hidden className="size-4" /> El precio final lo calcula siempre el servidor:
              no se puede modificar desde tu celular.
            </p>
          )}
        </form>

        <aside aria-label="Resumen" className="hidden lg:block">
          <div className="sticky top-28 rounded-md border-2 border-line bg-card p-4">
            <p className="font-display text-xl">Tu comanda</p>
            <p className="text-sm text-ink-soft">{cartCount(items)} productos</p>
            <p className="mt-3 flex justify-between font-display text-2xl">
              <span>Total</span>
              <span>{formatARS(total)}</span>
            </p>
            <Button
              type="button"
              variant="ghost"
              className="mt-2 -ml-3"
              onClick={() => {
                setCartOpen(true)
              }}
            >
              Ver detalle
            </Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
