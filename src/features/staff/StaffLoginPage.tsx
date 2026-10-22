import { useState, type SyntheticEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { homeFor, safeNext } from './roles'
import { useStaff } from './store'
import { usePageMeta } from '@/lib/seo'

/** Staff entry (email + password, no public sign-up: the admin invites people, ADR-0003). */
export function StaffLoginPage() {
  usePageMeta({ title: 'Entrada del personal', noindex: true })
  const { status, staff, signIn } = useStaff()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // A login without an active profile also moves on: the guard of the target screen explains why it cannot enter.
  if (status === 'signed_in' || status === 'no_access') {
    return <Navigate to={safeNext(params.get('next')) ?? (staff ? homeFor(staff.role) : '/cocina')} replace />
  }

  const submit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const message = await signIn(email, password)
    setBusy(false)
    if (message) setError(message)
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <Logo className="h-10 w-auto" />
        <ThemeToggle />
      </div>
      <div>
        <h1 className="text-4xl">Entrada del personal</h1>
        <p className="mt-1 text-ink-soft">Cocina y administración de Takitho.</p>
      </div>
      <form
        onSubmit={(e) => void submit(e)}
        className="space-y-4 rounded-md border-2 border-line bg-card p-4"
        noValidate
      >
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          required
          onChange={(e) => {
            setEmail(e.target.value)
          }}
        />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          required
          onChange={(e) => {
            setPassword(e.target.value)
          }}
        />
        {error && (
          <p role="alert" className="text-sm font-bold text-brand-text">
            {error}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={busy}
          disabled={email.trim() === '' || password === ''}
          leadingIcon={<LogIn aria-hidden className="size-5" />}
        >
          Entrar
        </Button>
      </form>
      <p className="text-center text-sm text-ink-soft">
        ¿No tenés usuario? Pedile una invitación a quien administra el local.
      </p>
    </main>
  )
}
