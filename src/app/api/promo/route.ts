import { NextRequest, NextResponse } from 'next/server'
import { buildPromo, PromoSlot } from '@/lib/promo'
import { BookedSlot, CameraId } from '@/types'

const SCRIPT_URL = process.env.SCRIPT_URL ?? ''
const UPSTREAM_TIMEOUT_MS = 45_000

/**
 * The calendar only has to be fresh enough to say which cameras are free over a
 * multi-day window, so a few minutes of staleness costs nothing — and it spares
 * the shop's phone a 30-second wait when the /promo page is opened twice, plus
 * Apps Script the repeat work.
 */
const CACHE_TTL_MS = 5 * 60 * 1000
let cache: { at: number; key: string; value: Partial<Record<CameraId, BookedSlot[]>> } | null = null

/**
 * The promo caption for a slot: what the shop should paste into its Facebook
 * groups this morning or this evening. Built fresh each call from the live
 * calendar and the current price list, so the post never advertises a camera
 * that is already out or a price that has moved.
 *
 * Deliberately unauthenticated — everything it returns is advertising copy plus
 * which cameras are free, and the booking calendar already shows the latter.
 * The Apps Script cron and the shop's own phone both fetch it the same way.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const slot: PromoSlot = searchParams.get('slot') === 'evening' ? 'evening' : 'morning'

  const now = new Date()
  const availability = await loadAvailability(now)
  const availabilityKnown = Object.keys(availability).length > 0

  const promo = buildPromo({ slot, availability, availabilityKnown, now })
  return NextResponse.json(
    { ok: true, slot, ...promo },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * Pulls the months the advertised window can touch. A window that starts late in
 * a month runs into the next one, and a camera booked on the far side of that
 * boundary must still count as taken.
 */
async function loadAvailability(now: Date): Promise<Partial<Record<CameraId, BookedSlot[]>>> {
  if (!SCRIPT_URL || SCRIPT_URL.includes('PLACEHOLDER')) return {}

  const months = monthKeys(now)
  const key = months.join(',')
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) return cache.value

  // In parallel: two sequential reads of a backend that regularly takes fifteen
  // seconds is most of a minute before the page shows anything.
  const results = await Promise.all(months.map(fetchMonth))

  const merged: Partial<Record<CameraId, BookedSlot[]>> = {}
  for (const cameras of results) {
    for (const [id, slots] of Object.entries(cameras)) {
      const camera = id as CameraId
      const seen = new Set((merged[camera] ?? []).map((s) => s.bookingId))
      merged[camera] = [...(merged[camera] ?? []), ...slots.filter((s) => !seen.has(s.bookingId))]
    }
  }

  // Only cache a real answer, so an outage does not pin an empty calendar in
  // place for five minutes.
  if (Object.keys(merged).length > 0) cache = { at: Date.now(), key, value: merged }
  return merged
}

/**
 * Only the months the advertised window actually touches. The window is at most
 * four days long, so it reaches next month only near the end of this one —
 * fetching both regardless doubled the wait for no benefit on most days.
 */
function monthKeys(now: Date): string[] {
  const local = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const label = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
  // Widest case: up to 5 days until the advertised window starts, plus its 3-day
  // length, plus the 3-day provincial buffer the backend pads each side with.
  const end = new Date(start.getTime() + 11 * 86400000)

  const keys = [label(start)]
  if (label(end) !== keys[0]) keys.push(label(end))
  return keys
}

/**
 * Apps Script latency swings wildly and it sometimes answers with an HTML error
 * page, so give each month a couple of goes. If a month cannot be read the promo
 * still goes out, but without naming any camera: an unread calendar and an empty
 * one are indistinguishable, and advertising units that turn out to be booked is
 * worse than posting a shorter advert.
 */
async function fetchMonth(month: string): Promise<Record<string, BookedSlot[]>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1200))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
    try {
      const url = new URL(SCRIPT_URL)
      url.searchParams.set('action', 'getAllAvailability')
      url.searchParams.set('month', month)
      const res = await fetch(url.toString(), { cache: 'no-store', signal: controller.signal })
      const data = JSON.parse(await res.text())
      if (data?.cameras) return data.cameras as Record<string, BookedSlot[]>
    } catch {
      // fall through to the next attempt
    } finally {
      clearTimeout(timer)
    }
  }
  return {}
}
