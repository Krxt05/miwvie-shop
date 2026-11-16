// Numbers behind the admin "รายได้" tab. Kept apart from the UI so the money
// rules live in one place:
// - Revenue is counted in the month the camera goes out (pickup date), and only
//   once payment is confirmed (isPaid) — never cancelled bookings.
// - The local delivery fee (20฿/leg) is shop income: the shop delivers itself.
//   The provincial shipping fee (50฿) is paid on to the courier, so it is cash
//   that passes through, not income.
import { Booking, CameraId } from '@/types'
import type { BlockedSlot, Expense, ExpenseCategory } from '@/lib/api'
import { BATTERY_CHARGE_BUFFER_MS, CAMERAS, MARKET_VALUES, PROVINCIAL_SHIP_LEAD_DAYS } from '@/lib/cameras'
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
      // Shop-closed blocks don't take units (rentals may span them)
      if (bl.mode && bl.mode !== 'hold') continue
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

// ---------- pace: what's earned vs still to come ----------

// Splits the period's money by whether the camera has gone out yet, so a month
// in progress shows how much is already locked in and where it could end.
export function pace(bookings: Booking[], p: Period, now = Date.now()) {
  let done = 0, doneCount = 0, booked = 0, bookedCount = 0, pending = 0, pendingCount = 0
  for (const b of bookings) {
    if (b.bookingStatus === 'cancelled' || !inPeriod(b.pickupDatetime, p)) continue
    const net = netOf(b)
    if (isPaid(b)) {
      if (ms(b.pickupDatetime) <= now) { done += net; doneCount++ }
      else { booked += net; bookedCount++ }
    } else if (b.bookingStatus === 'pending') {
      pending += net; pendingCount++
    }
  }
  return {
    done, doneCount, booked, bookedCount, pending, pendingCount,
    // Best case if every unpaid booking is confirmed
    ceiling: done + booked + pending,
  }
}

// Paid rentals that start after the period being viewed — money already secured
// for the months ahead.
export function bookedAhead(bookings: Booking[], p: Period) {
  const { end } = periodBounds(p)
  let total = 0, count = 0
  for (const b of bookings) {
    if (!isPaid(b) || ms(b.pickupDatetime) < end) continue
    total += netOf(b); count++
  }
  return { total, count }
}

// ---------- cash by day (to tick off against the bank app) ----------

export interface CashDay {
  day: string // yyyy-MM-dd
  total: number
  items: { id: string; name: string; amount: number; estimated: boolean }[]
}

export function cashByDay(bookings: Booking[], p: Period): CashDay[] {
  const days = new Map<string, CashDay>()
  for (const b of bookings) {
    if (b.paymentStatus !== 'confirmed') continue
    const when = b.paidAt || b.createdAt
    if (!when || !inPeriod(when, p)) continue
    const day = bangkokDay(String(when))
    const d = days.get(day) ?? { day, total: 0, items: [] }
    const amount = Number(b.totalAmount) || 0
    d.total += amount
    d.items.push({ id: b.bookingId, name: b.customerName, amount, estimated: !b.paidAt })
    days.set(day, d)
  }
  return Array.from(days.values()).sort((a, b) => (a.day < b.day ? 1 : -1))
}

// ---------- rental mix: length, lead time, weekday ----------

const LENGTH_BUCKETS = [
  { key: '6h', label: '6 ชม.', max: 6 },
  { key: '1d', label: '1 วัน', max: 24 },
  { key: '2d', label: '2 วัน', max: 48 },
  { key: '3d', label: '3 วัน', max: 72 },
  { key: '4d+', label: '4 วันขึ้นไป', max: Infinity },
] as const

const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

export function rentalMix(bookings: Booking[], p: Period) {
  const paidHere = bookings.filter((b) => isPaid(b) && inPeriod(b.pickupDatetime, p))
  const lengths = LENGTH_BUCKETS.map((x) => ({ key: x.key, label: x.label, count: 0, net: 0 }))
  const weekdays = WEEKDAYS.map((label) => ({ label, count: 0, net: 0 }))
  let hours = 0, hoursN = 0, lead = 0, leadN = 0, sameDay = 0
  for (const b of paidHere) {
    const start = ms(b.pickupDatetime)
    const h = (ms(b.returnDatetime) - start) / HOUR_MS
    const net = netOf(b)
    if (h > 0) {
      hours += h; hoursN++
      // Round to the nearest hour so a 24h59m booking still counts as 1 day
      const i = LENGTH_BUCKETS.findIndex((x) => Math.round(h) <= x.max)
      lengths[i].count++; lengths[i].net += net
    }
    if (!isNaN(start)) {
      // Weekday in Bangkok time
      const wd = new Date(start + 7 * HOUR_MS).getUTCDay()
      weekdays[wd].count++; weekdays[wd].net += net
      const created = ms(b.createdAt)
      if (!isNaN(created) && start >= created) {
        const days = (start - created) / DAY_MS
        lead += days; leadN++
        if (days < 1) sameDay++
      }
    }
  }
  return {
    count: paidHere.length,
    lengths,
    weekdays,
    avgDays: hoursN ? hours / hoursN / 24 : null,
    avgLeadDays: leadN ? lead / leadN : null,
    sameDayPct: leadN ? Math.round((sameDay / leadN) * 100) : null,
  }
}

// ---------- expenses, profit, ROI ----------


export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  camera: 'ซื้อกล้อง',
  gear: 'อุปกรณ์ (เมม/แบต/สาย/กระเป๋า)',
  repair: 'ซ่อม/บำรุง',
  travel: 'ค่าเดินทาง/ส่งของ',
  marketing: 'โฆษณา/การตลาด',
  other: 'อื่น ๆ',
}

// A camera purchase is an investment, not a running cost: it's paid back over
// many months, so it's kept out of monthly profit and measured by ROI instead.
export const isCapital = (e: Expense) => e.category === 'camera'

const expenseInPeriod = (e: Expense, p: Period) =>
  p.kind === 'month' ? e.date.slice(0, 7) === p.key : e.date.slice(0, 4) === p.key

export function profit(bookings: Booking[], expenses: Expense[], p: Period) {
  const m = money(bookings.filter((b) => isPaid(b) && inPeriod(b.pickupDatetime, p)))
  const income = m.net + m.localFees
  const here = expenses.filter((e) => expenseInPeriod(e, p))
  const byCat = new Map<ExpenseCategory, number>()
  let opex = 0
  let capex = 0
  for (const e of here) {
    if (isCapital(e)) capex += e.amount
    else opex += e.amount
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount)
  }
  const operating = income - opex
  return {
    income,
    opex,
    capex,
    operating, // กำไรจากการดำเนินงาน
    margin: income > 0 ? Math.round((operating / income) * 100) : null,
    afterCapex: operating - capex, // เงินสดเหลือหลังซื้อกล้อง
    byCat: Array.from(byCat.entries()).map(([cat, amount]) => ({ cat, amount })).sort((a, b) => b.amount - a.amount),
    items: here.sort((a, b) => (a.date < b.date ? 1 : -1)),
  }
}

// Daily rental income in a month, by pickup day.
export function dailyNet(bookings: Booking[], month: string) {
  const [y, mo] = month.split('-').map(Number)
  const n = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const days = Array.from({ length: n }, (_, i) => ({ day: `${month}-${String(i + 1).padStart(2, '0')}`, net: 0, count: 0 }))
  for (const b of bookings) {
    if (!isPaid(b)) continue
    const d = bangkokDay(String(b.pickupDatetime))
    if (d.slice(0, 7) !== month) continue
    const row = days[Number(d.slice(8, 10)) - 1]
    row.net += netOf(b)
    row.count++
  }
  return days
}

export interface RoiRow {
  id: CameraId | 'ALL'
  name: string
  cost: number // purchase + repairs tagged to this model
  earned: number // lifetime net rental of this model (paid pickups up to now)
  roiPct: number | null // (earned − cost) / cost
  paybackPct: number | null // earned / cost, capped visually at 100
  monthly: number // avg net per month over the last 3 full months
  monthsLeft: number | null // to break even at that pace
  market: number // market value of the units still rentable
}

// What the cameras would fetch if sold now, after knocking `haircut` (0–1) off
// the market price for a quick second-hand sale. Total return then counts both
// the rental income so far and the cash the cameras would bring back.
export function assetReturn(row: RoiRow, haircut: number) {
  const sale = Math.round(row.market * (1 - haircut))
  const total = row.earned + sale - row.cost
  return { sale, total, pct: row.cost > 0 ? Math.round((total / row.cost) * 100) : null }
}

// Lifetime return on each model's purchase. Only money already earned (pickup
// has happened) counts, so the payback bar never runs ahead of reality.
export function roi(bookings: Booking[], expenses: Expense[], now = Date.now()): { rows: RoiRow[]; shop: RoiRow } {
  const thisMonth = bangkokMonth(now)
  const last3 = [1, 2, 3].map((i) => shiftMonth(thisMonth, -i))
  const earnedRows = bookings.filter((b) => isPaid(b) && ms(b.pickupDatetime) <= now)

  const build = (id: CameraId | 'ALL', name: string, cost: number, mine: Booking[]): RoiRow => {
    const earned = sumNet(mine)
    // Average over the recent full months the model was actually renting
    const first = mine.reduce((m, b) => { const k = bangkokMonth(String(b.pickupDatetime)); return k < m ? k : m }, thisMonth)
    const months = Math.max(1, last3.filter((k) => k >= first).length)
    const monthly = sumNet(mine.filter((b) => last3.includes(bangkokMonth(String(b.pickupDatetime))))) / months
    const remaining = cost - earned
    const market = MARKET_VALUES.filter((u) => id === 'ALL' || u.cameraId === id).reduce((s, u) => s + u.value, 0)
    return {
      id, name, cost, earned, monthly, market,
      roiPct: cost > 0 ? Math.round(((earned - cost) / cost) * 100) : null,
      paybackPct: cost > 0 ? Math.round((earned / cost) * 100) : null,
      monthsLeft: cost > 0 && remaining > 0 && monthly > 0 ? Math.ceil(remaining / monthly) : remaining <= 0 && cost > 0 ? 0 : null,
    }
  }

  const rows = CAMERAS.map((c) => {
    const cost = expenses
      .filter((e) => e.cameraId === c.id && (e.category === 'camera' || e.category === 'repair'))
      .reduce((s, e) => s + e.amount, 0)
    return build(c.id, c.shortName, cost, earnedRows.filter((b) => b.cameraId === c.id))
  })

  // Whole shop: every baht spent against every baht of shop income
  const totalCost = expenses.reduce((s, e) => s + e.amount, 0)
  const shopRow = build('ALL', 'ทั้งร้าน', totalCost, earnedRows)
  const fees = money(earnedRows).localFees
  const shopEarned = shopRow.earned + fees
  const shop: RoiRow = {
    ...shopRow,
    earned: shopEarned,
    roiPct: totalCost > 0 ? Math.round(((shopEarned - totalCost) / totalCost) * 100) : null,
    paybackPct: totalCost > 0 ? Math.round((shopEarned / totalCost) * 100) : null,
    monthsLeft: totalCost > shopEarned && shopRow.monthly > 0 ? Math.ceil((totalCost - shopEarned) / shopRow.monthly) : totalCost > 0 && totalCost <= shopEarned ? 0 : null,
  }
  return { rows, shop }
}
