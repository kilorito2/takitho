import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expectNoA11yViolations } from '@/test/a11y'
import { describe, expect, it, vi } from 'vitest'
import { Badge, Button, Chip, IconButton, SpiceLevel, Ticket, TicketLine } from '.'

describe('Button', () => {
  it('calls onClick and is a real button of type "button" by default', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Sumar a la comanda</Button>)
    const button = screen.getByRole('button', { name: 'Sumar a la comanda' })
    expect(button).toHaveAttribute('type', 'button')
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled and announces busy while loading', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Enviando
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Enviando' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('keeps the minimum 44 px target (kitchen size is 56 px)', () => {
    render(
      <>
        <Button>md</Button>
        <Button size="xl">xl</Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'md' }).className).toContain('min-h-11')
    expect(screen.getByRole('button', { name: 'xl' }).className).toContain('min-h-14')
  })
})

describe('IconButton', () => {
  it('exposes its accessible name', () => {
    render(<IconButton aria-label="Cerrar">x</IconButton>)
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
  })
})

describe('Chip', () => {
  it('reflects the selected state with aria-pressed and toggles on click', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<Chip onClick={onClick}>Veggie</Chip>)
    const chip = screen.getByRole('button', { name: 'Veggie' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(
      <Chip selected onClick={onClick}>
        Veggie
      </Chip>,
    )
    expect(screen.getByRole('button', { name: 'Veggie' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('SpiceLevel', () => {
  it.each([
    [0, 'Sin picante: 0 de 3'],
    [2, 'Picante medio: 2 de 3'],
    [3, 'Muy picante: 3 de 3'],
  ] as const)('level %s has the text alternative "%s"', (level, label) => {
    render(<SpiceLevel level={level} />)
    expect(screen.getByRole('img', { name: label })).toBeInTheDocument()
  })
})

describe('Ticket', () => {
  it('renders label, amount and sub-line', () => {
    render(
      <Ticket>
        <TicketLine label="2 × Tacos" value="$ 13.600" sub="Maíz · Salsa verde" />
      </Ticket>,
    )
    expect(screen.getByText('2 × Tacos')).toBeInTheDocument()
    expect(screen.getByText('$ 13.600')).toBeInTheDocument()
    expect(screen.getByText('Maíz · Salsa verde')).toBeInTheDocument()
  })
})

describe('accessibility (axe)', () => {
  it('has no violations for the interactive primitives', async () => {
    const { container } = render(
      <main>
        <h1>Prueba</h1>
        <Button>Pedir</Button>
        <IconButton aria-label="Cerrar">x</IconButton>
        <Chip selected>Veggie</Chip>
        <Badge tone="veggie">Veggie</Badge>
        <SpiceLevel level={2} showLabel />
      </main>,
    )
    await expectNoA11yViolations(container)
  })
})
