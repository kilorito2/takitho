import { useMemo } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { Clock, CalendarClock } from 'lucide-react'
import { RadioCard } from '@/components/ui/RadioCard'
import { SelectField } from '@/components/ui/Field'
import { StoreBanner } from '@/features/catalog/components/StoreBanner'
import type { CheckoutValues } from '../schema'
import { groupSlots, type SlotOption } from '../slots'

interface Props {
  form: UseFormReturn<CheckoutValues>
  whenMode: CheckoutValues['whenMode']
  /** False when the shop is closed or paused: only scheduled orders are possible. */
  canOrderNow: boolean
  canSchedule: boolean
  slots: readonly SlotOption[]
  prepMinutes: number
  extraMinutes: number
}

export function StepWhen({
  form,
  whenMode,
  canOrderNow,
  canSchedule,
  slots,
  prepMinutes,
  extraMinutes,
}: Props) {
  const { register, formState } = form
  const groups = useMemo(() => groupSlots(slots), [slots])
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 font-display text-2xl">¿Cuándo lo querés?</legend>
      <StoreBanner />
      <RadioCard
        value="asap"
        disabled={!canOrderNow}
        title="Lo antes posible"
        description={
          canOrderNow
            ? `Tarda unos ${prepMinutes + extraMinutes} minutos.`
            : 'Ahora no estamos tomando pedidos inmediatos.'
        }
        icon={<Clock className="size-6" />}
        {...register('whenMode')}
      />
      <RadioCard
        value="scheduled"
        disabled={!canSchedule || slots.length === 0}
        title="Programarlo"
        description={
          slots.length === 0 ? 'No hay horarios disponibles por ahora.' : 'Elegí el día y la hora.'
        }
        icon={<CalendarClock className="size-6" />}
        {...register('whenMode')}
      />
      {whenMode === 'scheduled' && slots.length > 0 && (
        <SelectField
          label="Horario"
          error={formState.errors.slot?.message}
          hint="Franjas de 15 minutos dentro de nuestro horario."
          {...register('slot')}
        >
          <option value="">Elegí un horario…</option>
          {groups.map((g) => (
            <optgroup key={g.day} label={g.day}>
              {g.slots.map((s) => (
                <option key={s.value} value={s.value}>
                  {g.day} · {s.time}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
      )}
    </fieldset>
  )
}
