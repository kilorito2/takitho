import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

interface FieldShellProps {
  label: string
  hint?: string | undefined
  error?: string | undefined
  /** Visually hide the label (it stays for screen readers). */
  hideLabel?: boolean
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
  className?: string | undefined
}

/** Label + control + hint + error, wired with htmlFor / aria-describedby / aria-invalid. */
export function Field({ label, hint, error, hideLabel = false, children, className }: FieldShellProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label htmlFor={id} className={cn('mb-1 block font-bold', hideLabel && 'sr-only')}>
        {label}
      </label>
      {children({ id, describedBy, invalid: error !== undefined })}
      {hint && (
        <p id={hintId} className="mt-1 text-sm text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm font-bold text-brand-text">
          {error}
        </p>
      )}
    </div>
  )
}

const control =
  'min-h-12 w-full rounded-md border-2 bg-card px-3 text-base text-ink placeholder:text-ink-soft/80 disabled:opacity-60'

interface Common {
  label: string
  hint?: string | undefined
  error?: string | undefined
  hideLabel?: boolean | undefined
  fieldClassName?: string | undefined
}

export function TextField({
  label,
  hint,
  error,
  hideLabel,
  fieldClassName,
  className,
  ref,
  ...rest
}: Common & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel ?? false} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <input
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(control, invalid ? 'border-chile' : 'border-line', className)}
          {...rest}
        />
      )}
    </Field>
  )
}

export function SelectField({
  label,
  hint,
  error,
  hideLabel,
  fieldClassName,
  className,
  children,
  ref,
  ...rest
}: Common & SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel ?? false} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <select
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(control, invalid ? 'border-chile' : 'border-line', className)}
          {...rest}
        >
          {children}
        </select>
      )}
    </Field>
  )
}

export function TextAreaField({
  label,
  hint,
  error,
  hideLabel,
  fieldClassName,
  className,
  ref,
  ...rest
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel ?? false} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(control, 'py-2', invalid ? 'border-chile' : 'border-line', className)}
          {...rest}
        />
      )}
    </Field>
  )
}
