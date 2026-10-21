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
export function bangkokDay(value: string | Date | number): string {
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
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

// Out with the customer past the agreed return and not marked back yet. A
// provincial parcel is only late once the ship-back legs have also passed.
export function isOverdue(b: Booking, now = Date.now()): boolean {
  if (b.bookingStatus !== 'active' && b.bookingStatus !== 'confirmed') return false
  const ret = new Date(String(b.returnDatetime)).getTime()
  if (isNaN(ret)) return false
  const grace = b.rentalArea === 'provincial' ? PROVINCIAL_SHIP_LEAD_DAYS * DAY_MS : 0
  return ret + grace < now
}

// Revenue the shop has actually been paid, counted in the month the camera
// goes out (the pickup date), never cancelled ones.
export function isPaid(b: Booking): boolean {
  return b.paymentStatus === 'confirmed' && b.bookingStatus !== 'cancelled'
}

export function timeOf(value: string | Date): string {
  const d = new Date(String(value))
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}
