import { NextRequest, NextResponse } from 'next/server'

const SCRIPT_URL = process.env.SCRIPT_URL ?? ''

const isConfigured = Boolean(SCRIPT_URL && !SCRIPT_URL.includes('PLACEHOLDER'))

// This route is a public proxy: whatever it forwards, the whole internet can
// call. It used to pass any action straight through, which put every admin
// operation — deleteBooking, blockDates, getAdminBookings — one guessed PIN
// away from anyone who found the URL. Only the actions the site itself needs
// are relayed now; admin work goes through the ones that also check a PIN.
const GET_ACTIONS = new Set([
  'getAvailability',
  'getAllAvailability',
  'getBooking',
  'validateDiscountCode',
])

const POST_ACTIONS = new Set([
  // customer flow
  'createBooking',
  'attachImages',
  'getBooking',
  // admin flow (each one checks the PIN inside Apps Script)
  'getAdminBookings',
  'updateBookingStatus',
  'deleteBooking',
  'blockDates',
  'listBlockedSlots',
  'deleteBlockedSlot',
  'generateDiscountCode',
  'getCorruptRows',
  'listConfigKeys',
  'migrateDocumentSharing',
  'setAdminPin',
])

// Apps Script can stall for half a minute or answer with an HTML error page,
// so give up deliberately rather than leaving the browser hanging.
const UPSTREAM_TIMEOUT_MS = 45_000

type ErrorCode =
  | 'BAD_REQUEST'
  | 'ACTION_NOT_ALLOWED'
  | 'NOT_CONFIGURED'
  | 'UPSTREAM_BAD_RESPONSE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  ACTION_NOT_ALLOWED: 403,
  NOT_CONFIGURED: 503,
  UPSTREAM_BAD_RESPONSE: 502,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_UNAVAILABLE: 502,
}

const MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: 'คำขอไม่ถูกต้อง',
  ACTION_NOT_ALLOWED: 'ไม่อนุญาตให้ทำรายการนี้',
  NOT_CONFIGURED: 'ระบบยังไม่พร้อมใช้งาน',
  UPSTREAM_BAD_RESPONSE: 'ระบบหลังบ้านตอบกลับไม่ถูกต้อง กรุณาลองใหม่',
  UPSTREAM_TIMEOUT: 'ระบบหลังบ้านตอบช้าเกินไป กรุณาลองใหม่',
  UPSTREAM_UNAVAILABLE: 'เชื่อมต่อระบบหลังบ้านไม่ได้ กรุณาลองใหม่',
}

// A failed read used to come back as `{slots: [], booking: null}` — an outage
// dressed up as "nothing is booked", which let the calendar show a full camera
// as free and told customers their real booking did not exist. Every failure
// now carries its own status code so the UI can tell the two apart.
function fail(code: ErrorCode, requestId: string, detail?: string) {
  return NextResponse.json(
    { ok: false, error: { code, message: MESSAGES[code], retryable: code !== 'ACTION_NOT_ALLOWED' && code !== 'BAD_REQUEST', detail }, requestId },
    { status: STATUS[code] },
  )
}

function newRequestId() {
  return Math.random().toString(36).slice(2, 10)
}

async function callScript(init: RequestInit & { url: string }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    return await fetch(init.url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(request: NextRequest) {
  const requestId = newRequestId()
  if (!isConfigured) return fail('NOT_CONFIGURED', requestId)

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') ?? ''
  if (!GET_ACTIONS.has(action)) return fail('ACTION_NOT_ALLOWED', requestId, action)

  const url = new URL(SCRIPT_URL)
  searchParams.forEach((v, k) => url.searchParams.set(k, v))

  let res: Response
  try {
    res = await callScript({ url: url.toString(), cache: 'no-store' })
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'AbortError'
    return fail(timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', requestId)
  }

  const text = await res.text()
  try {
    return NextResponse.json(JSON.parse(text))
  } catch {
    // Apps Script hands back an HTML interstitial when it is unhappy. Never
    // relay that to the browser — it is neither JSON nor safe to render.
    return fail('UPSTREAM_BAD_RESPONSE', requestId)
  }
}

export async function POST(request: NextRequest) {
  const requestId = newRequestId()
  if (!isConfigured) return fail('NOT_CONFIGURED', requestId)

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return fail('BAD_REQUEST', requestId)
  }

  const action = typeof body.action === 'string' ? body.action : ''
  if (!POST_ACTIONS.has(action)) return fail('ACTION_NOT_ALLOWED', requestId, action)

  // Images are compressed client-side to ~200KB before sending
  // Apps Script: POST /exec runs the script, then 302 → GET result URL
  // Default fetch follows redirect (POST→GET), which is correct here
  let res: Response
  try {
    res = await callScript({
      url: SCRIPT_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'AbortError'
    // A timeout is NOT proof the booking failed — Apps Script may well have
    // written the row already. The client must re-check with its request key
    // rather than assume nothing happened.
    return fail(timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', requestId)
  }

  const text = await res.text()
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return fail('UPSTREAM_BAD_RESPONSE', requestId)
  }

  // Apps Script answers a POST with a 302 to a result URL, and fetch follows it
  // as a GET. Now and then that follow-up lands on doGet with no parameters and
  // comes back as "Unknown action: undefined" — the work already happened, only
  // the reply was lost. Reporting it as a definite failure is how a customer
  // ended up with an error on screen and a real booking on the sheet, so flag it
  // as a retryable transport fault: createBooking replays its idempotency key
  // and gets the original booking back instead of making a second one.
  const asRecord = payload as { error?: unknown }
  if (typeof asRecord?.error === 'string' && asRecord.error.indexOf('Unknown action: undefined') === 0) {
    return fail('UPSTREAM_BAD_RESPONSE', requestId, 'redirect lost the request body')
  }

  return NextResponse.json(payload)
}
