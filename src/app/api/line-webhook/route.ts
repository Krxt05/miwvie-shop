import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// LINE bot คำสั่งสำหรับแอดมิน (พิมพ์ในแชท OA @005vsebr):
//   วันนี้ / พรุ่งนี้ / มะรืน / 5/9/26   → คิวรับ-คืนของวันนั้น
//   คิวทั้งหมด                          → ทุกคิวตั้งแต่วันนี้เป็นต้นไป (แบ่งหลายข้อความถ้ายาว)
//
// GET /api/line-webhook?q=<คำสั่ง>&pin=<pin>  → { texts: string[] } (จัดรูปแล้ว ไม่ส่ง)
//   ใช้โดย Apps Script cron: แจ้งคิว "พรุ่งนี้" ทุกวันเวลา ~16:00
//
// การตอบ/ส่งข้อความ LINE ทำผ่าน Apps Script (action lineReply / linePush) ที่ถือ
// LINE_CHANNEL_TOKEN อยู่แล้ว — Vercel ไม่ต้องเก็บ token ของ LINE
//
// env: LINE_ADMIN_USER_IDS, SCRIPT_URL, ADMIN_PIN (default 1234),
//      LINE_CHANNEL_SECRET (ไม่บังคับ — ตั้งไว้เพื่อ verify signature)

const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET ?? ''
const ADMIN_IDS = (process.env.LINE_ADMIN_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const SCRIPT_URL = process.env.SCRIPT_URL ?? ''
const ADMIN_PIN = process.env.ADMIN_PIN ?? '1234'

const MSG_LIMIT = 4500 // LINE จำกัด 5000/ข้อความ เผื่อไว้
const MAX_MSGS = 5 // LINE ส่งได้สูงสุด 5 ข้อความ/ครั้ง

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const TH_WD = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

// ── entry: POST (webhook จาก LINE) ──────────────────────────

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

  await Promise.allSettled((body.events ?? []).map(handleEvent))
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

  const cmd = parseCommand((ev.message.text ?? '').trim())
  if (!cmd) return // ไม่ใช่คำสั่ง — ปล่อยให้ auto-reply ของ LINE จัดการ

  // เฉพาะแอดมิน (ถ้าไม่ได้ตั้ง ADMIN_IDS จะตอบทุกคน)
  if (ADMIN_IDS.length > 0 && !ADMIN_IDS.includes(ev.source?.userId ?? '')) return

  let texts: string[]
  try {
    texts = await buildTexts(cmd)
  } catch {
    texts = ['ดึงข้อมูลคิวไม่สำเร็จ ลองใหม่อีกครั้งนะ']
  }
  await callScript({ action: 'lineReply', replyToken: ev.replyToken, texts })
}

// ── entry: GET (ให้ Apps Script cron ดึงข้อความที่จัดรูปแล้ว) ─

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('pin') !== ADMIN_PIN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const cmd = parseCommand((searchParams.get('q') ?? '').trim())
  if (!cmd) return NextResponse.json({ error: 'unknown command' }, { status: 400 })

  try {
    return NextResponse.json({ texts: await buildTexts(cmd) })
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 502 })
  }
}

// ── parse คำสั่ง ────────────────────────────────────────────

type Command = { kind: 'day'; iso: string; rel: string } | { kind: 'all' }

function parseCommand(text: string): Command | null {
  const t = text.replace(/\s+/g, '')

  if (['คิวทั้งหมด', 'ทั้งหมด', 'คิว', 'all'].includes(t)) return { kind: 'all' }
  if (['วันนี้', 'today', 'คิววันนี้'].includes(t)) return { kind: 'day', iso: toISO(bkkDay(0)), rel: 'วันนี้' }
  if (['พรุ่งนี้', 'พรุงนี้', 'tomorrow', 'คิวพรุ่งนี้'].includes(t)) return { kind: 'day', iso: toISO(bkkDay(1)), rel: 'พรุ่งนี้' }
  if (['มะรืน', 'มะรืนนี้'].includes(t)) return { kind: 'day', iso: toISO(bkkDay(2)), rel: 'มะรืนนี้' }

  // d/m/yy | d/m/yyyy (คั่นด้วย / - .) — ปี พ.ศ. หรือ ค.ศ.
  const m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
  if (m) {
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10)
    let year = parseInt(m[3], 10)
    if (year < 100) year += 2000
    if (year > 2500) year -= 543
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return {
      kind: 'day',
      iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      rel: '',
    }
  }
  return null
}

function bkkDay(addDays: number): Date {
  // Vercel รันเป็น UTC — เลื่อน +7 ชม. (ไทยไม่มี DST) แล้วบวกวัน
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() + addDays)
  return d
}
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ── ดึงข้อมูล + สร้างข้อความ ─────────────────────────────────

interface QueueItem {
  bookingId: string
  cameraName: string
  pickupTime: string
  returnTime: string
  pickupDate: string
  returnDate: string
  customerName: string
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
interface DayGroup {
  date: string
  pickups: QueueItem[]
  returns: QueueItem[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callScript(payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: ADMIN_PIN, ...payload }),
  })
  const data = await res.json()
  if (data && data.error) throw new Error(String(data.error))
  return data
}

async function buildTexts(cmd: Command): Promise<string[]> {
  if (cmd.kind === 'all') {
    const data = (await callScript({ action: 'getUpcomingQueue' })) as { today: string; days: DayGroup[] }
    return formatUpcoming(data)
  }
  const data = (await callScript({ action: 'getDayQueue', date: cmd.iso })) as DayQueue
  return [formatDay(cmd.rel, cmd.iso, data)]
}

// ── formatters ──────────────────────────────────────────────

function dateLabel(iso: string, rel: string): string {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10))
  const wd = TH_WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  const base = `${wd} ${d} ${TH_MONTHS[m - 1]}`
  return rel ? `${rel} | ${base}` : `${base} ${String(y + 543).slice(2)}`
}

function shortCam(name: string): string {
  return name
    .replace(/^Canon\s+/i, '')
    .replace(/\s*\(.*\)\s*$/, '')
    .trim()
}

function shortName(name: string): string {
  return name.replace(/^(นาย|นางสาว|นาง|น\.ส\.|เด็กชาย|เด็กหญิง)\s*/, '').trim()
}

// ---- รายวัน (วันนี้/พรุ่งนี้/วันที่) — ละเอียด ----

function pickupBlock(it: QueueItem): string {
  const lines = [`${it.pickupTime}  ${shortCam(it.cameraName)}`, it.customerName]
  if (it.pickupType === 'delivery') {
    if (it.customerIG) lines.push(`IG ${it.customerIG}`)
    lines.push(`📍 ส่ง → ${it.pickupAddress.trim() || '(ไม่ระบุที่อยู่)'}`)
  } else {
    lines.push(it.customerIG ? `IG ${it.customerIG} | รับเอง` : 'รับเอง')
  }
  return lines.join('\n')
}

function returnBlock(it: QueueItem): string {
  const head = `${it.returnTime}  ${shortCam(it.cameraName)} | ${it.customerName}`
  if (it.returnType === 'delivery') {
    const ig = it.customerIG ? `\nIG ${it.customerIG}` : ''
    return `${head}${ig}\n📍 ร้านไปรับ → ${it.returnAddress.trim() || '(ไม่ระบุที่อยู่)'}`
  }
  return head
}

function formatDay(rel: string, iso: string, q: DayQueue): string {
  const head = `📅 ${dateLabel(iso, rel)}`

  if (!q.pickups.length && !q.returns.length && !q.active.length) {
    return `${head}\n\n✅ ว่าง ไม่มีคิวรับ-คืน`
  }

  const summary =
    `รับ ${q.pickups.length} | คืน ${q.returns.length}` +
    (q.active.length ? ` | เช่าอยู่ ${q.active.length}` : '')
  const parts: string[] = [head, summary]

  if (q.pickups.length) {
    parts.push('', '━━ 🛵 รับกล้อง ━━', '', q.pickups.map(pickupBlock).join('\n\n'))
  }
  if (q.returns.length) {
    parts.push('', '━━ 📦 คืนกล้อง ━━', '', q.returns.map(returnBlock).join('\n\n'))
  }
  if (q.active.length) {
    parts.push(
      '',
      '━━ 🎥 กำลังเช่าอยู่ ━━',
      '',
      q.active
        .map((it) => `${shortCam(it.cameraName)} | ${it.customerName}\nคืน ${dateLabel(it.returnDate, '')} ${it.returnTime}`)
        .join('\n\n'),
    )
  }
  return parts.join('\n')
}

// ---- คิวทั้งหมด — ย่อ 1 บรรทัด/รายการ, แบ่งหลายข้อความ ----

function formatUpcoming(data: { today: string; days: DayGroup[] }): string[] {
  if (!data.days.length) return ['📋 คิวทั้งหมด\n\n✅ ไม่มีคิวล่วงหน้า']

  const blocks: string[] = [`📋 คิวทั้งหมด (จาก ${dateLabel(data.today, '')})`]

  for (const d of data.days) {
    const lines = [`━ ${dateLabel(d.date, '')} · รับ ${d.pickups.length} | คืน ${d.returns.length} ━`]
    for (const it of d.pickups) {
      const tag = it.pickupType === 'delivery' ? ' · ส่ง' : ''
      lines.push(`🛵 ${it.pickupTime} ${shortCam(it.cameraName)} | ${shortName(it.customerName)}${tag}`)
    }
    for (const it of d.returns) {
      const tag = it.returnType === 'delivery' ? ' · ร้านรับ' : ''
      lines.push(`📦 ${it.returnTime} ${shortCam(it.cameraName)} | ${shortName(it.customerName)}${tag}`)
    }
    blocks.push(lines.join('\n'))
  }

  return chunk(blocks)
}

// รวม blocks เป็นข้อความ ≤ MSG_LIMIT ตัดที่ขอบ block, สูงสุด MAX_MSGS
function chunk(blocks: string[]): string[] {
  const out: string[] = []
  let cur = ''
  for (const b of blocks) {
    const merged = cur ? `${cur}\n\n${b}` : b
    if (cur && merged.length > MSG_LIMIT) {
      out.push(cur)
      cur = b
    } else {
      cur = merged
    }
  }
  if (cur) out.push(cur)

  if (out.length > MAX_MSGS) {
    out.length = MAX_MSGS
    out[MAX_MSGS - 1] += '\n\n… (คิวยาว แสดงบางส่วน — ใช้ "พรุ่งนี้" หรือวันที่ดูรายวัน)'
  }
  return out
}
