import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'
import { ordersToCsvRows, safeSearch, CSV_HEADER, type AdminOrderRow } from './orders'
import { addDays, change, presetRange, previousRange, shortDay } from './ranges'

const TZ = 'America/Argentina/Buenos_Aires'

describe('toCsv', () => {
  it('starts with a BOM, separates with ; and ends lines with CRLF', () => {
    expect(
      toCsv([
        ['Código', 'Total'],
        ['TK-0001', 15000],
      ]),
    ).toBe('﻿Código;Total\r\nTK-0001;15000\r\n')
  })

  it('quotes cells with separators, quotes and line breaks', () => {
    expect(toCsv([['a;b', 'dice "hola"', 'dos\nlíneas']])).toBe('﻿"a;b";"dice ""hola""";"dos\nlíneas"\r\n')
  })

  it('renders empty values and booleans for people', () => {
    expect(toCsv([[null, undefined, true, false, 0]])).toBe('﻿;;Sí;No;0\r\n')
  })

  it('defuses spreadsheet formulas typed by customers', () => {
    expect(toCsv([['=HYPERLINK("http://x")', '+54 11 1234', '-1', '@cmd', 'normal']])).toBe(
      '﻿"\'=HYPERLINK(""http://x"")";\'+54 11 1234;\'-1;\'@cmd;normal\r\n',
    )
  })

  it('does not touch real negative numbers', () => {
    expect(toCsv([[-500]])).toBe('﻿-500\r\n')
  })
})

describe('addDays', () => {
  it('crosses months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('presetRange', () => {
  // Tuesday 21 Oct 2026, 21:00 in Buenos Aires.
  const evening = new Date('2026-10-21T21:00:00-03:00')

  it('builds ranges in business days', () => {
    expect(presetRange('today', evening, TZ)).toEqual({ from: '2026-10-21', to: '2026-10-21' })
    expect(presetRange('yesterday', evening, TZ)).toEqual({ from: '2026-10-20', to: '2026-10-20' })
    expect(presetRange('7d', evening, TZ)).toEqual({ from: '2026-10-15', to: '2026-10-21' })
    expect(presetRange('30d', evening, TZ)).toEqual({ from: '2026-09-22', to: '2026-10-21' })
    expect(presetRange('month', evening, TZ)).toEqual({ from: '2026-10-01', to: '2026-10-21' })
  })

  it('still counts the small hours of the night as the previous day', () => {
    expect(presetRange('today', new Date('2026-10-22T00:45:00-03:00'), TZ)).toEqual({
      from: '2026-10-21',
      to: '2026-10-21',
    })
  })
})

describe('previousRange', () => {
  it('is the same number of days right before', () => {
    expect(previousRange({ from: '2026-10-15', to: '2026-10-21' })).toEqual({
      from: '2026-10-08',
      to: '2026-10-14',
    })
    expect(previousRange({ from: '2026-10-21', to: '2026-10-21' })).toEqual({
      from: '2026-10-20',
      to: '2026-10-20',
    })
  })
})

describe('change', () => {
  it('is the rounded percentage, and null without a base', () => {
    expect(change(150, 100)).toBe(50)
    expect(change(80, 100)).toBe(-20)
    expect(change(10, 0)).toBeNull()
  })
})

describe('shortDay', () => {
  it('reads like a calendar', () => {
    expect(shortDay('2026-10-05')).toBe('5 oct')
  })
})

describe('safeSearch', () => {
  it('drops the characters that mean something inside a PostgREST filter', () => {
    expect(safeSearch('TK-0042')).toBe('TK-0042')
    expect(safeSearch('ana,status.eq.cancelled')).toBe('anastatus.eq.cancelled')
    expect(safeSearch('50%_off(*)')).toBe('50off')
    expect(safeSearch('  María José  ')).toBe('María José')
    expect(safeSearch("O'Brien +54 11")).toBe("O'Brien +54 11")
  })

  it('caps the length', () => {
    expect(safeSearch('a'.repeat(100))).toHaveLength(40)
  })
})

describe('ordersToCsvRows', () => {
  const order: AdminOrderRow = {
    id: 'o1',
    code: 'TK-0001',
    businessDate: '2026-10-20',
    createdAt: '2026-10-21T00:45:00-03:00',
    status: 'delivered',
    type: 'delivery',
    customerName: 'Ana',
    customerPhone: '+5491112345678',
    address: 'Av. Siempreviva 742',
    paymentMethod: 'mercado_pago',
    paymentStatus: 'paid',
    subtotal: 12000,
    discount: 1200,
    deliveryFee: 1500,
    tip: 600,
    total: 12900,
    items: ['2× Tacos al pastor', '1× Esquites'],
  }

  it('has the header and one row per order, in the shop time zone, with the business day apart', () => {
    const rows = ordersToCsvRows([order], TZ)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual([...CSV_HEADER])
    expect(rows[1]).toEqual([
      'TK-0001',
      '21/10/2026 00:45',
      '2026-10-20',
      'Entregado',
      'Delivery',
      'Ana',
      '11 1234-5678',
      'Av. Siempreviva 742',
      '2× Tacos al pastor | 1× Esquites',
      12000,
      1200,
      1500,
      600,
      12900,
      'Mercado Pago',
      'Pagado',
    ])
  })

  it('survives a trip through toCsv with a hostile customer name', () => {
    const csv = toCsv(ordersToCsvRows([{ ...order, customerName: '=cmd|"/c calc"!A1' }], TZ))
    expect(csv).toContain(`"'=cmd|""/c calc""!A1"`)
  })
})
