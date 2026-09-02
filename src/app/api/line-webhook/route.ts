import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// LINE bot คำสั่งสำหรับแอดมิน:
//   "วันนี้"        → คิวรับ-คืนวันนี้
//   "พรุ่งนี้"       → คิวพรุ่งนี้
//   "มะรืน"         → คิวมะรืนนี้
//   "5/9/26" ฯลฯ   → คิววันที่ระบุ (d/m/yy หรือ d/m/yyyy, ใช้ - หรือ . คั่นก็ได้)
//
// การตอบกลับ LINE ทำผ่าน Apps Script (action 'lineReply') ซึ่งถือ token อยู่แล้ว
// — Vercel จึงไม่ต้องเก็บ token ของ LINE
//
// env ใน Vercel:
//   LINE_ADMIN_USER_IDS     — userId แอดมิน คั่นด้วย , (ตัวเดียวกับ LINE_USER_ID ใน Apps Script)
//   SCRIPT_URL              — มีอยู่แล้ว
//   ADMIN_PIN               — ถ้าไม่ตั้ง จะใช้ 1234
//   LINE_CHANNEL_SECRET     — (ไม่บังคับ) ตั้งไว้เพื่อ verify signature ของ webhook

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET ?? ''
const ADMIN_IDS = (process.env.LINE_ADMIN_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const SCRIPT_URL = process.env.SCRIPT_URL ?? ''
const ADMIN_PIN = process.env.ADMIN_PIN ?? '1234'

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export async function POST(req: NextRequest) {
  const raw = await req.text()

  if (CHANNEL_SECRET) {
    const sig = req.headers.get('x-line-signature') ?? ''
    const expected = crypto.createHmac('sha256', CHANNEL_SECRET).update(raw).digest('base64')
    if (sig !== expected) return new NextResponse('bad signature', { status: 401 })
  }

  let body: { events?: LineEvent[] }
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: true })
  }

  const events = body.events ?? []
  await Promise.allSettled(events.map(handleEvent))
  return NextResponse.json({ ok: true })
}

interface LineEvent {
  type: string
  replyToken?: string
  source?: { userId?: string }
  message?: { type?: string; text?: string }
}

async function handleEvent(ev: LineEvent) {
  if (ev.type !== 'message' || ev.message?.type !== 'text' || !ev.replyToken) return

  const target = parseDateCommand((ev.message.text ?? '').trim())
  if (!target) return // ไม่ใช่คำสั่ง — ปล่อยให้ auto-reply ของ LINE จัดการ

  // เฉพาะแอดมิน (ถ้าไม่ได้ตั้ง ADMIN_IDS จะตอบทุกคน)
  if (ADMIN_IDS.length > 0 && !ADMIN_IDS.includes(ev.source?.userId ?? '')) return

  let text: string
  try {
    const queue = await fetchDayQueue(target.iso)
    text = formatQueue(target.label, target.iso, queue)
  } catch {
    text = 'ดึงข้อมูลคิวไม่สำเร็จ ลองใหม่อีกครั้งนะ'
  }
  await reply(ev.replyToken, text)
}

// ── parse คำสั่งวันที่ ────────────────────────────────────────

function bangkokToday(): Date {
  // Vercel รันเป็น UTC — เลื่อน +7 ชม. แล้วตัดเป็นวันที่ (ไทยไม่มี DST)
  const now = new Date()
  return new Date(now.getTime() + 7 * 60 * 60 * 1000)
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseDateCommand(text: string): { iso: string; label: string } | null {
  const t = text.replace(/\s+/g, '')

  if (['วันนี้', 'today', 'คิววันนี้'].includes(t)) {
    const d = bangkokToday()
    return { iso: toISO(d), label: 'วันนี้' }
  }
  if (['พรุ่งนี้', 'พรุงนี้', 'tomorrow', 'คิวพรุ่งนี้'].includes(t)) {
    const d = bangkokToday()
    d.setUTCDate(d.getUTCDate() + 1)
    return { iso: toISO(d), label: 'พรุ่งนี้' }
  }
  if (['มะรืน', 'มะรืนนี้'].includes(t)) {
    const d = bangkokToday()
    d.setUTCDate(d.getUTCDate() + 2)
    return { iso: toISO(d), label: 'มะรืนนี้' }
  }

  // d/m/yy | d/m/yyyy | d-m-yy | d.m.yy
  const m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
  if (m) {
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10)
    let year = parseInt(m[3], 10)
    if (year < 100) year += 2000
    if (year > 2500) year -= 543 // เผื่อพิมพ์ปี พ.ศ.
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return { iso, label: `${day}/${month}/${String(year).slice(2)}` }
  }

  return null
}

// ── ดึงคิวจาก Apps Script ────────────────────────────────────

interface QueueItem {
  bookingId: string
  cameraName: string
  pickupTime: string
  returnTime: string
  pickupDate: string
  returnDate: string
  customerName: string
  customerPhone: string
  customerIG: string
  pickupType: string
  returnType: string
  pickupAddress: string
  returnAddress: string
  status: string
}
interface DayQueue {
  date: string
  pickups: QueueItem[]
  returns: QueueItem[]
  active: QueueItem[]
}

async function fetchDayQueue(iso: string): Promise<DayQueue> {
  const res = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getDayQueue', pin: ADMIN_PIN, date: iso }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data as DayQueue
}

// ── จัดรูปข้อความตอบกลับ ─────────────────────────────────────

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10))
  return `${d} ${TH_MONTHS[m - 1]} ${String(y + 543).slice(2)}`
}

function fmtPhone(p: string): string {
  const digits = (p ?? '').replace(/\D/g, '')
  // Sheets ตัด 0 หน้าเบอร์มือถือทิ้ง → เติมกลับ
  const full = digits.length === 9 ? '0' + digits : digits
  return full.length === 10 ? `${full.slice(0, 3)}-${full.slice(3, 6)}-${full.slice(6)}` : p
}

function line(it: QueueItem, kind: 'pickup' | 'return'): string {
  const time = kind === 'pickup' ? it.pickupTime : it.returnTime
  const method =
    kind === 'pickup'
      ? it.pickupType === 'delivery'
        ? `Delivery${it.pickupAddress ? ' → ' + it.pickupAddress : ''}`
        : 'รับเอง'
      : it.returnType === 'delivery'
        ? `ให้ร้านรับ${it.returnAddress ? ' → ' + it.returnAddress : ''}`
        : 'คืนเอง'
  const ig = it.customerIG ? ` · ${it.customerIG}` : ''
  return `• ${time} · ${it.cameraName}\n  ${it.customerName} ${fmtPhone(it.customerPhone)}${ig}\n  ${method}`
}

function formatQueue(label: string, iso: string, q: DayQueue): string {
  const parts: string[] = [`📋 คิว${label} (${prettyDate(iso)})`]

  if (q.pickups.length) {
    parts.push('', `🛵 รับกล้อง (${q.pickups.length})`, ...q.pickups.map((it) => line(it, 'pickup')))
  }
  if (q.returns.length) {
    parts.push('', `📦 คืนกล้อง (${q.returns.length})`, ...q.returns.map((it) => line(it, 'return')))
  }
  if (q.active.length) {
    parts.push(
      '',
      `🎥 กำลังเช่าอยู่ (${q.active.length})`,
      ...q.active.map(
        (it) => `• ${it.cameraName} — ${it.customerName} (คืน ${prettyDate(it.returnDate)} ${it.returnTime})`,
      ),
    )
  }
  if (!q.pickups.length && !q.returns.length && !q.active.length) {
    parts.push('', 'ไม่มีคิวรับ/คืนวันนี้ 🎉')
  }
  return parts.join('\n')
}

// ── ตอบกลับ LINE (ผ่าน Apps Script) ─────────────────────────

async function reply(replyToken: string, text: string) {
  await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'lineReply', pin: ADMIN_PIN, replyToken, text }),
  })
}
