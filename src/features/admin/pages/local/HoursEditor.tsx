import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/toastStore'
import { Panel } from '../../components/PageHeader'
import { shiftsProblem, type ShiftDraft } from '../../settings'
import { fetchShifts, hoursKey, saveShifts } from '../../settingsApi'

const DAYS = [
  { id: 1, label: 'Lunes' },
  { id: 2, label: 'Martes' },
  { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' },
  { id: 5, label: 'Viernes' },
  { id: 6, label: 'Sábado' },
  { id: 0, label: 'Domingo' },
] as const

const time = 'min-h-11 rounded-md border-2 border-line bg-card px-2'

/** Weekly opening hours. A closing time at or before the opening time means "after midnight" (19:00 → 01:00). */
export function HoursEditor() {
  const queryClient = useQueryClient()
  const saved = useQuery({ queryKey: hoursKey, queryFn: fetchShifts })
  // Edits live in `draft`; until the first edit the screen shows what is saved.
  const [draft, setDraft] = useState<ShiftDraft[] | null>(null)
  const shifts = draft ?? saved.data ?? []
  const setShifts = (change: (list: ShiftDraft[]) => ShiftDraft[]) => {
    setDraft(change(shifts))
  }

  const problem = shiftsProblem(shifts)
  const save = useMutation({
    mutationFn: () => saveShifts(shifts),
    onSuccess: async () => {
      toast.success('Horarios guardados.')
      setDraft(null)
      await queryClient.invalidateQueries({ queryKey: hoursKey })
      await queryClient.invalidateQueries({ queryKey: ['hours'] })
    },
    onError: () => toast.error('No se pudieron guardar los horarios. Quedaron los anteriores.'),
  })

  const update = (index: number, patch: Partial<ShiftDraft>) => {
    setShifts((list) => list.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  return (
    <Panel
      title="Horarios"
      actions={<span className="text-sm text-ink-soft">Zona horaria: Buenos Aires</span>}
    >
      <div className="space-y-3">
        {DAYS.map((d) => {
          const rows = shifts.map((s, index) => ({ s, index })).filter(({ s }) => s.weekday === d.id)
          return (
            <fieldset
              key={d.id}
              className="flex flex-wrap items-start gap-3 border-b border-line pb-3 last:border-0"
            >
              <legend className="sr-only">{d.label}</legend>
              <p aria-hidden className="w-28 pt-3 font-bold">
                {d.label}
              </p>
              <div className="flex-1 space-y-2">
                {rows.length === 0 && <p className="pt-3 text-ink-soft">Cerrado</p>}
                {rows.map(({ s, index }) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`o-${index}`}>
                      {d.label}: abre
                    </label>
                    <input
                      id={`o-${index}`}
                      type="time"
                      value={s.opensAt}
                      onChange={(e) => {
                        update(index, { opensAt: e.target.value })
                      }}
                      className={time}
                    />
                    <span aria-hidden>a</span>
                    <label className="sr-only" htmlFor={`c-${index}`}>
                      {d.label}: cierra
                    </label>
                    <input
                      id={`c-${index}`}
                      type="time"
                      value={s.closesAt}
                      onChange={(e) => {
                        update(index, { closesAt: e.target.value })
                      }}
                      className={time}
                    />
                    {s.opensAt !== '' && s.closesAt !== '' && s.closesAt <= s.opensAt && (
                      <span className="text-sm text-ink-soft">cierra después de medianoche</span>
                    )}
                    <button
                      type="button"
                      aria-label={`Quitar este turno del ${d.label.toLowerCase()}`}
                      onClick={() => {
                        setShifts((list) => list.filter((_, i) => i !== index))
                      }}
                      className="grid size-11 place-items-center rounded-md hover:bg-ink/10"
                    >
                      <Trash2 aria-hidden className="size-5" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                leadingIcon={<Plus aria-hidden className="size-4" />}
                onClick={() => {
                  setShifts((list) => [...list, { weekday: d.id, opensAt: '19:00', closesAt: '23:00' }])
                }}
              >
                Agregar turno
              </Button>
            </fieldset>
          )
        })}
      </div>
      {problem && (
        <p role="alert" className="mt-3 font-bold text-brand-text">
          {problem}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <Button
          loading={save.isPending}
          disabled={problem !== null || saved.isPending}
          leadingIcon={<Save aria-hidden className="size-5" />}
          onClick={() => {
            save.mutate()
          }}
        >
          Guardar horarios
        </Button>
      </div>
    </Panel>
  )
}
