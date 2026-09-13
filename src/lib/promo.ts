import {
  CAMERAS, PRICE_TABLES, ORIGINAL_PRICE_TABLES, PROVINCIAL_SHIPPING_FEE, hasCapacityConflict,
} from './cameras'
import { BookedSlot, CameraId } from '@/types'

export type PromoSlot = 'morning' | 'evening'

export interface PromoContext {
  slot: PromoSlot
  /** Booked/blocked windows per camera, as getAllAvailability returns them. */
  availability: Partial<Record<CameraId, BookedSlot[]>>
  /**
   * False when the calendar could not be read. An empty availability map and a
   * genuinely empty calendar look identical, and treating the first as "every
   * camera is free" would post an advert promising units that are already out —
   * so when this is false the post names no cameras at all.
   */
  availabilityKnown?: boolean
  /** Injectable so the caption is reproducible in tests. */
  now?: Date
}

export interface Promo {
  caption: string
  headline: string
  freeCameras: { id: CameraId; name: string; image: string }[]
  windowLabel: string
  groupHint: string
  availabilityKnown: boolean
  texts: string[]
}

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000 // Asia/Bangkok; the shop has no DST to worry about

function bangkokNow(now: Date) {
  return new Date(now.getTime() + TZ_OFFSET_MS)
}

/**
 * The stretch the post is advertising: the coming Friday evening through Sunday
 * night, or — once the weekend is already under way — the rest of it. Outside
 * that, it points at the next three days, which is how far ahead most local
 * rentals get booked.
 */
function promoWindow(now: Date): { start: Date; end: Date; label: string } {
  const local = bangkokNow(now)
  const dow = local.getUTCDay() // 0 Sun … 6 Sat
  const startOfDay = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())

  // Friday (5) and Saturday (6) advertise the weekend in progress; Sunday rolls
  // on to the next one rather than offering a few hours.
  const daysToFriday = dow === 0 ? 5 : (5 - dow + 7) % 7
  if (daysToFriday <= 4) {
    const start = new Date(startOfDay + daysToFriday * 86400000)
    const end = new Date(start.getTime() + 3 * 86400000)
    return { start, end, label: daysToFriday === 0 ? 'สุดสัปดาห์นี้' : 'เสาร์-อาทิตย์นี้' }
  }
  return { start: new Date(startOfDay), end: new Date(startOfDay + 3 * 86400000), label: 'ช่วง 3 วันนี้' }
}

/** Cameras with at least one unit free across the whole advertised window. */
function freeCameras(availability: PromoContext['availability'], start: Date, end: Date) {
  return CAMERAS.filter((cam) => {
    const slots = availability[cam.id] ?? []
    return !hasCapacityConflict(slots, cam.quantity, start, end)
  })
}

function thaiList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return names.slice(0, -1).join(', ') + ' และ ' + names[names.length - 1]
}

/**
 * Ten openings, picked by date so the same one cannot come round twice in a
 * week. Posting the identical text to three groups twice a day is what Facebook
 * and group admins both read as spam, so the wording, the cameras named and the
 * price quoted all move from post to post.
 */
const HEADLINES: ((ctx: { cheapest: number; window: string }) => string)[] = [
  (c) => `📷 เช่ากล้องดิจิตอล มมส. เริ่ม ${c.cheapest}.-/วัน`,
  (c) => `กล้องฟิล์มลุคย้อนยุค ${c.window}ยังมีว่างอยู่นะ 🎞️`,
  (c) => `📸 อยากได้รูปลุคกล้องเก่า? เช่าได้เริ่ม ${c.cheapest}.-`,
  (c) => `ถ่ายรูปเที่ยว${c.window}ด้วยกล้องดิจิตอลย้อนยุค 📷`,
  (c) => `🎞️ MIWVIE SHOP — เช่ากล้องดิจิตอล ส่งถึงมือในรั้ว มมส.`,
  (c) => `กล้องดิจิตอลให้เช่า ${c.window} จองก่อนได้ก่อน 📷`,
  (c) => `📷 รูปลุคเกาหลี ไม่ต้องซื้อกล้อง เช่าวันละ ${c.cheapest}.-`,
  (c) => `เก็บความทรงจำ${c.window}ด้วยกล้องดิจิตอล 🎞️ เริ่ม ${c.cheapest}.-`,
  (c) => `📸 กล้องว่าง${c.window} ทักจองได้เลย`,
  (c) => `เช่ากล้องดิจิตอล มมส. — รับเองซอยวุ่นวาย หรือส่งต่างจังหวัดก็ได้ 📷`,
]

const CLOSERS = [
  'จอง → miwvie-shop.vercel.app\nIG: @miwvie_shop',
  'กดจองเลย → miwvie-shop.vercel.app\nสอบถาม IG: @miwvie_shop',
  'จองผ่านเว็บ miwvie-shop.vercel.app หรือทัก IG @miwvie_shop ได้เลย',
]

/**
 * Deterministic rotation: the same slot on the same day always produces the same
 * post (so a retry does not change what was already sent), while consecutive
 * slots never land on the same template.
 */
function rotationIndex(now: Date, slot: PromoSlot, length: number): number {
  const local = bangkokNow(now)
  const dayNumber = Math.floor(local.getTime() / 86400000)
  return (dayNumber * 2 + (slot === 'evening' ? 1 : 0)) % length
}

export function buildPromo(ctx: PromoContext): Promo {
  const now = ctx.now ?? new Date()
  const { start, end, label } = promoWindow(now)
  const known = ctx.availabilityKnown !== false && Object.keys(ctx.availability).length > 0
  const free = known ? freeCameras(ctx.availability, start, end) : []

  const cheapestDay = Math.min(PRICE_TABLES.A.day1, PRICE_TABLES.B.day1)
  const cheapest6h = Math.min(PRICE_TABLES.A.hourly6, PRICE_TABLES.B.hourly6)
  const fullDay1 = Math.min(ORIGINAL_PRICE_TABLES.A.day1, ORIGINAL_PRICE_TABLES.B.day1)

  const i = rotationIndex(now, ctx.slot, HEADLINES.length)
  const headline = HEADLINES[i]({ cheapest: cheapestDay, window: label })

  const lines: string[] = [headline, '']

  if (!known) {
    lines.push('เช็คคิวว่างและจองได้ที่เว็บเลย')
  } else if (free.length) {
    lines.push(`${label}ยังว่าง: ${thaiList(free.map((c) => c.shortName))}`)
  } else {
    // Never claim availability that isn't there — a post that brings people to a
    // fully-booked calendar costs more goodwill than skipping the line.
    lines.push(`${label}คิวเต็มแล้ว แต่จองล่วงหน้าวันอื่นได้นะ`)
  }

  lines.push(
    '',
    `• 6 ชม. ${cheapest6h}.- | 1 วัน ${cheapestDay}.- (ปกติ ${fullDay1}.-)`,
    '• รับเองซอยวุ่นวาย (ฟรี) หรือ Delivery ในพื้นที่ มมส.',
    `• ส่งต่างจังหวัดได้ ค่าส่ง ${PROVINCIAL_SHIPPING_FEE}.- (ขั้นต่ำ 3 วัน)`,
    '• รีวิวหลังคืน รับส่วนลด 10% ครั้งหน้า',
    '',
    CLOSERS[i % CLOSERS.length],
  )

  const caption = lines.join('\n')

  const when = ctx.slot === 'morning' ? 'รอบเช้า' : 'รอบเย็น'
  const groupHint = ctx.slot === 'morning'
    ? 'โพสต์กลุ่มที่ 1 และ 2'
    : 'โพสต์กลุ่มที่ 3 (และกลุ่ม 1-2 ถ้ากฎกลุ่มอนุญาตวันละ 2 ครั้ง)'

  return {
    caption,
    headline,
    windowLabel: label,
    groupHint,
    freeCameras: free.map((c) => ({ id: c.id, name: c.shortName, image: c.image })),
    availabilityKnown: known,
    texts: [
      `📣 แคปชั่นโปรโมต${when} — ${groupHint}\n\n${caption}`,
      `เปิดหน้านี้เพื่อกดคัดลอก + เซฟรูป:\nhttps://miwvie-shop.vercel.app/promo?slot=${ctx.slot}`,
    ],
  }
}
