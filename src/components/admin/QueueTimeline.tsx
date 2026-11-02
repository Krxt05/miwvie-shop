'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, Plus, Trash2, X } from 'lucide-react'
import { Booking, CameraId } from '@/types'
import { BlockedSlot } from '@/lib/api'
import { CAMERAS } from '@/lib/cameras'
import { STATUS_LABEL, bangkokDay, dayLabel, dayTimeLabel, shiftDay } from '@/lib/admin'
import { blockWeight, bookingWindow } from '@/lib/availability'
import { baht } from '@/lib/revenue'
import { MODE_LABEL } from '@/lib/closures'

// Queue chart: one row per camera model, one lane per unit, one bar per
// booking or block. Lanes are packed in start order, so a booking keeps its
// lane; more lanes than units means the model is overbooked.

const DAY_MS = 24 * 60 * 60 * 1000
const LANE_PX = 26
const MONTH_DAY_PX = 32
const LABEL_PX = 84

type Kind = 'booking' | 'block'
interface Item {
  key: string
  kind: Kind
  start: number
  end: number
  coreStart: number
  coreEnd: number
  label: string
  booking?: Booking
  block?: BlockedSlot
}
// `conflict`: no unit was left for it — more in use than the model has. It
// goes to an extra red lane below the real ones instead of being hidden.
interface Placed extends Item { lane: number; conflict?: boolean }
// `closures`: bands across the whole row, not in a lane — "ทุกรุ่น" hold
// blocks (as before) and every 'closed' / 'nopickup' block, which hold no unit
// (cameras may stay out with customers across them).
interface ModelRow { id: CameraId; name: string; units: number; placed: Placed[]; closures: Item[] }

type Selection =
  | { kind: 'item'; key: string; cameraId: CameraId }
  | { kind: 'empty'; cameraId: CameraId; day: string }

const bkkMidnight = (day: string) => new Date(`${day}T00:00:00+07:00`).getTime()
const WEEKDAY = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'narrow' })
const MONTH_LABEL = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', month: 'long', year: 'numeric' })

function buildRows(bookings: Booking[], blocks: BlockedSlot[]): ModelRow[] {
  return CAMERAS.map((c) => {
    const items: (Item & { weight: number })[] = []
    for (const b of bookings) {
      if (b.cameraId !== c.id || b.bookingStatus === 'cancelled') continue
      const w = bookingWindow(b)
      if (!w) continue // unparseable dates: skip rather than break the tab
      const first = String(b.customerName || '').trim().split(/\s+/)[0] || b.bookingId
      items.push({ key: b.bookingId, kind: 'booking', ...w, label: first, booking: b, weight: 1 })
    }
    const closures: Item[] = []
    for (const bl of blocks) {
      if (bl.cameraId !== c.id && bl.cameraId !== 'ALL') continue
      const s = new Date(bl.startDatetime).getTime()
      const e = new Date(bl.endDatetime).getTime()
      if (isNaN(s) || isNaN(e) || e <= s) continue
      const item = {
        key: `${bl.id}@${c.id}`, kind: 'block' as const, start: s, end: e, coreStart: s, coreEnd: e,
        label: bl.reason || (bl.mode === 'closed' ? 'ร้านหยุด' : bl.mode === 'nopickup' ? 'ห้ามรับใหม่' : bl.cameraId === 'ALL' ? 'ปิดร้าน' : 'บล็อก'), block: bl,
      }
      if (bl.cameraId === 'ALL' || bl.mode !== 'hold') closures.push(item)
      else items.push({ ...item, weight: blockWeight(bl, c.quantity) })
    }

    // One pass over bookings AND blocks in start order, each taking the lowest
    // free lanes (optimal interval partitioning: if this runs out of lanes,
    // more units really are in use than the model has).
    items.sort((a, b) => a.start - b.start || a.key.localeCompare(b.key))
    const laneEnd: number[] = []
    const placed: Placed[] = []
    const freeLane = (from: number, at: number) => {
      let lane = from
      while (laneEnd[lane] !== undefined && laneEnd[lane] > at) lane++
      return lane
    }
    for (const it of items) {
      for (let n = 0; n < it.weight; n++) {
        const lane = freeLane(0, it.start)
        laneEnd[lane] = it.end
        placed.push({ ...it, lane, conflict: lane >= c.quantity })
      }
    }
    return { id: c.id, name: c.shortName, units: c.quantity, placed, closures }
  })
}

interface Props {
  bookings: Booking[]
  blocks: BlockedSlot[]
  onOpenBooking: (bookingId: string) => void
  onBlockDay: (cameraId: CameraId, day: string) => void
  onDeleteBlock: (block: BlockedSlot) => void
}

export default function QueueTimeline({ bookings, blocks, onOpenBooking, onBlockDay, onDeleteBlock }: Props) {
  const today = bangkokDay(Date.now())
  const [mode, setMode] = useState<'14' | 'month'>('14')
  const [anchor, setAnchor] = useState(today) // first day (14-day view) or any day of the month
  const [sel, setSel] = useState<Selection | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => buildRows(bookings, blocks), [bookings, blocks])

  // Visible range [rangeStart, rangeEnd)
  const { rangeStart, dayKeys } = useMemo(() => {
    if (mode === '14') {
      return { rangeStart: bkkMidnight(anchor), dayKeys: Array.from({ length: 14 }, (_, i) => shiftDay(anchor, i)) }
    }
    const first = `${anchor.slice(0, 7)}-01`
    const keys: string[] = []
    for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = shiftDay(d, 1)) keys.push(d)
    return { rangeStart: bkkMidnight(first), dayKeys: keys }
  }, [mode, anchor])
  const rangeEnd = rangeStart + dayKeys.length * DAY_MS
  const span = rangeEnd - rangeStart
  const pct = (t: number) => ((Math.min(Math.max(t, rangeStart), rangeEnd) - rangeStart) / span) * 100
  const now = Date.now()
  const nowVisible = now >= rangeStart && now < rangeEnd

  // Month view scrolls sideways; start it at today
  useEffect(() => {
    if (mode !== 'month' || !scroller.current) return
    const idx = dayKeys.indexOf(today)
    scroller.current.scrollLeft = idx > 0 ? Math.max(0, idx * MONTH_DAY_PX - MONTH_DAY_PX * 2) : 0
  }, [mode, dayKeys, today])

  const go = (dir: number) => {
    setSel(null)
    if (mode === '14') setAnchor(shiftDay(anchor, dir * 14))
    else {
      const [y, m] = anchor.split('-').map(Number)
      const d = new Date(Date.UTC(y, m - 1 + dir, 1))
      setAnchor(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`)
    }
  }
  const atToday = mode === '14' ? anchor === today : anchor.slice(0, 7) === today.slice(0, 7)
  const rangeLabel = mode === '14'
    ? `${dayLabel(rangeStart)} – ${dayLabel(rangeEnd - 1)}`
    : MONTH_LABEL.format(new Date(rangeStart + 15 * DAY_MS))

  // Units free right now / on a given day (lanes within stock that are busy)
  const freeOn = (row: ModelRow, from: number, to: number) => {
    const busy = new Set<number>()
    for (const p of row.placed) if (p.start < to && p.end > from && p.lane < row.units) busy.add(p.lane)
    return Math.max(0, row.units - busy.size)
  }

  const selRow = sel ? rows.find((r) => r.id === sel.cameraId) : undefined
  const selectedItem: Item | undefined = sel?.kind === 'item'
    ? selRow?.placed.find((p) => p.key === sel.key) ?? selRow?.closures.find((p) => p.key === sel.key)
    : undefined
  // Everything holding this model while the tapped item runs, one per unit
  const sameTime = selectedItem && selRow
    ? Array.from(new Map(selRow.placed.filter((p) => p.start < selectedItem.end && p.end > selectedItem.start).map((p) => [p.key, p])).values())
    : []
  const peakDuring = (() => {
    if (!selectedItem || !selRow) return 0
    const ev: [number, number][] = []
    for (const p of selRow.placed) {
      if (p.start < selectedItem.end && p.end > selectedItem.start) {
        ev.push([Math.max(p.start, selectedItem.start), 1], [Math.min(p.end, selectedItem.end), -1])
      }
    }
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let l = 0, m = 0
    for (const [, d] of ev) { l += d; m = Math.max(m, l) }
    return m
  })()

  function tapTrack(e: React.MouseEvent<HTMLDivElement>, cameraId: CameraId) {
    const rect = e.currentTarget.getBoundingClientRect()
    const idx = Math.min(dayKeys.length - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * dayKeys.length)))
    const day = dayKeys[idx]
    setSel((cur) => (cur?.kind === 'empty' && cur.cameraId === cameraId && cur.day === day ? null : { kind: 'empty', cameraId, day }))
  }

  const trackWidth = mode === 'month' ? dayKeys.length * MONTH_DAY_PX : undefined

  return (
    <section className="glass rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-sm">ตารางคิว</h2>
        <div className="grid grid-cols-2 bg-pink-50 rounded-lg p-0.5 text-xs" role="tablist" aria-label="ช่วงที่แสดง">
          {(['14', 'month'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => { setMode(m); setAnchor(today); setSel(null) }}
              className={`min-h-9 px-3 rounded-md font-medium ${mode === m ? 'bg-white text-ink shadow-sm' : 'text-gray-600'}`}
            >
              {m === '14' ? '14 วัน' : 'ทั้งเดือน'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => go(-1)} className="w-11 h-11 flex items-center justify-center rounded-full text-pink" aria-label="ก่อนหน้า">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-ink tabular-nums">{rangeLabel}</p>
          {!atToday && (
            <button onClick={() => { setAnchor(today); setSel(null) }} className="text-xs text-pink font-medium">กลับวันนี้</button>
          )}
        </div>
        <button onClick={() => go(1)} className="w-11 h-11 flex items-center justify-center rounded-full text-pink" aria-label="ถัดไป">
          <ChevronRight size={18} />
        </button>
      </div>

      <div ref={scroller} className="overflow-x-auto overscroll-x-contain rounded-lg">
        <div style={{ width: trackWidth ? LABEL_PX + trackWidth : undefined }}>
          {/* Day header */}
          <div className="flex">
            <div className="shrink-0 sticky left-0 z-20 bg-white" style={{ width: LABEL_PX }} />
            <div className="relative flex flex-1" style={{ width: trackWidth }}>
              {dayKeys.map((d) => {
                const isToday = d === today
                return (
                  <div key={d} className={`flex-1 text-center leading-tight py-1 rounded-md ${isToday ? 'bg-brass-light/40 text-ink font-bold' : 'text-gray-600'}`}>
                    <div className="text-[10px]">{WEEKDAY.format(new Date(bkkMidnight(d) + 12 * 3600_000))}</div>
                    <div className="text-[11px] tabular-nums">{Number(d.slice(8, 10))}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {rows.map((row) => {
            const visible = row.placed.filter((p) => p.end > rangeStart && p.start < rangeEnd)
            // Only lanes actually used in this range — past overflow doesn't make the row tall
            const lanes = Math.max(row.units, ...visible.map((p) => p.lane + 1))
            const overbooked = visible.some((p) => p.conflict)
            const closures = row.closures.filter((p) => p.end > rangeStart && p.start < rangeEnd)
            const freeNow = freeOn(row, now, now + 60_000)
            return (
              <div key={row.id} className="flex border-t border-cream">
                <div className="shrink-0 sticky left-0 z-20 bg-white pr-2 py-1.5 flex flex-col justify-center" style={{ width: LABEL_PX }}>
                  <p className="text-xs font-semibold text-ink truncate flex items-center gap-1">
                    {row.name}
                    {overbooked && <AlertTriangle size={12} className="text-red-600 shrink-0" aria-label="จองเกินจำนวนเครื่อง" />}
                  </p>
                  <p className={`text-[11px] tabular-nums ${freeNow > 0 ? 'text-emerald-700' : 'text-gray-600'}`}>
                    ว่างตอนนี้ {freeNow}/{row.units}
                  </p>
                </div>
                <div
                  className="relative flex-1 cursor-pointer"
                  style={{ width: trackWidth, height: lanes * LANE_PX + 6 }}
                  onClick={(e) => tapTrack(e, row.id)}
                  role="presentation"
                >
                  {/* day grid */}
                  <div className="absolute inset-0 flex pointer-events-none" aria-hidden>
                    {dayKeys.map((d) => {
                      const picked = sel?.kind === 'empty' && sel.cameraId === row.id && sel.day === d
                      return <div key={d} className={`flex-1 border-l border-cream ${picked ? 'bg-pink-50' : ''}`} />
                    })}
                  </div>
                  {/* extra lanes = more in use than units: tint them red */}
                  {lanes > row.units && (
                    <div className="absolute inset-x-0 bottom-0 bg-red-50 border-t border-red-200 pointer-events-none" style={{ top: 3 + row.units * LANE_PX - 2 }} aria-hidden />
                  )}
                  {closures.map((c) => {
                    const m = c.block?.mode ?? 'hold'
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSel({ kind: 'item', key: c.key, cameraId: row.id }) }}
                        aria-label={`${m === 'hold' ? 'ปิดร้าน' : MODE_LABEL[m]} ${dayTimeLabel(c.start)} ถึง ${dayTimeLabel(c.end)}`}
                        className={`absolute top-0 bottom-0 z-[2] overflow-hidden ${m === 'hold' ? 'opacity-70' : m === 'nopickup' ? 'border-2 border-dashed border-gray-500 rounded-md' : 'opacity-80'}`}
                        style={{ left: `${pct(c.start)}%`, width: `${pct(c.end) - pct(c.start)}%`, minWidth: 4, ...(m === 'hold' ? STRIPES : m === 'closed' ? CLOSED_STRIPES : {}) }}
                      >
                        {m !== 'hold' && (
                          <span className="block px-1 text-[10px] leading-4 font-medium text-gray-800 truncate text-left">{m === 'closed' ? '🚪' : '↩️'} {c.label}</span>
                        )}
                      </button>
                    )
                  })}
                  {nowVisible && (
                    <div className="absolute top-0 bottom-0 w-0.5 bg-brass z-10 pointer-events-none" style={{ left: `${pct(now)}%` }} aria-hidden />
                  )}
                  {visible.map((p) => (
                    <Bar
                      key={`${p.key}-${p.lane}`}
                      p={p}
                      left={pct(p.start)}
                      width={pct(p.end) - pct(p.start)}
                      coreLeft={p.end > p.start ? ((Math.max(p.coreStart, rangeStart, p.start) - Math.max(p.start, rangeStart)) / (Math.min(p.end, rangeEnd) - Math.max(p.start, rangeStart))) * 100 : 0}
                      coreWidth={p.end > p.start ? ((Math.min(p.coreEnd, rangeEnd) - Math.max(p.coreStart, rangeStart)) / (Math.min(p.end, rangeEnd) - Math.max(p.start, rangeStart))) * 100 : 100}
                      over={Boolean(p.conflict)}
                      selected={sel?.kind === 'item' && sel.key === p.key}
                      onSelect={() => setSel((cur) => (cur?.kind === 'item' && cur.key === p.key ? null : { kind: 'item', key: p.key, cameraId: row.id }))}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-pink-600" />จอง</span>
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-pink-200" />เผื่อส่งพัสดุ/ชาร์จแบต</span>
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm" style={STRIPES} />บล็อก</span>
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm" style={CLOSED_STRIPES} />ร้านหยุด (เช่าคร่อมได้)</span>
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm border-2 border-dashed border-gray-500" />ห้ามรับใหม่</span>
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-gray-300" />คืนแล้ว</span>
        <span className="flex items-center gap-1"><i className="w-0.5 h-3 bg-brass" />ตอนนี้</span>
        <span className="w-full">แต่ละเลน = 1 ช่องว่างของรุ่นนั้น ไม่ใช่กล้องตัวไหนโดยเฉพาะ · เลนแดง = ใช้เกินจำนวนเครื่อง</span>
      </div>

      {/* Detail for the tapped bar or empty day */}
      {sel && (
        <div className="rounded-xl bg-cream/70 p-3 text-sm relative">
          <button onClick={() => setSel(null)} className="absolute right-1 top-1 w-9 h-9 flex items-center justify-center text-gray-600" aria-label="ปิด">
            <X size={16} />
          </button>
          {sel.kind === 'item' && selectedItem?.booking && (() => {
            const b = selectedItem.booking!
            const prov = b.rentalArea === 'provincial'
            return (
              <div className="space-y-1 pr-8">
                <p className="font-semibold text-ink">{b.customerName} <span className="text-xs font-normal text-gray-600">· {cameraLabel(b.cameraId)}</span></p>
                <p className="text-xs text-gray-700 tabular-nums">
                  {prov ? `ต่างจังหวัด · ถึงมือ ${dayLabel(b.pickupDatetime)} → คืน ${dayLabel(b.returnDatetime)}` : `${dayTimeLabel(b.pickupDatetime)} → ${dayTimeLabel(b.returnDatetime)}`}
                </p>
                <p className="text-xs text-gray-700">{STATUS_LABEL[b.bookingStatus]} · {baht(Number(b.totalAmount) || 0)}</p>
                <button onClick={() => onOpenBooking(b.bookingId)} className="mt-1 min-h-11 px-4 rounded-xl bg-pink text-white text-sm font-medium inline-flex items-center gap-1.5">
                  <ExternalLink size={15} /> เปิดใบจอง
                </button>
              </div>
            )
          })()}
          {sel.kind === 'item' && selectedItem?.block && (() => {
            const bl = selectedItem.block!
            return (
              <div className="space-y-1 pr-8">
                <p className="font-semibold text-ink">บล็อก · {bl.cameraId === 'ALL' ? 'ทุกรุ่น' : cameraLabel(bl.cameraId)}{bl.mode === 'hold' && bl.cameraId !== 'ALL' && bl.quantity > 1 ? ` (${bl.quantity} ตัว)` : ''}</p>
                <p className="text-xs text-gray-700 tabular-nums">{dayTimeLabel(bl.startDatetime)} → {dayTimeLabel(bl.endDatetime)}</p>
                <p className="text-xs text-gray-700">ประเภท: {MODE_LABEL[bl.mode]}{bl.mode === 'closed' ? ' — ห้ามรับและห้ามคืนในช่วงนี้' : bl.mode === 'nopickup' ? ' — คืนได้ แต่ห้ามรับเครื่องใหม่' : ''}</p>
                {bl.reason && <p className="text-xs text-gray-700">{bl.reason}</p>}
                <button onClick={() => onDeleteBlock(bl)} className="mt-1 min-h-11 px-4 rounded-xl border border-red-200 text-red-700 text-sm font-medium inline-flex items-center gap-1.5">
                  <Trash2 size={15} /> ลบบล็อกนี้
                </button>
              </div>
            )
          })()}
          {sel.kind === 'item' && selRow && sameTime.length > 0 && (
            <div className={`mt-3 pt-2 border-t text-xs ${peakDuring > selRow.units ? 'border-red-200' : 'border-pink-100'}`}>
              <p className={`font-semibold ${peakDuring > selRow.units ? 'text-red-700' : 'text-gray-700'}`}>
                {selRow.name} ช่วงเดียวกัน · ใช้สูงสุด {peakDuring}/{selRow.units}
                {peakDuring > selRow.units && ` — เกิน ${peakDuring - selRow.units}`}
              </p>
              <ul className="mt-1 space-y-0.5 text-gray-700">
                {sameTime.map((p) => (
                  <li key={p.key} className={p.conflict ? 'text-red-700' : ''}>
                    {p.kind === 'block' ? `บล็อก${p.block?.reason ? ` (${p.block.reason})` : ''}` : `${p.booking?.customerName} · ${p.booking?.bookingId}`}
                    {' · '}{dayTimeLabel(p.coreStart)} – {dayTimeLabel(p.coreEnd)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sel.kind === 'empty' && (() => {
            const row = rows.find((r) => r.id === sel.cameraId)!
            const from = bkkMidnight(sel.day)
            const free = freeOn(row, from, from + DAY_MS)
            return (
              <div className="space-y-1 pr-8">
                <p className="font-semibold text-ink">{row.name} · {WEEKDAY.format(new Date(from + 12 * 3600_000))} {dayLabel(from)}</p>
                <p className={`text-xs ${free > 0 ? 'text-emerald-700' : 'text-gray-700'}`}>
                  {free > 0 ? `ว่างทั้งวัน ${free}/${row.units} ตัว` : 'วันนี้มีคิวเต็มบางช่วง — แตะแถบเพื่อดูรายละเอียด'}
                </p>
                <button onClick={() => onBlockDay(row.id, sel.day)} className="mt-1 min-h-11 px-4 rounded-xl border border-pink-200 text-pink text-sm font-medium inline-flex items-center gap-1.5">
                  <Plus size={15} /> บล็อก {row.name} วันนี้
                </button>
              </div>
            )
          })()}
        </div>
      )}
    </section>
  )
}

const STRIPES: React.CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, #d1d5db 0 4px, #f3f4f6 4px 8px)',
}
// Shop closed (holds no unit): warmer, wider stripes so it reads apart from a hold
const CLOSED_STRIPES: React.CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(45deg, rgba(180,140,60,0.35) 0 6px, rgba(255,250,235,0.5) 6px 12px)',
}

function cameraLabel(id: string): string {
  return CAMERAS.find((c) => c.id === id)?.shortName ?? id
}

function Bar({ p, left, width, coreLeft, coreWidth, over, selected, onSelect }: {
  p: Placed
  left: number
  width: number
  coreLeft: number
  coreWidth: number
  over: boolean
  selected: boolean
  onSelect: () => void
}) {
  const returned = p.booking?.bookingStatus === 'returned'
  const label = over ? `ชน · ${p.label}` : p.label
  const isBlock = p.kind === 'block'
  const core = isBlock ? '' : returned ? 'bg-gray-300 text-ink' : 'bg-pink-600 text-white'
  const outer = isBlock ? '' : returned ? 'bg-gray-200' : 'bg-pink-200'
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect() }}
      aria-label={`${p.kind === 'block' ? 'บล็อก' : p.booking?.customerName ?? ''} ${dayTimeLabel(p.coreStart)} ถึง ${dayTimeLabel(p.coreEnd)}`}
      className={`absolute rounded-md overflow-hidden text-left ${outer} z-[5] ${selected ? 'ring-2 ring-ink z-[8]' : ''} ${over ? 'ring-2 ring-red-600' : ''}`}
      style={{
        left: `${left}%`,
        width: `${width}%`,
        minWidth: 6,
        top: 3 + p.lane * LANE_PX,
        height: LANE_PX - 4,
        ...(isBlock ? STRIPES : {}),
      }}
    >
      {isBlock ? (
        // A block laid over bookings stays unlabelled so the booking name reads
        <span className="relative px-1.5 text-[11px] leading-[22px] font-medium truncate block text-gray-700">{label}</span>
      ) : (
        // The name sits on the rental itself, not on the pale ship/charge margin
        <span
          className={`absolute top-0 bottom-0 rounded-[5px] overflow-hidden ${core}`}
          style={{ left: `${Math.max(0, coreLeft)}%`, width: `${Math.max(0, Math.min(100, coreWidth))}%` }}
        >
          <span className="px-1.5 text-[11px] leading-[22px] font-medium truncate block">{label}</span>
        </span>
      )}
    </button>
  )
}
