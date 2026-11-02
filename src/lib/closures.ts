// Shop closures: blocks that hold no camera but forbid handovers while the shop
// is shut. A rental that started earlier may run across one.
//   closed   — no pickup and no return inside [start, end)
//   nopickup — no pickup inside; returns are fine
// MUST match closureInside_() / handoverError() in apps-script/Code.gs, which
// re-checks every booking on submit.
import { RentalArea } from '@/types'
import { PROVINCIAL_SHIP_LEAD_DAYS } from '@/lib/cameras'

export type BlockMode = 'hold' | 'closed' | 'nopickup'
export type ClosureMode = Exclude<BlockMode, 'hold'>

export interface Closure {
  cameraId: string // a model id, or 'ALL'
  start: number // ms
  end: number // ms, exclusive
  mode: ClosureMode
}

const DAY = 24 * 60 * 60 * 1000

// Empty / unknown (older rows) = 'hold', today's behaviour
export function normaliseMode(m: unknown): BlockMode {
  return m === 'closed' || m === 'nopickup' ? m : 'hold'
}

// Half-open: reopening exactly at `end` is allowed
export function inside(t: number, c: Closure): boolean {
  return t >= c.start && t < c.end
}

// '' when the handover times are fine, else the Thai reason. Provincial: the
// shop must be able to post the parcel on some day of [pickup − 3d, pickup − 1d);
// returns come back by parcel, so they aren't checked.
export function handoverError(
  closures: Closure[],
  cameraId: string,
  area: RentalArea,
  pickupMs: number,
  returnMs: number,
): string {
  const mine = closures.filter((c) => c.cameraId === 'ALL' || c.cameraId === cameraId)
  if (!mine.length) return ''
  if (area === 'provincial') {
    return shipOutBlocked(mine, pickupMs) ? 'ร้านปิดช่วงส่งพัสดุ กรุณาเลือกวันอื่น' : ''
  }
  if (mine.some((c) => inside(pickupMs, c))) return 'ร้านปิดช่วงเวลารับ กรุณาเลือกเวลาอื่น'
  if (mine.some((c) => c.mode === 'closed' && inside(returnMs, c))) return 'ร้านปิดช่วงเวลาคืน กรุณาเลือกเวลาอื่น'
  return ''
}

// True when closures (together) cover the whole ship-out window
function shipOutBlocked(mine: Closure[], pickupMs: number): boolean {
  const ws = pickupMs - PROVINCIAL_SHIP_LEAD_DAYS * DAY
  const we = pickupMs - DAY
  const list = mine.filter((c) => c.end > ws && c.start < we).sort((a, b) => a.start - b.start)
  let cur = ws
  for (const c of list) {
    if (c.start > cur) break
    if (c.end > cur) cur = c.end
  }
  return cur >= we
}

// Thai labels for the admin
export const MODE_LABEL: Record<BlockMode, string> = {
  hold: 'กันเครื่อง',
  closed: 'ร้านหยุดรับ-ส่ง · เช่าคร่อมได้',
  nopickup: 'รับคืนได้ ห้ามรับใหม่',
}
