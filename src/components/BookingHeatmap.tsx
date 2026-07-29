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

interface Tooltip {
  x: number
  y: number
  lines: string[]
}

// Blue/orange — the most CVD-distinguishable pair, used here as an identity
// pair (pickup vs return event) rather than for magnitude.
const PICKUP_COLOR = '#2a78d6' // รับกล้อง (camera leaves the shop)
const RETURN_COLOR = '#eb6834' // คืนกล้อง (camera comes back)

export default function BookingHeatmap({ rows }: Props) {
  const [month, setMonth] = useState(new Date())
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)

  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd])
  const todayKey = bangkokKey(new Date())

  // Pre-index rows per camera → set of busy day-keys, plus start/end keys
  const byCamera = useMemo(() => {
    const map: Record<string, { busy: Set<string>; starts: Set<string>; ends: Set<string> }> = {}
    for (const c of CAMERAS) map[c.id] = { busy: new Set(), starts: new Set(), ends: new Set() }
    for (const r of rows) {
      const entry = map[r.cameraId]
      if (!entry || !r.start || !r.end) continue
      const startDate = new Date(r.start)
      const endDate = new Date(r.end)
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue
      const startKey = bangkokKey(startDate)
      const endKey = bangkokKey(endDate)
      entry.starts.add(startKey)
      entry.ends.add(endKey)
      // walk day by day (bounded: rentals are short, never more than ~2 months)
      let cursor = startDate
      for (let i = 0; i < 60; i++) {
        const key = bangkokKey(cursor)
        entry.busy.add(key)
        if (key >= endKey) break
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
      }
    }
    return map
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
          <button onClick={() => setMonth(subMonths(month, 1))} className="p-1 hover:bg-pink-50 rounded-full text-pink">
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-medium text-gray-500 w-24 text-center">{format(month, 'MMMM yyyy', { locale: th })}</span>
          <button onClick={() => setMonth(addMonths(month, 1))} className="p-1 hover:bg-pink-50 rounded-full text-pink">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: days.length * 24 + 88 }}>
          {/* day-of-month header */}
          <div className="flex">
            <div className="w-20 shrink-0" />
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className={`w-6 shrink-0 text-center text-[10px] ${bangkokKey(d) === todayKey ? 'text-pink font-bold' : 'text-gray-400'}`}
              >
                {format(d, 'd')}
              </div>
            ))}
          </div>

          {CAMERAS.map((cam) => {
            const entry = byCamera[cam.id]
            return (
              <div key={cam.id} className="flex items-center h-7">
                <div className="w-20 shrink-0 text-xs text-gray-600 font-medium truncate pr-1">
                  {cam.shortName}
                </div>
                {days.map((d) => {
                  const key = bangkokKey(d)
                  const isToday = key === todayKey
                  const isBusy = entry.busy.has(key)
                  const isStart = entry.starts.has(key)
                  const isEnd = entry.ends.has(key)

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
                    `${cam.shortName} — ${format(d, 'd MMM yyyy', { locale: th })}`,
                    isBusy ? 'ไม่ว่าง' : 'ว่าง',
                  ]
                  if (isEnd) lines.push('คืนกล้องวันนี้')
                  if (isStart) lines.push('รับกล้องวันนี้')

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
            )
          })}
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
