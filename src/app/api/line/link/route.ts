import { NextRequest, NextResponse } from 'next/server'

// Link a booking the customer just made inside LINE (LIFF) to their LINE account,
// then Apps Script pushes them a "booking received" message from the OA.
//
// Body { bookingId, token, accessToken, idToken? }. The LINE userId is never taken
// from the browser: it comes from LINE, after LINE confirms the access token was
// issued for our LINE Login channel. The booking's access_token proves the caller
// made this booking. Apps Script is reached with ADMIN_PIN, which only this server holds.
//
// env: LINE_LOGIN_CHANNEL_ID (the channel that owns the LIFF app), SCRIPT_URL, ADMIN_PIN

const LOGIN_CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID ?? ''
const SCRIPT_URL = process.env.SCRIPT_URL ?? ''
const ADMIN_PIN = process.env.ADMIN_PIN ?? ''
const LINE_TIMEOUT_MS = 8000

// Per-instance cap. Every call costs LINE and Apps Script round trips.
const MAX_PER_MIN = 30
let windowStart = 0
let windowCount = 0
function withinBudget(): boolean {
  const now = Date.now()
  if (now - windowStart > 60_000) { windowStart = now; windowCount = 0 }
  return ++windowCount <= MAX_PER_MIN
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : '')

export async function POST(req: NextRequest) {
  if (!LOGIN_CHANNEL_ID || !SCRIPT_URL || !ADMIN_PIN) {
    return NextResponse.json({ error: 'LINE ยังไม่พร้อมใช้งาน' }, { status: 503 })
  }
  if (!withinBudget()) return NextResponse.json({ error: 'ลองใหม่อีกครั้งภายหลัง' }, { status: 429 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 }) }
  const bookingId = str(body.bookingId, 40)
  const token = str(body.token, 200)
  const accessToken = str(body.accessToken, 4000)
  const idToken = str(body.idToken, 4000)
  if (!/^MIW-\d{8}-\d{3,}$/.test(bookingId) || !token || !accessToken) {
    return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 })
  }

  const line = await verifyLine(accessToken, idToken)
  if (!line) return NextResponse.json({ error: 'ยืนยันบัญชี LINE ไม่สำเร็จ' }, { status: 401 })

  const r = await callScript({
    action: 'linkLine',
    pin: ADMIN_PIN,
    bookingId,
    token,
    lineUserId: line.userId,
    siteUrl: req.nextUrl.origin,
  })
  if (!r || r.error) {
    const notFound = r?.error === 'not found'
    return NextResponse.json({ error: notFound ? 'ไม่พบการจอง' : 'เชื่อม LINE ไม่สำเร็จ' }, { status: notFound ? 404 : 502 })
  }
  return NextResponse.json({ ok: true, sent: r.sent === true, friend: line.friend })
}

// Access token: audience + expiry + whose it is, all asked of LINE directly.
// ID token (optional): if sent it must name the same person.
async function verifyLine(accessToken: string, idToken: string): Promise<{ userId: string; friend: boolean } | null> {
  const signal = () => AbortSignal.timeout(LINE_TIMEOUT_MS)
  const auth = { authorization: `Bearer ${accessToken}` }
  try {
    const [t, p, f, id] = await Promise.all([
      fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`, { signal: signal() }),
      fetch('https://api.line.me/v2/profile', { headers: auth, signal: signal() }),
      fetch('https://api.line.me/friendship/v1/status', { headers: auth, signal: signal() }),
      idToken
        ? fetch('https://api.line.me/oauth2/v2.1/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ id_token: idToken, client_id: LOGIN_CHANNEL_ID }).toString(),
            signal: signal(),
          })
        : null,
    ])
    if (!t.ok || !p.ok) return null
    const tok = await t.json()
    const prof = await p.json()
    if (String(tok.client_id) !== LOGIN_CHANNEL_ID || !(Number(tok.expires_in) > 0)) return null
    const userId = String(prof.userId ?? '')
    if (!/^U[0-9a-f]{32}$/.test(userId)) return null
    if (id) {
      if (!id.ok) return null
      const claims = await id.json()
      if (claims.sub !== userId || String(claims.aud) !== LOGIN_CHANNEL_ID) return null
    }
    // Friendship needs the Login channel linked to the OA; unknown counts as not a friend
    const friend = f.ok ? (await f.json()).friendFlag === true : false
    return { userId, friend }
  } catch {
    return null
  }
}

async function callScript(payload: Record<string, unknown>): Promise<{ error?: string; sent?: boolean } | null> {
  // Apps Script sometimes loses the POST body on its 302 and answers
  // "Unknown action: undefined". linkLine is idempotent, so one retry is safe.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      })
      const j = JSON.parse(await res.text())
      if (typeof j?.error === 'string' && j.error.startsWith('Unknown action: undefined')) continue
      return j
    } catch {
      // timeout or HTML error page: try once more
    }
  }
  return null
}
