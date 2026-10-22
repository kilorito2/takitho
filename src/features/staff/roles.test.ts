import { describe, expect, it } from 'vitest'
import { canAccess, homeFor, loginErrorMessage, safeNext } from './roles'

describe('canAccess', () => {
  it('only lets in the listed roles', () => {
    expect(canAccess('kitchen', ['kitchen', 'admin'])).toBe(true)
    expect(canAccess('kitchen', ['admin'])).toBe(false)
    expect(canAccess('admin', ['admin'])).toBe(true)
  })
})

describe('homeFor', () => {
  it('sends the kitchen to the board and the admin to the dashboard', () => {
    expect(homeFor('kitchen')).toBe('/cocina')
    expect(homeFor('admin')).toBe('/admin')
  })
})

describe('safeNext', () => {
  it.each(['/cocina', '/admin', '/admin/pedidos?estado=ready', '/admin/menu#fotos', '/cocina/'])(
    'keeps %s',
    (path) => {
      expect(safeNext(path)).toBe(path)
    },
  )

  it.each([
    null,
    '',
    'https://evil.test',
    '//evil.test/admin',
    '/\\evil.test',
    '/menu',
    '/administrador',
    '/pedido/TK-0001',
    'cocina',
  ])('drops %s', (path) => {
    expect(safeNext(path)).toBeNull()
  })
})

describe('loginErrorMessage', () => {
  it('translates the usual failures', () => {
    expect(loginErrorMessage({ message: 'Invalid login credentials', status: 400 })).toBe(
      'Email o contraseña incorrectos.',
    )
    expect(loginErrorMessage({ message: 'Email rate limit exceeded', status: 429 })).toMatch(
      /Demasiados intentos/,
    )
    expect(loginErrorMessage({ message: 'Failed to fetch' })).toMatch(/conexión/)
    expect(loginErrorMessage({ message: 'boom' })).toBe('No pudimos iniciar sesión. Probá de nuevo.')
  })
})
