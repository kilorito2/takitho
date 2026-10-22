import type { UseFormReturn } from 'react-hook-form'
import { Banknote, CreditCard, Landmark } from 'lucide-react'
import { Chip } from '@/components/ui/Chip'
import { TextField } from '@/components/ui/Field'
import { RadioCard } from '@/components/ui/RadioCard'
import { cashChange, formatARS } from '@/lib/money'
import { cashSuggestions, parseAmount } from '../money'
import type { CheckoutValues } from '../schema'

interface Props {
  form: UseFormReturn<CheckoutValues>
  values: CheckoutValues
  total: number
  methods: { mercado_pago: boolean; cash: boolean; transfer: boolean }
  tipPresets: readonly number[]
  /** Amount for each preset percentage (already rounded). */
  tipAmounts: Record<number, number>
}

export function StepPayment({ form, values, total, methods, tipPresets, tipAmounts }: Props) {
  const { register, formState, setValue } = form
  const e = formState.errors
  const paid = values.cashPaidWith.trim() === '' ? null : parseAmount(values.cashPaidWith)
  const change = paid === null ? null : cashChange(total, paid)

  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="mb-2 font-display text-2xl">¿Cómo pagás?</legend>
        {methods.mercado_pago && (
          <RadioCard
            value="mercado_pago"
            title="Mercado Pago"
            description="Tarjeta, dinero en cuenta u otros medios. Pagás ahora."
            icon={<CreditCard className="size-6" />}
            {...register('method')}
          />
        )}
        {methods.cash && (
          <RadioCard
            value="cash"
            title="Efectivo"
            description="Pagás al recibir o retirar."
            icon={<Banknote className="size-6" />}
            {...register('method')}
          />
        )}
        {methods.transfer && (
          <RadioCard
            value="transfer"
            title="Transferencia"
            description="Te mostramos el alias para copiar y pagar desde tu app."
            icon={<Landmark className="size-6" />}
            {...register('method')}
          />
        )}
      </fieldset>

      {values.method === 'cash' && (
        <fieldset className="space-y-3 rounded-md border-2 border-line p-3">
          <legend className="px-1 font-display text-xl">¿Con cuánto pagás?</legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Montos sugeridos">
            {cashSuggestions(total).map((n) => (
              <Chip
                key={n}
                selected={paid === n}
                onClick={() => {
                  setValue('cashPaidWith', String(n), { shouldValidate: true })
                }}
              >
                {n === total ? `Justo · ${formatARS(n)}` : formatARS(n)}
              </Chip>
            ))}
          </div>
          <TextField
            label="Otro monto"
            inputMode="numeric"
            placeholder="Ej.: 20000"
            error={e.cashPaidWith?.message}
            {...register('cashPaidWith')}
          />
          {change?.ok && (
            <p role="status" className="rounded-md bg-nopal/15 p-2 font-bold">
              {change.change === 0 ? 'Justo: no necesitás vuelto.' : `Tu vuelto: ${formatARS(change.change)}`}
            </p>
          )}
          {change && !change.ok && (
            <p role="alert" className="font-bold text-brand-text">
              Con eso no alcanza: faltan {formatARS(change.shortBy)}.
            </p>
          )}
          <p className="text-sm text-ink-soft">Si no completás nada, llevamos cambio.</p>
        </fieldset>
      )}

      <fieldset className="space-y-3">
        <legend className="mb-2 font-display text-xl">¿Querés dejar propina? (opcional)</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Propina">
          {[0, ...tipPresets.filter((p) => p > 0)].map((p) => (
            <Chip
              key={p}
              selected={values.tipChoice === String(p)}
              onClick={() => {
                setValue('tipChoice', String(p), { shouldValidate: true })
              }}
            >
              {p === 0 ? 'Sin propina' : `${p} % · ${formatARS(tipAmounts[p] ?? 0)}`}
            </Chip>
          ))}
          <Chip
            selected={values.tipChoice === 'custom'}
            onClick={() => {
              setValue('tipChoice', 'custom', { shouldValidate: true })
            }}
          >
            Otro monto
          </Chip>
        </div>
        {values.tipChoice === 'custom' && (
          <TextField
            label="Propina en pesos"
            inputMode="numeric"
            placeholder="Ej.: 500"
            error={e.tipCustom?.message}
            {...register('tipCustom')}
          />
        )}
      </fieldset>
    </div>
  )
}
