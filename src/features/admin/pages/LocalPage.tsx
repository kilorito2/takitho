import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/toastStore'
import { PageHeader, Panel } from '../components/PageHeader'
import { settingsFormSchema, type SettingsFormInput, type SettingsFormValues } from '../settings'
import { fetchSettings, saveSettings, settingsKey, type StoreSettingsRow } from '../settingsApi'
import { HoursEditor } from './local/HoursEditor'
import { ZonesEditor } from './local/ZonesEditor'

export function LocalPage() {
  const settings = useQuery({ queryKey: settingsKey, queryFn: fetchSettings })
  return (
    <>
      <PageHeader
        title="Local"
        description="Datos del local, horarios, zonas de delivery, medios de pago y tiempos de cocina. Lo que dice [COMPLETAR] todavía falta cargarlo."
      />
      {settings.isPending && <Skeleton className="h-96" />}
      {settings.isError && (
        <p role="alert" className="font-bold text-brand-text">
          No pudimos cargar la configuración.
        </p>
      )}
      {settings.data && (
        <div className="space-y-6">
          <SettingsForm row={settings.data} />
          <HoursEditor />
          <ZonesEditor />
        </div>
      )}
    </>
  )
}

const toForm = (r: StoreSettingsRow): SettingsFormInput => ({
  name: r.name,
  tagline: r.tagline,
  address: r.address,
  mapsUrl: r.maps_url,
  whatsapp: r.whatsapp,
  instagram: r.instagram,
  facebook: r.facebook,
  tiktok: r.tiktok,
  publicUrl: r.public_url,
  transferAlias: r.transfer_alias,
  transferCbu: r.transfer_cbu,
  transferHolder: r.transfer_holder,
  prepMinutes: String(r.prep_minutes),
  timerWarnMinutes: String(r.timer_warn_minutes),
  timerLateMinutes: String(r.timer_late_minutes),
  pendingPaymentTtlMin: String(r.pending_payment_ttl_min),
  maxScheduleDays: String(r.max_schedule_days),
  tipPresets: r.tip_presets.join(', '),
  payMpEnabled: r.pay_mp_enabled,
  payCashEnabled: r.pay_cash_enabled,
  payTransferEnabled: r.pay_transfer_enabled,
  isPaused: r.is_paused,
  isClosedManually: r.is_closed_manually,
  acceptsScheduledWhenClosed: r.accepts_scheduled_when_closed,
})

function Check({
  label,
  hint,
  ...rest
}: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex min-h-11 items-start gap-3 py-1">
      <input type="checkbox" className="mt-1 size-5 shrink-0" {...rest} />
      <span>
        <span className="font-bold">{label}</span>
        {hint && <span className="block text-sm text-ink-soft">{hint}</span>}
      </span>
    </label>
  )
}

function SettingsForm({ row }: { row: StoreSettingsRow }) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, formState } = useForm<SettingsFormInput, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: toForm(row),
  })
  const e = formState.errors
  const save = useMutation({
    mutationFn: saveSettings,
    onSuccess: async () => {
      toast.success('Guardamos los cambios.')
      await queryClient.invalidateQueries({ queryKey: settingsKey })
      await queryClient.invalidateQueries({ queryKey: ['store'] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo guardar.'),
  })

  return (
    <form
      onSubmit={(ev) =>
        void handleSubmit((v) => {
          save.mutate(v)
        })(ev)
      }
      className="space-y-6"
      noValidate
    >
      <Panel title="Estado del local">
        <Check
          label="Pausar pedidos ahora"
          hint="Los clientes solo pueden programar para más tarde."
          {...register('isPaused')}
        />
        <Check
          label="Cerrado por hoy"
          hint="No se toman pedidos aunque esté dentro del horario."
          {...register('isClosedManually')}
        />
        <Check
          label="Aceptar pedidos programados cuando está cerrado"
          hint="El cliente elige un horario dentro de los días de abajo."
          {...register('acceptsScheduledWhenClosed')}
        />
        <TextField
          label="Días hacia adelante para programar"
          inputMode="numeric"
          error={e.maxScheduleDays?.message}
          {...register('maxScheduleDays')}
          fieldClassName="mt-2 max-w-xs"
        />
      </Panel>

      <Panel title="Datos del local">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nombre" error={e.name?.message} {...register('name')} />
          <TextField label="Frase corta" error={e.tagline?.message} {...register('tagline')} />
          <TextField
            label="Dirección"
            error={e.address?.message}
            {...register('address')}
            fieldClassName="sm:col-span-2"
          />
          <TextField
            label="Link de Google Maps"
            hint="Pegá el link de «Compartir» del mapa."
            error={e.mapsUrl?.message}
            {...register('mapsUrl')}
            fieldClassName="sm:col-span-2"
          />
          <TextField
            label="WhatsApp"
            hint="Con código de área, ej.: +54 9 11 5555-0000"
            error={e.whatsapp?.message}
            {...register('whatsapp')}
          />
          <TextField
            label="Instagram"
            hint="Solo el usuario, sin @"
            error={e.instagram?.message}
            {...register('instagram')}
          />
          <TextField label="Facebook" error={e.facebook?.message} {...register('facebook')} />
          <TextField label="TikTok" error={e.tiktok?.message} {...register('tiktok')} />
          <TextField
            label="Dirección de la web"
            hint="Ej.: https://takitho.com.ar (la usan los códigos QR y los links)"
            error={e.publicUrl?.message}
            {...register('publicUrl')}
            fieldClassName="sm:col-span-2"
          />
        </div>
      </Panel>

      <Panel title="Medios de pago">
        <Check
          label="Mercado Pago"
          hint="Tarjeta y dinero en cuenta. El pedido entra a cocina cuando se acredita el pago."
          {...register('payMpEnabled')}
        />
        <Check label="Efectivo" hint="Se cobra al entregar o retirar." {...register('payCashEnabled')} />
        <Check
          label="Transferencia"
          hint="Se muestran el alias y el CBU; marcás el cobro a mano."
          {...register('payTransferEnabled')}
        />
        {e.payCashEnabled?.message && (
          <p role="alert" className="text-sm font-bold text-brand-text">
            {e.payCashEnabled.message}
          </p>
        )}
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <TextField label="Alias" error={e.transferAlias?.message} {...register('transferAlias')} />
          <TextField
            label="CBU / CVU"
            inputMode="numeric"
            error={e.transferCbu?.message}
            {...register('transferCbu')}
          />
          <TextField label="Titular" error={e.transferHolder?.message} {...register('transferHolder')} />
        </div>
        <TextField
          label="Propinas sugeridas (%)"
          hint="Separadas por coma. 0 = sin propina."
          error={e.tipPresets?.message}
          {...register('tipPresets')}
          fieldClassName="mt-3 max-w-xs"
        />
      </Panel>

      <Panel title="Cocina y tiempos">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Demora estimada (min)"
            hint="Se le avisa al cliente."
            inputMode="numeric"
            error={e.prepMinutes?.message}
            {...register('prepMinutes')}
          />
          <TextField
            label="Pasa a «demora» a los (min)"
            inputMode="numeric"
            error={e.timerWarnMinutes?.message}
            {...register('timerWarnMinutes')}
          />
          <TextField
            label="Pasa a «atrasado» a los (min)"
            inputMode="numeric"
            error={e.timerLateMinutes?.message}
            {...register('timerLateMinutes')}
          />
          <TextField
            label="Espera máxima de un pago online (min)"
            hint="Pasado ese tiempo el pedido se cancela solo."
            inputMode="numeric"
            error={e.pendingPaymentTtlMin?.message}
            {...register('pendingPaymentTtlMin')}
          />
        </div>
      </Panel>

      <div className="flex justify-end">
        <Button
          type="submit"
          size="lg"
          loading={save.isPending}
          leadingIcon={<Save aria-hidden className="size-5" />}
        >
          Guardar cambios
        </Button>
      </div>
    </form>
  )
}
