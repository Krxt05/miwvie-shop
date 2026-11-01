import { Booking, BookingStatus } from '@/types'
import { PROVINCIAL_SHIP_LEAD_DAYS } from './cameras'

const DAY_MS = 24 * 60 * 60 * 1000

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'รอยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  active: 'กำลังเช่า',
  returned: 'คืนแล้ว',
  cancelled: 'ยกเลิก',
}

// Calendar day in the shop's timezone, as 'yyyy-MM-dd' — the same key the
// LINE bot's queue uses, so the admin "วันนี้" tab and the bot never disagree.
// Bangkok is UTC+7 all year (no daylight saving), so shifting the timestamp and
// reading the UTC date is exact — and far cheaper than building an
// Intl.DateTimeFormat on every call, which made the admin tabs lag.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
export function bangkokDay(value: string | Date | number): string {
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (isNaN(t)) return ''
  return new Date(t + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)
}

export function bangkokMonth(value: string | Date | number): string {
  return bangkokDay(value).slice(0, 7)
}

export function shiftDay(day: string, days: number): string {
  return bangkokDay(new Date(`${day}T12:00:00+07:00`).getTime() + days * DAY_MS)
}

// The day the shop has to act: provincial units leave PROVINCIAL_SHIP_LEAD_DAYS
// before they land with the customer (mirrors buildQueueItem in Code.gs).
export function handoverDay(b: Booking): string {
  const pickup = new Date(String(b.pickupDatetime)).getTime()
  if (isNaN(pickup)) return ''
  return bangkokDay(b.rentalArea === 'provincial' ? pickup - PROVINCIAL_SHIP_LEAD_DAYS * DAY_MS : pickup)
}

export function returnDay(b: Booking): string {
  return bangkokDay(String(b.returnDatetime))
}

export function isOpen(b: Booking): boolean {
  return b.bookingStatus === 'pending' || b.bookingStatus === 'confirmed' || b.bookingStatus === 'active'
}

// When the camera should be back. A local rental runs 24h blocks from the
// moment it was actually handed over (shop rule), so once "ส่งกล้องแล้ว"
// recorded that moment, count from it; otherwise use the booked return.
export function dueBack(b: Booking): number {
  const booked = new Date(String(b.returnDatetime)).getTime()
  const picked = b.pickedUpAt ? new Date(b.pickedUpAt).getTime() : NaN
  if (b.rentalArea !== 'provincial' && !isNaN(picked) && Number(b.durationHours) > 0) {
    return picked + Number(b.durationHours) * 60 * 60 * 1000
  }
  return booked
}

// Out with the customer past the return time and not marked back yet. Only a
// camera that was actually handed over can be late; a provincial parcel only
// once the ship-back legs have also passed.
export function isOverdue(b: Booking, now = Date.now()): boolean {
  if (b.bookingStatus !== 'active') return false
  const ret = dueBack(b)
  if (isNaN(ret)) return false
  const grace = b.rentalArea === 'provincial' ? PROVINCIAL_SHIP_LEAD_DAYS * DAY_MS : 0
  return ret + grace < now
}

// Paid but never marked handed over, and the handover moment is well past:
// either a no-show or someone forgot to press "ส่งกล้องแล้ว".
export function isNotHandedOver(b: Booking, now = Date.now()): boolean {
  if (b.bookingStatus !== 'confirmed') return false
  const pickup = new Date(String(b.pickupDatetime)).getTime()
  if (isNaN(pickup)) return false
  const due = b.rentalArea === 'provincial' ? pickup - (PROVINCIAL_SHIP_LEAD_DAYS - 1) * DAY_MS : pickup + 60 * 60 * 1000
  return due < now
}

// Revenue the shop has actually been paid, counted in the month the camera
// goes out (the pickup date), never cancelled ones.
export function isPaid(b: Booking): boolean {
  return b.paymentStatus === 'confirmed' && b.bookingStatus !== 'cancelled'
}

const TIME_FMT = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
export function timeOf(value: string | Date): string {
  const d = new Date(String(value))
  if (isNaN(d.getTime())) return ''
  return TIME_FMT.format(d)
}

// ---------- Thai date labels (Buddhist-era year, Bangkok time) ----------
// th-TH uses the Buddhist calendar by default, so years print as 2569.
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', ...o })
const F_DAY = fmt({ day: 'numeric', month: 'short' })
const F_DAY_YEAR = fmt({ day: 'numeric', month: 'short', year: '2-digit' })
const F_WEEKDAY = fmt({ weekday: 'short', day: 'numeric', month: 'short' })

function toDate(v: string | Date | number): Date | null {
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d
}
// "3 พ.ย."
export function dayLabel(v: string | Date | number): string {
  const d = toDate(v); return d ? F_DAY.format(d) : '-'
}
// "3 พ.ย. 69"
export function dayYearLabel(v: string | Date | number): string {
  const d = toDate(v); return d ? F_DAY_YEAR.format(d) : '-'
}
// "จ. 3 พ.ย."
export function weekdayLabel(v: string | Date | number): string {
  const d = toDate(v); return d ? F_WEEKDAY.format(d) : '-'
}
// "3 พ.ย. 14:00"
export function dayTimeLabel(v: string | Date | number): string {
  const d = toDate(v); return d ? `${F_DAY.format(d)} ${timeOf(d)}` : '-'
}
// "3 ชม." / "2 วัน" since a moment
export function agoLabel(v: string | Date | number, now = Date.now()): string {
  const d = toDate(v)
  if (!d) return ''
  const mins = Math.max(0, Math.round((now - d.getTime()) / 60000))
  if (mins < 60) return `${mins} นาที`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs} ชม.`
  return `${Math.round(hrs / 24)} วัน`
}

// ---------- customers: repeat / do-not-rent ----------

export const BLACKLIST_TAG = '#ห้ามเช่า'

// One customer across bookings. Phones lost their leading 0 in older sheet
// rows, so compare digits only; fall back to the IG/LINE name.
export function customerKey(b: Booking): string {
  let phone = String(b.customerPhone || '').replace(/\D/g, '')
  if (phone.length === 9 && !phone.startsWith('0')) phone = `0${phone}`
  if (phone.length >= 9) return `p:${phone}`
  const ig = String(b.customerIG || '').trim().toLowerCase().replace(/^@/, '')
  return ig ? `ig:${ig}` : ''
}

export interface CustomerInfo {
  pastRentals: number // paid rentals that started before this booking
  blacklisted: boolean // any booking of this customer carries the tag
}

export function buildCustomerIndex(bookings: Booking[]): (b: Booking) => CustomerInfo {
  const pickups = new Map<string, number[]>()
  const blocked = new Set<string>()
  for (const b of bookings) {
    const k = customerKey(b)
    if (!k) continue
    if (String(b.adminNotes || '').includes(BLACKLIST_TAG)) blocked.add(k)
    if (!isPaid(b)) continue
    const t = new Date(String(b.pickupDatetime)).getTime()
    if (isNaN(t)) continue
    const list = pickups.get(k) ?? []
    list.push(t)
    pickups.set(k, list)
  }
  // Same object for the same booking, so memoised cards don't re-render
  const cache = new Map<string, CustomerInfo>()
  return (b) => {
    const hit = cache.get(b.bookingId)
    if (hit) return hit
    const k = customerKey(b)
    const t = new Date(String(b.pickupDatetime)).getTime()
    const info = k
      ? { pastRentals: (pickups.get(k) ?? []).filter((x) => x < t).length, blacklisted: blocked.has(k) }
      : { pastRentals: 0, blacklisted: false }
    cache.set(b.bookingId, info)
    return info
  }
}

export function hasDocs(b: Booking): boolean {
  return Boolean(b.idCardImage && b.igProfileImage)
}
