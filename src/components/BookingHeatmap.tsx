'use client'
import { useMemo, useState } from 'react'
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  format,
} from 'date-fns'
import { th } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { CAMERAS } from '@/lib/cameras'
import { CameraId } from '@/types'

interface OccupancyRow {
  cameraId: CameraId
  start: string
  end: string
}

interface Props {
  rows: OccupancyRow[]
}

// The sheet stores dates as real Date cells (UTC ISO from the API); read the
// calendar day back out in the shop's own timezone so it lines up with what
// was typed into the date picker.
const bangkokKey = (value: string | Date): string => {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const bangkokTime = (date: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)

interface Tooltip {
  x: number
  y: number
  lines: string[]
}

interface HeatRow {
  key: string
  label: string
  busy: Set<string>
  starts: Map<string, string[]>
  ends: Map<string, string[]>
}

// Blue/orange — the most CVD-distinguishable pair, used here as an identity
// pair (pickup vs return event) rather than for magnitude.
const PICKUP_COLOR = '#2a78d6' // รับกล้อง (camera leaves the shop)
const RETURN_COLOR = '#eb6834' // คืนกล้อง (camera comes back)

// Cameras with more than one physical unit share a calendar, so a booking
// doesn't say which specific unit it's on. Greedily assign each booking to
// the first unit that's free (classic interval-partitioning), so the
// heatmap can show separate rows per unit instead of merging them.
function partitionByUnit(rows: OccupancyRow[], quantity: number): OccupancyRow[][] {
  if (quantity <= 1) return [rows]
  const sorted = [...rows].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  const slotEnds: number[] = Array(quantity).fill(-Infinity)
  const buckets: OccupancyRow[][] = Array.from({ length: quantity }, () => [])
  for (const r of sorted) {
    const start = new Date(r.start).getTime()
    const end = new Date(r.end).getTime()
    let slot = slotEnds.findIndex((t) => t <= start)
    if (slot === -1) {
      // shouldn't happen if capacity was enforced at booking time, but fall
      // back to the slot that frees up soonest rather than dropping data
      slot = slotEnds.indexOf(Math.min(...slotEnds))
    }
    buckets[slot].push(r)
    slotEnds[slot] = end
  }
  return buckets
}

export default function BookingHeatmap({ rows }: Props) {
  const [month, setMonth] = useState(new Date())
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)

  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd])
  const todayKey = bangkokKey(new Date())

  const heatRows = useMemo(() => {
    const result: HeatRow[] = []
    for (const cam of CAMERAS) {
      const camRows = rows.filter((r) => r.cameraId === cam.id)
      const buckets = partitionByUnit(camRows, cam.quantity)
      buckets.forEach((bucket, i) => {
        const busy = new Set<string>()
        const starts = new Map<string, string[]>()
        const ends = new Map<string, string[]>()
        for (const r of bucket) {
          if (!r.start || !r.end) continue
          const startDate = new Date(r.start)
          const endDate = new Date(r.end)
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue
          const startKey = bangkokKey(startDate)
          const endKey = bangkokKey(endDate)
          if (!starts.has(startKey)) starts.set(startKey, [])
          starts.get(startKey)!.push(bangkokTime(startDate))
          if (!ends.has(endKey)) ends.set(endKey, [])
          ends.get(endKey)!.push(bangkokTime(endDate))
          // walk day by day (bounded: rentals are short, never more than ~2 months)
          let cursor = startDate
          for (let j = 0; j < 60; j++) {
            const key = bangkokKey(cursor)
            busy.add(key)
            if (key >= endKey) break
            cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
          }
        }
        result.push({
          key: `${cam.id}-${i}`,
          label: cam.quantity > 1 ? `${cam.shortName} (${i + 1})` : cam.shortName,
          busy,
          starts,
          ends,
        })
      })
    }
    return result
  }, [rows])

  const showTooltip = (e: React.SyntheticEvent, lines: string[]) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltip({ x: rect.left + rect.width / 2, y: rect.top, lines })
  }
  const hideTooltip = () => setTooltip(null)

  return (
    <div className="glass rounded-2xl p-4 space-y-3 relative">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm">ภาพรวมความว่าง (ทุกรุ่น)</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setMonth(subMonths(month, 1))} className="p-2 -m-1 hover:bg-pink-50 rounded-full text-pink">
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-medium text-gray-500 w-24 text-center">{format(month, 'MMMM yyyy', { locale: th })}</span>
          <button onClick={() => setMonth(addMonths(month, 1))} className="p-2 -m-1 hover:bg-pink-50 rounded-full text-pink">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 sm:hidden">← เลื่อนดูซ้าย-ขวาเพื่อดูทั้งเดือน →</p>

      <div className="overflow-x-auto">
        <div style={{ minWidth: days.length * 24 + 104 }}>
          {/* day-of-month header */}
          <div className="flex">
            <div className="w-24 shrink-0" />
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className={`w-6 shrink-0 text-center text-[10px] ${bangkokKey(d) === todayKey ? 'text-pink font-bold' : 'text-gray-400'}`}
              >
                {format(d, 'd')}
              </div>
            ))}
          </div>

          {heatRows.map((hr) => (
            <div key={hr.key} className="flex items-center h-7">
              <div className="w-24 shrink-0 text-xs text-gray-600 font-medium truncate pr-1">
                {hr.label}
              </div>
              {days.map((d) => {
                const key = bangkokKey(d)
                const isToday = key === todayKey
                const isBusy = hr.busy.has(key)
                const startTimes = hr.starts.get(key)
                const endTimes = hr.ends.get(key)
                const isStart = !!startTimes
                const isEnd = !!endTimes

                let cellClass = 'w-6 h-6 shrink-0 border-t border-b border-white '
                let cellStyle: React.CSSProperties | undefined
                if (isStart && isEnd) {
                  // same day: one booking returns and another (or the same) picks up — split the cell
                  cellClass += 'rounded-md '
                  cellStyle = { background: `linear-gradient(to right, ${RETURN_COLOR} 50%, ${PICKUP_COLOR} 50%)` }
                } else if (isStart) {
                  cellClass += 'rounded-l-md '
                  cellStyle = { background: PICKUP_COLOR }
                } else if (isEnd) {
                  cellClass += 'rounded-r-md '
                  cellStyle = { background: RETURN_COLOR }
                } else if (isBusy) {
                  cellClass += 'bg-red-200 '
                } else {
                  cellClass += 'bg-emerald-50 '
                }
                if (isToday) cellClass += 'ring-2 ring-pink ring-inset z-10 '

                const lines = [
                  `${hr.label} — ${format(d, 'd MMM yyyy', { locale: th })}`,
                  isBusy ? 'ไม่ว่าง' : 'ว่าง',
                ]
                if (endTimes) lines.push(`คืนกล้อง ${endTimes.join(', ')} น.`)
                if (startTimes) lines.push(`รับกล้อง ${startTimes.join(', ')} น.`)

                return (
                  <button
                    key={key}
                    type="button"
                    className={cellClass}
                    style={cellStyle}
                    onMouseEnter={(e) => showTooltip(e, lines)}
                    onFocus={(e) => showTooltip(e, lines)}
                    onMouseLeave={hideTooltip}
                    onBlur={hideTooltip}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap text-[11px] text-gray-500 pt-1 border-t border-pink-100">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-50 border border-gray-200" />ว่าง</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200" />ไม่ว่าง</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: PICKUP_COLOR }} />รับกล้อง</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: RETURN_COLOR }} />คืนกล้อง</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: `linear-gradient(to right, ${RETURN_COLOR} 50%, ${PICKUP_COLOR} 50%)` }} />คืน+รับวันเดียวกัน</span>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 bg-gray-800 text-white text-[11px] rounded-lg px-2 py-1.5 pointer-events-none shadow-lg -translate-x-1/2 -translate-y-full"
          style={{ left: tooltip.x, top: tooltip.y - 6 }}
        >
          {tooltip.lines.map((line, i) => (
            <div key={i} className={i === 0 ? 'font-semibold' : ''}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}
