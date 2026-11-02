// Customer-facing queue for the homepage "เช็กคิวว่าง". Built on the public
// summary (getPublicAvailability): per model, how many units are in use over
// time — no booking ids, no names. The candidate windows below are the same
// ones the booking page and the server check (local: +1h battery charge after
// return; provincial: 3 days either side for shipping), so "ว่าง" here means
// the booking page will accept it. The server re-checks on submit anyway.
import { CameraId, RentalArea } from '@/types'
import { BATTERY_CHARGE_BUFFER_MS, PROVINCIAL_SHIP_LEAD_DAYS } from '@/lib/cameras'
import { Closure, handoverError } from '@/lib/closures'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const SHIP_MS = PROVINCIAL_SHIP_LEAD_DAYS * DAY
const CACHE_KEY = 'miwvie_public_queue_v2'
const CACHE_MS = 2 * 60 * 1000

export interface PublicQueue {
  from: number
  to: number
  generatedAt: number
  cameras: Record<string, { units: number; steps: [number, number][] }>
  closed: [number, number][]
  // Every shop closure (model or 'ALL'), rounded outward to 30 min. Holds no
  // unit; forbids pickups (and returns, for 'closed') inside. Absent from
  // older servers.
  closures?: { cam: string; s: number; e: number; mode: 'closed' | 'nopickup' }[]
}

// q.closures in the shape handoverError() takes, built once per queue object
const closureCache = new WeakMap<PublicQueue, Closure[]>()
function closuresOf(q: PublicQueue): Closure[] {
  let list = closureCache.get(q)
  if (!list) {
    list = (q.closures ?? []).map((c) => ({ cameraId: c.cam, start: c.s, end: c.e, mode: c.mode }))
    closureCache.set(q, list)
  }
  return list
}

export async function fetchPublicQueue(): Promise<PublicQueue> {
  try {
    const hit = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null')
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as PublicQueue
  } catch { /* storage blocked — just fetch */ }

  let last: unknown
  for (let i = 0; i < 3; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1200 * i))
    try {
      // 'default' lets the CDN copy answer instead of Apps Script (2-20 s cold)
      const res = await fetch('/api/sheets?action=getPublicAvailability', { cache: 'default' })
      const data = await res.json()
      if (!res.ok || data?.error || !data?.cameras) throw new Error('bad queue')
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })) } catch { /* ignore */ }
      return data as PublicQueue
    } catch (e) {
      last = e
    }
  }
  throw last
}

// Most units in use at any moment inside [from, to)
function peak(steps: [number, number][], from: number, to: number): number {
  let max = 0
  for (let i = 0; i < steps.length; i++) {
    const [t, level] = steps[i]
    const next = i + 1 < steps.length ? steps[i + 1][0] : Infinity
    if (next <= from) continue
    if (t >= to) break
    max = Math.max(max, level)
  }
  return max
}

// The span a new rental would hold the unit for
export function candidateWindow(area: RentalArea, start: number, end: number): [number, number] {
  return area === 'provincial'
    ? [start - SHIP_MS, end + SHIP_MS]
    : [start, end + BATTERY_CHARGE_BUFFER_MS]
}

export type Fit = 'free' | 'full' | 'unknown'

// Can one more rental of this model fit [start, end)?
export function fits(q: PublicQueue, cameraId: CameraId, area: RentalArea, start: number, end: number): Fit {
  const cam = q.cameras[cameraId]
  if (!cam) return 'unknown'
  const [s, e] = candidateWindow(area, start, end)
  if (e > q.to) return 'unknown' // beyond what the summary covers
  if (handoverError(closuresOf(q), cameraId, area, start, end)) return 'full'
  return peak(cam.steps, Math.max(s, q.from), e) < cam.units ? 'free' : 'full'
}

// Earliest start (on the hour, 10:00–22:00 Bangkok for local; midnight for
// provincial) after `after` where a rental of `hours` fits. null = none in range.
export function nextFree(q: PublicQueue, cameraId: CameraId, area: RentalArea, after: number, hours: number): number | null {
  const len = hours * HOUR
  if (area === 'provincial') {
    for (let t = startOfBkkDay(after) + DAY; t < q.to; t += DAY) {
      if (fits(q, cameraId, area, t, t + len) === 'free') return t
    }
    return null
  }
  for (let t = Math.ceil(after / HOUR) * HOUR; t < q.to; t += HOUR) {
    const h = bkkHour(t)
    if (h < 10 || h > 22) continue
    if (fits(q, cameraId, area, t, t + len) === 'free') return t
  }
  return null
}

export type DayStatus = 'free' | 'partial' | 'full' | 'closed'

// One colour per calendar day (local rentals): free = some model is free the
// whole day; partial = some model has at least a 6-hour rental window within
// 10:00–22:00 pickups; full = neither; closed = the shop is shut that day.
export function dayStatus(q: PublicQueue, dayStart: number, cameraIds: CameraId[]): DayStatus {
  const open = dayStart + 10 * HOUR
  const close = dayStart + 22 * HOUR
  if (q.closed.some(([s, e]) => s <= open && e >= close)) return 'closed'
  // A whole-shop closure of either mode over opening hours: no pickups that day
  if (closuresOf(q).some((c) => c.cameraId === 'ALL' && c.start <= open && c.end >= close)) return 'closed'
  let partial = false
  for (const id of cameraIds) {
    const cam = q.cameras[id]
    if (!cam) continue
    if (peak(cam.steps, dayStart, Math.min(dayStart + DAY, q.to)) < cam.units) return 'free'
    if (!partial) {
      for (let t = open; t <= close - 6 * HOUR; t += HOUR) {
        if (fits(q, id, 'local', t, t + 6 * HOUR) === 'free') { partial = true; break }
      }
    }
  }
  return partial ? 'partial' : 'full'
}

export function bkkHour(t: number): number {
  return new Date(t + 7 * HOUR).getUTCHours()
}
export function startOfBkkDay(t: number): number {
  return Math.floor((t + 7 * HOUR) / DAY) * DAY - 7 * HOUR
}

// ---------- fast queries (built once per fetch) ----------
// Per model, the stretches where at least one unit is free, merged and
// sorted. A rental fits iff its whole window lies inside one stretch, so each
// check is a binary search instead of a walk over every step.
export type FreeMap = Record<string, [number, number][]>

export function buildFree(q: PublicQueue): FreeMap {
  const out: FreeMap = {}
  for (const [id, cam] of Object.entries(q.cameras)) {
    const list: [number, number][] = []
    cam.steps.forEach(([t, level], i) => {
      const end = i + 1 < cam.steps.length ? cam.steps[i + 1][0] : q.to
      if (level >= cam.units || end <= t) return
      const last = list[list.length - 1]
      if (last && last[1] === t) last[1] = end
      else list.push([t, end])
    })
    out[id] = list
  }
  return out
}

export function fitsFast(q: PublicQueue, free: FreeMap, cameraId: string, area: RentalArea, start: number, end: number): Fit {
  const list = free[cameraId]
  if (!list) return 'unknown'
  let [s, e] = candidateWindow(area, start, end)
  if (e > q.to) return 'unknown'
  if (handoverError(closuresOf(q), cameraId, area, start, end)) return 'full'
  s = Math.max(s, q.from)
  let lo = 0
  let hi = list.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (list[mid][0] <= s) lo = mid + 1
    else hi = mid - 1
  }
  const iv = list[hi]
  return iv && iv[0] <= s && iv[1] >= e ? 'free' : 'full'
}
