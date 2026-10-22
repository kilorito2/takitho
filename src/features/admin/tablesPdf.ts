import { cardBoxes, tableUrl } from './tables'

export interface QrTable {
  number: number
  label: string
}

/**
 * A4 sheet of table cards ("Escaneá y pedí"), six per page, with a cut line around each. jsPDF and qrcode are imported
 * here, on demand, so the admin bundle only pays for them when someone prints.
 */
export async function buildTableCardsPdf(tables: readonly QrTable[], baseUrl: string): Promise<Blob> {
  const [{ jsPDF }, QRCode] = await Promise.all([import('jspdf'), import('qrcode')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const boxes = cardBoxes(tables.length)
  const host = baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')

  for (const [i, table] of tables.entries()) {
    const box = boxes[i]
    if (!box) continue
    if (box.page > (boxes[i - 1]?.page ?? 0)) doc.addPage()

    const qr = await QRCode.toDataURL(tableUrl(baseUrl, table.number), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 600,
      color: { dark: '#1E1A17', light: '#FFFFFF' },
    })
    const cx = box.x + box.w / 2

    doc.setDrawColor(150)
    doc.setLineDashPattern([2, 2], 0)
    doc.roundedRect(box.x, box.y, box.w, box.h, 3, 3)
    doc.setLineDashPattern([], 0)

    doc.setFillColor(200, 16, 46) // chile
    doc.rect(box.x + 8, box.y + 8, box.w - 16, 1.6, 'F')

    doc.setTextColor(30, 26, 23)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.text('Escaneá y pedí', cx, box.y + 22, { align: 'center' })

    const size = 52
    doc.addImage(qr, 'PNG', cx - size / 2, box.y + 27, size, size)

    doc.setFontSize(20)
    doc.text(table.label ? `Mesa ${table.number} · ${table.label}` : `Mesa ${table.number}`, cx, box.y + 91, {
      align: 'center',
    })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(90)
    doc.text(`${host}  ·  Takitho`, cx, box.y + box.h - 6, { align: 'center' })
  }

  return doc.output('blob')
}
