// Ready-made chat messages for the admin to copy into IG/LINE. Short, no
// gendered sentence particles, so either owner can send them as-is.
import { Booking } from '@/types'
import { CAMERAS, DELIVERY_LOCATION, SHOP_MAP_URL } from '@/lib/cameras'
import { agoLabel, dayLabel, dayTimeLabel, dueBack } from '@/lib/admin'
import { baht } from '@/lib/revenue'

export interface MessageTemplate { id: string; label: string; text: string }

const camName = (b: Booking) => CAMERAS.find((c) => c.id === b.cameraId)?.shortName ?? b.cameraId

export function bookingLink(b: Booking): string {
  if (typeof window === 'undefined') return ''
  const token = b.accessToken ? `?t=${encodeURIComponent(b.accessToken)}` : ''
  return `${window.location.origin}/booking/${encodeURIComponent(b.bookingId)}${token}`
}

export function messageTemplates(b: Booking, reviewCode?: string): MessageTemplate[] {
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
    ? `ส่งพัสดุ ${cam} แล้ว 📦\nเลขพัสดุ: \nถึงประมาณ ${dayLabel(b.pickupDatetime)}`
    : b.pickupType === 'delivery'
      ? `กล้อง ${cam} พร้อมแล้ว 📷\nจะไปส่งที่ ${b.pickupAddress} เวลา ${dayTimeLabel(b.pickupDatetime)}`
      : `กล้อง ${cam} พร้อมแล้ว 📷\nนัดรับ ${dayTimeLabel(b.pickupDatetime)} ที่${DELIVERY_LOCATION}\nแผนที่: ${SHOP_MAP_URL}`
  out.push({ id: 'ready', label: prov ? 'ส่งพัสดุแล้ว' : 'พร้อมรับ', text: ready })

  out.push({
    id: 'remind',
    label: 'เตือนคืน',
    text: prov
      ? `แจ้งเตือนส่งคืน ${cam} 📦\nส่งพัสดุคืนภายใน ${dayLabel(due)} ก่อน 12:00 แล้วแจ้งเลขพัสดุในแชทนี้`
      : `แจ้งเตือนคืนกล้อง ${cam} ⏰\nกำหนดคืน ${dayTimeLabel(due)}${b.returnType === 'delivery' ? ` · ร้านไปรับที่ ${b.returnAddress || b.pickupAddress}` : ` ที่${DELIVERY_LOCATION}`}`,
  })

  if (b.bookingStatus === 'active' && due < Date.now()) {
    out.push({
      id: 'overdue',
      label: 'เลยกำหนด',
      text: `กล้อง ${cam} เลยเวลาคืนมา ${agoLabel(due)} แล้ว (กำหนด ${dayTimeLabel(due)})\nรบกวนแจ้งเวลาที่จะคืนด้วย 🙏`,
    })
  }

  out.push({
    id: 'review',
    label: 'ขอรีวิว',
    text: [
      'ขอบคุณที่ใช้บริการ MIWVIE SHOP 💕',
      'ส่งรูปรีวิว 4 รูป รับส่วนลด 10% สำหรับเช่าครั้งต่อไป',
      reviewCode ? `โค้ดส่วนลด: ${reviewCode}` : '',
    ].filter(Boolean).join('\n'),
  })
  return out
}
