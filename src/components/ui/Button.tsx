import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/lib/cn'
import { buttonClasses, type ButtonVariant, type StyleOptions } from './buttonStyles'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, StyleOptions {
  loading?: boolean
  leadingIcon?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant,
  size,
  block,
  loading = false,
  leadingIcon,
  disabled,
  className,
  children,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, block }), className)}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        leadingIcon
      )}
      {children}
    </button>
  )
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required: an icon alone has no accessible name. */
  'aria-label': string
  variant?: Exclude<ButtonVariant, 'primary'>
  ref?: Ref<HTMLButtonElement>
}

export function IconButton({
  variant = 'ghost',
  className,
  type = 'button',
  ref,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150 disabled:opacity-50',
        variant === 'ghost' && 'border-transparent text-ink hover:bg-ink/10 active:bg-ink/15',
        variant === 'outline' && 'border-ink bg-card text-ink hover:bg-ink/10',
        variant === 'secondary' && 'border-(--shadow-ink) bg-maiz text-carbon',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
