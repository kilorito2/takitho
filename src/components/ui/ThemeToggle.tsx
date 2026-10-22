import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/cn'

/**
 * The light switch: up = lights on (day), down = lights off (the sign goes neon).
 * A real switch for assistive tech; the 44 px target wraps the small wall plate.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useTheme()
  const lightsOn = theme === 'light'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={lightsOn}
      aria-label="Luz del local"
      title={lightsOn ? 'Apagar la luz (modo noche)' : 'Prender la luz (modo día)'}
      onClick={() => {
        setTheme(lightsOn ? 'dark' : 'light')
      }}
      className={cn('group inline-flex size-11 items-center justify-center rounded-md', className)}
    >
      <span
        className="relative block h-9 w-6 rounded-sm border-2 border-(--shadow-ink) bg-papel shadow-chunk-sm"
        aria-hidden
      >
        <span className="absolute inset-x-0.5 top-0.5 bottom-0.5 rounded-[2px] bg-carbon/10" />
        <span
          className={cn(
            'absolute left-1/2 h-4 w-3 -translate-x-1/2 rounded-[3px] border-2 border-(--shadow-ink) transition-[top,background-color] duration-150 ease-out',
            lightsOn ? 'top-1 bg-maiz' : 'top-3.5 bg-ink-soft',
          )}
        />
      </span>
    </button>
  )
}
