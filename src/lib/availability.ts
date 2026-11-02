// "ว่างไหมวันที่ X" for the admin, answered from the bookings the admin page
// already holds — no extra Apps Script round trip. The windows mirror the
// server's capacity check (readBookingSlotsAll + createBooking) exactly:
// local rentals carry a 1h charging gap after return, provincial rentals hold
// the unit 3 days either side for the ship legs.
import { Booking, CameraId, RentalArea } from '@/types'
import { BlockedSlot } from '@/lib/api'
import { BATTERY_CHARGE_BUFFER_MS, CAMERAS, PROVINCIAL_SHIP_LEAD_DAYS } from '@/lib/cameras'
import { dayLabel, dayTimeLabel } from '@/lib/admin'
import { Closure, ClosureMode, handoverError } from '@/lib/closures'

const DAY_MS = 24 * 60 * 60 * 1000
const SHIP_MS = PROVINCIAL_SHIP_LEAD_DAYS * DAY_MS

interface Span { start: number; end: number; weight: number }

// How long a booking ties up one unit, as the server counts it. `start`/`end`
// include the ship legs or charging gap; `coreStart`/`coreEnd` are the rental
// itself (what the queue chart draws solid). null = dates that don't parse.
export interface BookingWindow { start: number; end: number; coreStart: number; coreEnd: number }

export function bookingWindow(b: Booking): BookingWindow | null {
  const pickup = new Date(String(b.pickupDatetime)).getTime()
  const ret = new Date(String(b.returnDatetime)).getTime()
  if (isNaN(pickup) || isNaN(ret)) return null
  if (b.rentalArea === 'provincial') {
    const back = b.bookingStatus === 'returned' && b.returnedAt ? new Date(b.returnedAt).getTime() : NaN
    if (!isNaN(back)) {
      // Back at the shop: only the charging gap from the actual return remains
      const end = back + BATTERY_CHARGE_BUFFER_MS
      const start = Math.min(pickup, end)
      return { start, end, coreStart: start, coreEnd: Math.min(Math.max(back, start), ret) }
    }
    return { start: pickup - SHIP_MS, end: ret + SHIP_MS, coreStart: pickup, coreEnd: ret }
  }
  return { start: pickup, end: ret + BATTERY_CHARGE_BUFFER_MS, coreStart: pickup, coreEnd: ret }
}

// Units a block takes from one model: 'ALL' means every unit of every model
export function blockWeight(bl: BlockedSlot, units: number): number {
  return bl.cameraId === 'ALL' ? units : Math.min(bl.quantity || 1, units)
}

function bookingSpan(b: Booking): Span | null {
  const w = bookingWindow(b)
  return w ? { start: w.start, end: w.end, weight: 1 } : null
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
      if (bl.mode !== 'hold') continue // closures hold no unit
      const s = new Date(bl.startDatetime).getTime()
      const e = new Date(bl.endDatetime).getTime()
      if (isNaN(s) || isNaN(e)) continue
      spans.push({ start: s, end: e, weight: blockWeight(bl, c.quantity) })
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

// Before saving a block on one model: would it push use past the units?
// Lists the bookings in the way so the owner knows whom to call.
export function blockConflict(
  bookings: Booking[],
  blocks: BlockedSlot[],
  cameraId: CameraId,
  from: Date,
  to: Date,
  quantity: number,
): { units: number; peak: number; over: number; inTheWay: Booking[] } {
  const cam = CAMERAS.find((c) => c.id === cameraId)
  const units = cam?.quantity ?? 1
  const f = from.getTime()
  const t = to.getTime()
  const spans: Span[] = [{ start: f, end: t, weight: Math.min(quantity, units) }]
  const inTheWay: Booking[] = []
  for (const b of bookings) {
    if (b.cameraId !== cameraId || b.bookingStatus === 'cancelled') continue
    const s = bookingSpan(b)
    if (!s) continue
    spans.push(s)
    if (s.start < t && s.end > f) inTheWay.push(b)
  }
  for (const bl of blocks) {
    // "ทุกรุ่น" closures don't hold a unit for anyone, so they don't count here
    if (bl.cameraId !== cameraId || bl.mode !== 'hold') continue
    const s = new Date(bl.startDatetime).getTime()
    const e = new Date(bl.endDatetime).getTime()
    if (!isNaN(s) && !isNaN(e)) spans.push({ start: s, end: e, weight: blockWeight(bl, units) })
  }
  const peak = peakUse(spans, f, t)
  return { units, peak, over: Math.max(0, peak - units), inTheWay }
}

// Before saving a closure: the live bookings it would strand — pickup inside
// it (or, for 'closed', the return too; provincial: the ship-out window fully
// shut). Same rule the server applies to new bookings. A booking already out
// with the customer ('active') only has its return left to check.
export function closureCatches(
  bookings: Booking[],
  closure: { cameraId: CameraId | 'ALL'; start: Date; end: Date; mode: ClosureMode },
): Booking[] {
  const c: Closure = { cameraId: closure.cameraId, start: closure.start.getTime(), end: closure.end.getTime(), mode: closure.mode }
  if (!(c.end > c.start)) return []
  return bookings.filter((b) => {
    if (b.bookingStatus === 'cancelled' || b.bookingStatus === 'returned') return false
    if (c.cameraId !== 'ALL' && b.cameraId !== c.cameraId) return false
    const pickup = new Date(String(b.pickupDatetime)).getTime()
    const ret = new Date(String(b.returnDatetime)).getTime()
    if (isNaN(pickup) || isNaN(ret)) return false
    if (b.bookingStatus === 'active') {
      return b.rentalArea !== 'provincial' && c.mode === 'closed' && ret >= c.start && ret < c.end
    }
    return handoverError([c], b.cameraId, b.rentalArea, pickup, ret) !== ''
  })
}
