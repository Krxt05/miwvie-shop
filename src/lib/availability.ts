// "ว่างไหมวันที่ X" for the admin, answered from the bookings the admin page
// already holds — no extra Apps Script round trip. The windows mirror the
// server's capacity check (readBookingSlotsAll + createBooking) exactly:
// local rentals carry a 1h charging gap after return, provincial rentals hold
// the unit 3 days either side for the ship legs.
import { Booking, CameraId, RentalArea } from '@/types'
import { BlockedSlot } from '@/lib/api'
import { BATTERY_CHARGE_BUFFER_MS, CAMERAS, PROVINCIAL_SHIP_LEAD_DAYS } from '@/lib/cameras'
import { dayLabel, dayTimeLabel } from '@/lib/admin'

const DAY_MS = 24 * 60 * 60 * 1000
const SHIP_MS = PROVINCIAL_SHIP_LEAD_DAYS * DAY_MS

interface Span { start: number; end: number; weight: number }

function bookingSpan(b: Booking): Span | null {
  const pickup = new Date(String(b.pickupDatetime)).getTime()
  const ret = new Date(String(b.returnDatetime)).getTime()
  if (isNaN(pickup) || isNaN(ret)) return null
  if (b.rentalArea === 'provincial') {
    if (b.bookingStatus === 'returned' && b.returnedAt) {
      // Back at the shop: only the charging gap from the actual return remains
      const back = new Date(b.returnedAt).getTime() + BATTERY_CHARGE_BUFFER_MS
      return { start: Math.min(pickup, back), end: back, weight: 1 }
    }
    return { start: pickup - SHIP_MS, end: ret + SHIP_MS, weight: 1 }
  }
  return { start: pickup, end: ret + BATTERY_CHARGE_BUFFER_MS, weight: 1 }
}

// Most units taken at the same moment inside [from, to)
function peakUse(spans: Span[], from: number, to: number): number {
  const ev: { t: number; d: number }[] = []
  for (const s of spans) {
    if (s.start < to && s.end > from) {
      ev.push({ t: Math.max(s.start, from), d: s.weight }, { t: Math.min(s.end, to), d: -s.weight })
    }
  }
  ev.sort((a, b) => a.t - b.t || a.d - b.d)
  let level = 0
  let peak = 0
  for (const e of ev) { level += e.d; peak = Math.max(peak, level) }
  return peak
}

export interface ModelAvailability { id: CameraId; name: string; units: number; free: number }

export function checkAvailability(
  bookings: Booking[],
  blocks: BlockedSlot[],
  area: RentalArea,
  start: Date,
  end: Date,
): ModelAvailability[] {
  const from = start.getTime() - (area === 'provincial' ? SHIP_MS : 0)
  const to = end.getTime() + (area === 'provincial' ? SHIP_MS : BATTERY_CHARGE_BUFFER_MS)
  return CAMERAS.map((c) => {
    const spans: Span[] = []
    for (const b of bookings) {
      if (b.cameraId !== c.id || b.bookingStatus === 'cancelled') continue
      const s = bookingSpan(b)
      if (s) spans.push(s)
    }
    for (const bl of blocks) {
      if (bl.cameraId !== c.id && bl.cameraId !== 'ALL') continue
      const weight = bl.cameraId === 'ALL' ? c.quantity : Math.min(bl.quantity || 1, c.quantity)
      spans.push({ start: new Date(bl.startDatetime).getTime(), end: new Date(bl.endDatetime).getTime(), weight })
    }
    const free = Math.max(0, c.quantity - peakUse(spans, from, to))
    return { id: c.id, name: c.shortName, units: c.quantity, free }
  })
}

// Ready to paste into the customer chat
export function availabilityReply(result: ModelAvailability[], area: RentalArea, start: Date, end: Date): string {
  const range = area === 'provincial'
    ? `${dayLabel(start)} – ${dayLabel(end)} (ส่งต่างจังหวัด)`
    : `${dayTimeLabel(start)} – ${dayTimeLabel(end)}`
  const free = result.filter((r) => r.free > 0).map((r) => r.name)
  const full = result.filter((r) => r.free === 0).map((r) => r.name)
  const lines = [`📷 คิว ${range}`]
  lines.push(free.length ? `✅ ว่าง: ${free.join(', ')}` : '❌ ช่วงนี้เต็มทุกรุ่น')
  if (free.length && full.length) lines.push(`❌ เต็ม: ${full.join(', ')}`)
  return lines.join('\n')
}
