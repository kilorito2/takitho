import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost'
export type ButtonSize = 'md' | 'lg' | 'xl'

export interface StyleOptions {
  variant?: ButtonVariant | undefined
  size?: ButtonSize | undefined
  block?: boolean | undefined
}

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-md border-2 font-display tracking-wide transition-[transform,box-shadow,background-color] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50'

const variants: Record<ButtonVariant, string> = {
  primary:
    'border-(--shadow-ink) bg-brand text-on-brand shadow-chunk hover:brightness-110 active:translate-x-0.5 active:translate-y-0.5 active:shadow-chunk-sm',
  secondary:
    'border-(--shadow-ink) bg-maiz text-carbon shadow-chunk hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5 active:shadow-chunk-sm',
  outline: 'border-ink bg-card text-ink hover:bg-ink/10 active:bg-ink/15',
  ghost: 'border-transparent bg-transparent text-brand-text hover:bg-ink/10 active:bg-ink/15',
}

// min-h-11 = 44 px (WCAG target size); the kitchen uses xl = 56 px.
const sizes: Record<ButtonSize, string> = {
  md: 'min-h-11 px-5 text-base',
  lg: 'min-h-12 px-6 text-lg',
  xl: 'min-h-14 px-8 text-xl',
}

/** Class string so links (`<Link>`) can look exactly like buttons. */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  block = false,
}: StyleOptions = {}): string {
  return cn(base, variants[variant], sizes[size], block && 'w-full')
}
