import type { UseFormReturn } from 'react-hook-form'
import { TextField } from '@/components/ui/Field'
import type { CheckoutValues } from '../schema'

export function StepContact({ form }: { form: UseFormReturn<CheckoutValues> }) {
  const { register, formState } = form
  const e = formState.errors
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 font-display text-2xl">Tus datos</legend>
      <TextField label="Nombre" autoComplete="name" error={e.name?.message} {...register('name')} />
      <TextField
        label="WhatsApp"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="11 1234-5678"
        hint="Para avisarte si hay algún problema con tu pedido. Escribilo como quieras."
        error={e.phone?.message}
        {...register('phone')}
      />
      {/* Honeypot: invisible to people and assistive tech, bots fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No completar este campo
          <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
        </label>
      </div>
    </fieldset>
  )
}
