import type { UseFormReturn } from 'react-hook-form'
import { Bike, Store, UtensilsCrossed } from 'lucide-react'
import { RadioCard } from '@/components/ui/RadioCard'
import { SelectField, TextField } from '@/components/ui/Field'
import { formatARS } from '@/lib/money'
import type { DeliveryZoneInfo } from '@/features/catalog/types'
import type { CheckoutValues } from '../schema'

interface Props {
  form: UseFormReturn<CheckoutValues>
  type: CheckoutValues['type']
  zones: readonly DeliveryZoneInfo[]
  tableNumber: number | null
  /** Server message such as the minimum order for the chosen zone. */
  quoteMessage: string | null
}

export function StepType({ form, type, zones, tableNumber, quoteMessage }: Props) {
  const { register, formState } = form
  const e = formState.errors
  const zone = zones.find((z) => z.id === form.watch('zoneId'))
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 font-display text-2xl">¿Cómo lo querés?</legend>
      <RadioCard
        value="pickup"
        title="Retiro en el local"
        description="Pasás a buscarlo, sin costo."
        icon={<Store className="size-6" />}
        {...register('type')}
      />
      <RadioCard
        value="delivery"
        title="Delivery"
        description="Te lo llevamos hasta tu casa."
        icon={<Bike className="size-6" />}
        {...register('type')}
      />
      {tableNumber !== null && (
        <RadioCard
          value="dine_in"
          title={`Comer acá · Mesa ${tableNumber}`}
          description="Te lo llevamos a la mesa."
          icon={<UtensilsCrossed className="size-6" />}
          {...register('type')}
        />
      )}

      {type === 'delivery' && (
        <div className="mt-4 space-y-3 rounded-md border-2 border-line p-3">
          <SelectField
            label="Zona de entrega"
            error={e.zoneId?.message}
            {...register('zoneId')}
            hint={
              zone ? `Envío ${formatARS(zone.fee)} · pedido mínimo ${formatARS(zone.minOrder)}` : undefined
            }
          >
            <option value="">Elegí tu zona…</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} · {formatARS(z.fee)}
              </option>
            ))}
          </SelectField>
          {zone && zone.neighborhoods.length > 0 && (
            <p className="text-sm text-ink-soft">Barrios: {zone.neighborhoods.join(', ')}</p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <TextField
              fieldClassName="col-span-2"
              label="Calle"
              autoComplete="address-line1"
              error={e.street?.message}
              {...register('street')}
            />
            <TextField
              label="Altura"
              inputMode="numeric"
              autoComplete="off"
              error={e.number?.message}
              {...register('number')}
            />
          </div>
          <TextField label="Piso / depto (opcional)" autoComplete="address-line2" {...register('floorApt')} />
          <TextField
            label="Referencias (opcional)"
            hint="Ej.: portón verde, timbre roto, tocar el 2."
            {...register('references')}
          />
        </div>
      )}
      {quoteMessage && (
        <p role="alert" className="rounded-md border-2 border-chile bg-chile/10 p-3 text-sm font-bold">
          {quoteMessage}
        </p>
      )}
    </fieldset>
  )
}
