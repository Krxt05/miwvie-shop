// Numbers behind the admin "รายได้" tab. Kept apart from the UI so the money
// rules live in one place:
// - Revenue is counted in the month the camera goes out (pickup date), and only
//   once payment is confirmed (isPaid) — never cancelled bookings.
// - The local delivery fee (20฿/leg) is shop income: the shop delivers itself.
//   The provincial shipping fee (50฿) is paid on to the courier, so it is cash
//   that passes through, not income.
import { Booking, CameraId } from '@/types'
import { BlockedSlot } from '@/lib/api'
import { BATTERY_CHARGE_BUFFER_MS, CAMERAS, PROVINCIAL_SHIP_LEAD_DAYS } from '@/lib/cameras'
import { bangkokDay, bangkokMonth, customerKey, isPaid } from '@/lib/admin'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const PROVINCIAL_BUFFER_MS = PROVINCIAL_SHIP_LEAD_DAYS * DAY_MS

export type PeriodKind = 'month' | 'year'
export interface Period {
  kind: PeriodKind
  key: string // 'yyyy-MM' or 'yyyy'
}

const ms = (v: string | Date | undefined) => (v ? new Date(String(v)).getTime() : NaN)

// ---------- periods ----------

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function shiftPeriod(p: Period, delta: number): Period {
  return p.kind === 'month'
    ? { kind: 'month', key: shiftMonth(p.key, delta) }
    : { kind: 'year', key: String(Number(p.key) + delta) }
}

// Bangkok-midnight bounds, [start, end)
export function periodBounds(p: Period): { start: number; end: number } {
  if (p.kind === 'month') {
    return {
      start: ms(`${p.key}-01T00:00:00+07:00`),
      end: ms(`${shiftMonth(p.key, 1)}-01T00:00:00+07:00`),
    }
  }
  return {
    start: ms(`${p.key}-01-01T00:00:00+07:00`),
    end: ms(`${Number(p.key) + 1}-01-01T00:00:00+07:00`),
  }
}

export function inPeriod(value: string | Date, p: Period): boolean {
  const month = bangkokMonth(String(value))
  return p.kind === 'month' ? month === p.key : month.slice(0, 4) === p.key
}

// Thai labels with the Buddhist-era year (date-fns `yyyy` prints the CE year).
// Built once: an Intl formatter per call is slow, worst on iOS Safari.
const MONTH_LONG = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', month: 'long', year: 'numeric' })
const MONTH_YY = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', month: 'short', year: '2-digit' })
const MONTH_SHORT = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', month: 'short' })
const midMonth = (month: string) => new Date(`${month}-15T12:00:00+07:00`)

export function periodLabel(p: Period, style: 'long' | 'short' = 'long'): string {
  if (p.kind === 'year') return `ปี ${Number(p.key) + 543}`
  return (style === 'long' ? MONTH_LONG : MONTH_YY).format(midMonth(p.key))
}

export function monthShort(month: string): string {
  return MONTH_SHORT.format(midMonth(month))
}

export function baht(n: number): string {
  const v = Math.round(n)
  return `${v < 0 ? '−' : ''}฿${Math.abs(v).toLocaleString('th-TH')}`
}

// ---------- money ----------

export interface Money {
  count: number
  gross: number // Σ price (full rental price before discount)
  discount: number
  net: number // rental after discount — the headline
  localFees: number // shop income
  provincialFees: number // passed on to the courier
  totalIn: number // Σ total_amount — what customers paid
  mismatched: number // old rows whose total ≠ price − discount + fee
}

export function money(rows: Booking[]): Money {
  const m: Money = { count: rows.length, gross: 0, discount: 0, net: 0, localFees: 0, provincialFees: 0, totalIn: 0, mismatched: 0 }
  for (const b of rows) {
    const price = Number(b.price) || 0
    const discount = Number(b.discountAmount) || 0
    const fee = Number(b.deliveryFee) || 0
    const total = Number(b.totalAmount) || 0
    m.gross += price
    m.discount += discount
    if (b.rentalArea === 'provincial') m.provincialFees += fee
    else m.localFees += fee
    m.totalIn += total
    if (Math.abs(total - (price - discount + fee)) > 0.5) m.mismatched++
  }
  m.net = m.gross - m.discount
  return m
}

const netOf = (b: Booking) => (Number(b.price) || 0) - (Number(b.discountAmount) || 0)
export const sumNet = (rows: Booking[]) => rows.reduce((s, b) => s + netOf(b), 0)

// A period still in progress is compared with the same stretch of the previous
// one (day 1 → today's date), otherwise a half-finished month always looks down.
export function comparison(paid: Booking[], p: Period, now = Date.now()) {
  const today = bangkokDay(now) // yyyy-MM-dd
  const current = p.kind === 'month' ? today.slice(0, 7) === p.key : today.slice(0, 4) === p.key
  // For a month compare day-of-month; for a year compare month-day
  const cut = p.kind === 'month' ? today.slice(8, 10) : today.slice(5, 10)
  const within = (b: Booking) => {
    if (!current) return true
    const d = bangkokDay(String(b.pickupDatetime))
    return (p.kind === 'month' ? d.slice(8, 10) : d.slice(5, 10)) <= cut
  }
  const prev = shiftPeriod(p, -1)
  const now$ = sumNet(paid.filter((b) => inPeriod(b.pickupDatetime, p) && within(b)))
  const prev$ = sumNet(paid.filter((b) => inPeriod(b.pickupDatetime, prev) && within(b)))
  return {
    current,
    rangeNote: current
      ? p.kind === 'month'
        ? `เทียบ 1–${Number(cut)} ${periodLabel(prev, 'short')}`
        : `เทียบช่วงเดียวกันของ ${periodLabel(prev)}`
      : `เทียบ ${periodLabel(prev, p.kind === 'month' ? 'short' : 'long')}`,
    diff: now$ - prev$,
    pct: prev$ > 0 ? Math.round(((now$ - prev$) / prev$) * 100) : null,
    hasPrev: prev$ > 0,
  }
}

// Money that reached the account in the period, by the day the admin confirmed
// payment. Rows from before paid_at existed fall back to the booking date.
export function cashIn(bookings: Booking[], p: Period) {
  let total = 0
  let estimated = 0
  for (const b of bookings) {
    if (b.paymentStatus !== 'confirmed') continue
    const when = b.paidAt || b.createdAt
    if (!when || !inPeriod(when, p)) continue
    total += Number(b.totalAmount) || 0
    if (!b.paidAt) estimated++
  }
  return { total, estimated }
}

// ---------- utilisation ----------

interface Span { start: number; end: number; weight: number }

// Unit-hours inside [from, to) where at least one unit is taken, never counting
// more units than the model has (a block on top of a booking isn't double-busy).
function busyUnitHours(spans: Span[], units: number, from: number, to: number): number {
  const events: { t: number; d: number }[] = []
  for (const s of spans) {
    const a = Math.max(s.start, from)
    const b = Math.min(s.end, to)
    if (!(b > a)) continue
    events.push({ t: a, d: s.weight }, { t: b, d: -s.weight })
  }
  events.sort((x, y) => x.t - y.t || x.d - y.d)
  let level = 0
  let last = from
  let total = 0
  for (const e of events) {
    total += Math.min(level, units) * (e.t - last)
    level += e.d
    last = e.t
  }
  return total / HOUR_MS
}

export interface CameraRow {
  id: CameraId
  name: string
  units: number
  count: number
  net: number
  rentedPct: number | null // paid rentals only
  busyPct: number | null // + shipping/charging buffers, unpaid holds and manual blocks
}

export function cameraRows(
  bookings: Booking[],
  blocks: BlockedSlot[],
  p: Period,
  now = Date.now(),
): { rows: CameraRow[]; utilDays: number } {
  const bounds = periodBounds(p)
  // Don't count months before the shop took its first booking as idle time,
  // or a year view makes every camera look unused.
  const firstPickup = Math.min(...bookings.map((b) => ms(b.pickupDatetime)).filter((t) => !isNaN(t)))
  const start = Math.max(bounds.start, isFinite(firstPickup) ? firstPickup : bounds.start)
  // Utilisation looks back: measure only the part of the period that has happened.
  const to = Math.min(bounds.end, now)
  const hours = Math.max(0, (to - start) / HOUR_MS)
  const paid = bookings.filter(isPaid)

  const rows = CAMERAS.map((c) => {
    const mine = bookings.filter((b) => b.cameraId === c.id)
    const paidHere = paid.filter((b) => b.cameraId === c.id && inPeriod(b.pickupDatetime, p))

    const rented: Span[] = paid
      .filter((b) => b.cameraId === c.id)
      .map((b) => ({ start: ms(b.pickupDatetime), end: ms(b.returnDatetime), weight: 1 }))

    const busy: Span[] = mine
      .filter((b) => b.bookingStatus !== 'cancelled')
      .map((b) => {
        const pickup = ms(b.pickupDatetime)
        const ret = ms(b.returnDatetime)
        if (b.rentalArea === 'provincial') {
          let tail = ret + PROVINCIAL_BUFFER_MS
          const back = ms(b.returnedAt)
          if (!isNaN(back) && back < tail) tail = back // marked returned frees the unit
          return { start: pickup - PROVINCIAL_BUFFER_MS, end: tail, weight: 1 }
        }
        return { start: pickup, end: ret + BATTERY_CHARGE_BUFFER_MS, weight: 1 }
      })
    for (const bl of blocks) {
      if (bl.cameraId !== c.id && bl.cameraId !== 'ALL') continue
      // 'ALL' takes every unit of every model off the market (blockDates in Code.gs)
      const weight = bl.cameraId === 'ALL' ? c.quantity : Math.min(bl.quantity || 1, c.quantity)
      busy.push({ start: ms(bl.startDatetime), end: ms(bl.endDatetime), weight })
    }

    const cap = c.quantity * hours
    return {
      id: c.id,
      name: c.shortName,
      units: c.quantity,
      count: paidHere.length,
      net: sumNet(paidHere),
      rentedPct: cap > 0 ? Math.round((busyUnitHours(rented, c.quantity, start, to) / cap) * 100) : null,
      busyPct: cap > 0 ? Math.round((busyUnitHours([...busy, ...rented], c.quantity, start, to) / cap) * 100) : null,
    }
  }).sort((a, b) => b.net - a.net)

  return { rows, utilDays: hours / 24 }
}

// ---------- secondary metrics ----------

export function insights(bookings: Booking[], p: Period) {
  const paid = bookings.filter(isPaid)
  const paidHere = paid.filter((b) => inPeriod(b.pickupDatetime, p))
  const allHere = bookings.filter((b) => inPeriod(b.pickupDatetime, p))

  // Repeat = this customer already had a paid rental that started earlier.
  const firstPickup = new Map<string, number>()
  for (const b of paid) {
    const k = customerKey(b)
    const t = ms(b.pickupDatetime)
    if (!k || isNaN(t)) continue
    if (!firstPickup.has(k) || t < firstPickup.get(k)!) firstPickup.set(k, t)
  }
  let repeat = 0
  let known = 0
  for (const b of paidHere) {
    const k = customerKey(b)
    if (!k) continue
    known++
    if (ms(b.pickupDatetime) > (firstPickup.get(k) ?? Infinity)) repeat++
  }

  const m = money(paidHere)
  const local = paidHere.filter((b) => b.rentalArea !== 'provincial')
  const provincial = paidHere.filter((b) => b.rentalArea === 'provincial')
  const cancelled = allHere.filter((b) => b.bookingStatus === 'cancelled')
  const cancelledPaid = cancelled.filter((b) => b.paymentStatus === 'confirmed')

  return {
    repeat,
    known,
    repeatPct: known ? Math.round((repeat / known) * 100) : null,
    discountPct: m.gross > 0 ? Math.round((m.discount / m.gross) * 1000) / 10 : null,
    local: { count: local.length, net: sumNet(local) },
    provincial: { count: provincial.length, net: sumNet(provincial) },
    cancelled: cancelled.length,
    cancelPct: allHere.length ? Math.round((cancelled.length / allHere.length) * 100) : null,
    cancelledPaid: { count: cancelledPaid.length, total: cancelledPaid.reduce((s, b) => s + (Number(b.totalAmount) || 0), 0) },
  }
}

// ---------- CSV ----------

// 'yyyy-MM-dd HH:mm' in Bangkok time (UTC+7, no daylight saving)
const bkkDateTime = (v?: string | Date) => {
  if (!v) return ''
  const t = new Date(String(v)).getTime()
  if (isNaN(t)) return ''
  return new Date(t + 7 * HOUR_MS).toISOString().slice(0, 16).replace('T', ' ')
}

export function revenueCsv(bookings: Booking[], p: Period): string {
  const head = [
    'เลขจอง', 'วันที่จอง', 'วันรับกล้อง', 'วันยืนยันรับเงิน', 'รุ่น', 'พื้นที่', 'ชื่อลูกค้า',
    'ค่าเช่าเต็ม', 'ส่วนลด', 'ค่าเช่าสุทธิ', 'ค่าส่งในพื้นที่', 'ค่าส่งต่างจังหวัด', 'ยอดรวม',
    'สถานะเงิน', 'สถานะการจอง', 'นับเป็นรายได้',
  ]
  const rows = bookings
    .filter((b) => inPeriod(b.pickupDatetime, p))
    .sort((a, b) => ms(a.pickupDatetime) - ms(b.pickupDatetime))
    .map((b) => {
      const fee = Number(b.deliveryFee) || 0
      const prov = b.rentalArea === 'provincial'
      return [
        b.bookingId, bkkDateTime(b.createdAt), bkkDateTime(b.pickupDatetime), bkkDateTime(b.paidAt),
        CAMERAS.find((c) => c.id === b.cameraId)?.shortName ?? b.cameraId,
        prov ? 'ต่างจังหวัด' : 'ในพื้นที่', b.customerName,
        Number(b.price) || 0, Number(b.discountAmount) || 0, netOf(b),
        prov ? 0 : fee, prov ? fee : 0, Number(b.totalAmount) || 0,
        b.paymentStatus === 'confirmed' ? 'ยืนยันแล้ว' : 'รอยืนยัน',
        b.bookingStatus, isPaid(b) ? 'ใช่' : 'ไม่',
      ]
    })
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // BOM so Excel opens the Thai text as UTF-8
  return '﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\n')
}
