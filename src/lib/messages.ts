// Ready-made chat messages for the admin to copy into IG/LINE. Short, no
// gendered sentence particles, so either owner can send them as-is.
import { Booking } from '@/types'
import { CAMERAS, DELIVERY_LOCATION, RETURN_SHIPPING_ADDRESS, SHOP_MAP_URL } from '@/lib/cameras'
import { agoLabel, dayLabel, dayTimeLabel, dueBack } from '@/lib/admin'
import { baht } from '@/lib/revenue'

export interface MessageTemplate { id: string; label: string; text: string }

export const REVIEW_REQUEST = [
  'ขอบคุณที่ใช้บริการค่ะ🙏💕',
  'ตัวเองสามารถส่งรูปรีวิวอย่างน้อย 4 รูป 📸 เพื่อรับ Code ส่วนลด 10% สำหรับเช่าครั้งต่อไปได้น้า ✨',
].join('\n')

// Sent with the code once the customer's review photos are in
export function reviewThanks(code: string): string {
  return [
    'ขอบคุณสำหรับรีวิวค่ะ 🥰💕',
    'ทางร้านขออนุญาตนำภาพไปโปรโมตร้านนะคะ 📸✨',
    '',
    `🎁 Code ส่วนลด 10%: ${code}`,
    'สามารถนำไปกรอกในการจองครั้งถัดไปได้เลยน้า 🙏',
  ].join('\n')
}

const camName = (b: Booking) => CAMERAS.find((c) => c.id === b.cameraId)?.shortName ?? b.cameraId

export function bookingLink(b: Booking): string {
  if (typeof window === 'undefined') return ''
  const token = b.accessToken ? `?t=${encodeURIComponent(b.accessToken)}` : ''
  return `${window.location.origin}/booking/${encodeURIComponent(b.bookingId)}${token}`
}

export function messageTemplates(b: Booking): MessageTemplate[] {
  const prov = b.rentalArea === 'provincial'
  const cam = camName(b)
  const due = dueBack(b)
  const out: MessageTemplate[] = []

  const missing = [!b.idCardImage && 'รูปบัตรประชาชน', !b.igProfileImage && 'รูปหน้าโปรไฟล์ IG/Facebook'].filter(Boolean)
  if (missing.length && b.bookingStatus !== 'cancelled') {
    out.push({
      id: 'docs',
      label: 'ขอหลักฐาน',
      text: `รบกวนส่ง${missing.join(' และ ')}มาทางแชทนี้ เพื่อยืนยันตัวตนก่อนยืนยันการจอง ${b.bookingId} 🙏`,
    })
  }

  out.push({
    id: 'paid',
    label: 'รับเงินแล้ว',
    text: [
      `ได้รับยอดโอน ${baht(Number(b.totalAmount) || 0)} แล้ว ✅`,
      `${cam} · ${prov ? `ถึงมือ ${dayLabel(b.pickupDatetime)}` : `รับ ${dayTimeLabel(b.pickupDatetime)}`}`,
      `ใบจอง: ${bookingLink(b)}`,
    ].join('\n'),
  })

  const ready = prov
    ? `ส่งพัสดุ ${cam} แล้ว 📦\nเลขพัสดุ: \nถึงประมาณ ${dayLabel(b.pickupDatetime)}\n\nตอนส่งคืน ส่งมาที่ 👇\n${RETURN_SHIPPING_ADDRESS}`
    : b.pickupType === 'delivery'
      ? `กล้อง ${cam} พร้อมแล้ว 📷\nจะไปส่งที่ ${b.pickupAddress} เวลา ${dayTimeLabel(b.pickupDatetime)}`
      : `กล้อง ${cam} พร้อมแล้ว 📷\nนัดรับ ${dayTimeLabel(b.pickupDatetime)} ที่${DELIVERY_LOCATION}\nแผนที่: ${SHOP_MAP_URL}`
  out.push({ id: 'ready', label: prov ? 'ส่งพัสดุแล้ว' : 'พร้อมรับ', text: ready })

  if (prov) {
    out.push({ id: 'returnAddr', label: 'ที่อยู่ส่งคืน', text: `ที่อยู่สำหรับส่งกล้องคืน 📦\n${RETURN_SHIPPING_ADDRESS}` })
  }

  out.push({
    id: 'remind',
    label: 'เตือนคืน',
    text: prov
      ? `แจ้งเตือนส่งคืน ${cam} 📦\nส่งพัสดุคืนภายใน ${dayLabel(due)} ก่อน 12:00 แล้วแจ้งเลขพัสดุในแชทนี้\n\nที่อยู่ส่งคืน 👇\n${RETURN_SHIPPING_ADDRESS}`
      : `แจ้งเตือนคืนกล้อง ${cam} ⏰\nกำหนดคืน ${dayTimeLabel(due)}${b.returnType === 'delivery' ? ` · ร้านไปรับที่ ${b.returnAddress || b.pickupAddress}` : ` ที่${DELIVERY_LOCATION}`}`,
  })

  if (b.bookingStatus === 'active' && due < Date.now()) {
    out.push({
      id: 'overdue',
      label: 'เลยกำหนด',
      text: `กล้อง ${cam} เลยเวลาคืนมา ${agoLabel(due)} แล้ว (กำหนด ${dayTimeLabel(due)})\nรบกวนแจ้งเวลาที่จะคืนด้วย 🙏`,
    })
  }

  out.push({ id: 'review', label: 'ขอรีวิว', text: REVIEW_REQUEST })

  // The message most likely needed now goes first; ones that no longer fit
  // the booking's stage are dropped.
  const order = ORDER[b.bookingStatus] ?? []
  return out
    .filter((t) => order.includes(t.id))
    .sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id))
}

const ORDER: Record<string, string[]> = {
  pending: ['docs', 'paid', 'ready', 'remind'],
  confirmed: ['ready', 'paid', 'remind', 'returnAddr', 'docs'],
  active: ['overdue', 'remind', 'returnAddr', 'review'],
  returned: ['review'],
  cancelled: [],
}
