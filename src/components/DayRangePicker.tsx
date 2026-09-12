'use client'
import { useEffect, useState } from 'react'
import {
  addDays,
  addHours,
  addMonths,
  format,
  startOfDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isBefore,
  isSameDay,
  isSameMonth,
} from 'date-fns'
import { th } from 'date-fns/locale'
import { clsx } from 'clsx'
import { BookedSlot, CameraId } from '@/types'
import { hasCapacityConflict, PROVINCIAL_SHIP_LEAD_DAYS } from '@/lib/cameras'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  cameraId: CameraId
  quantity: number
  bookedSlots: BookedSlot[]
  durationHours: number
  onSelectPickup: (dt: Date) => void
  selectedPickup: Date | null
  onMonthChange?: (year: number, month: number) => void
}

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

export default function DayRangePicker({
  cameraId,
  quantity,
  bookedSlots,
  durationHours,
  onSelectPickup,
  selectedPickup,
  onMonthChange,
}: Props) {
  const today = startOfDay(new Date())
  const earliestStart = addDays(today, PROVINCIAL_SHIP_LEAD_DAYS)
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))

  useEffect(() => {
    onMonthChange?.(viewMonth.getFullYear(), viewMonth.getMonth() + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonth])

  const relevantSlots = bookedSlots.filter((b) => b.cameraId === cameraId)

  // A start day is only offered if the *entire* rental window is clear once
  // both sides' ship buffers are accounted for: existing slots already carry
  // their own buffer (server-side), and since every candidate here is itself
  // provincial, its own 3-day lead-in/lead-out needs padding too — otherwise
  // two provincial bookings could be scheduled back-to-back with no time for
  // the unit to actually travel between them.
  function isDayAvailable(day: Date): boolean {
    const start = startOfDay(day)
    const end = addHours(start, durationHours)
    const paddedStart = addDays(start, -PROVINCIAL_SHIP_LEAD_DAYS)
    const paddedEnd = addDays(end, PROVINCIAL_SHIP_LEAD_DAYS)
    return !hasCapacityConflict(relevantSlots, quantity, paddedStart, paddedEnd)
  }

  // The shop needs lead time to ship the unit out before this date, so "today"
  // and the next couple of days can never be picked, even with an empty queue.
  function isTooSoon(day: Date): boolean {
    return isBefore(startOfDay(day), earliestStart)
  }

  function isPast(day: Date): boolean {
    return isBefore(startOfDay(day), today)
  }

  function isInSelectedRange(day: Date): boolean {
    if (!selectedPickup) return false
    const rangeEnd = addHours(selectedPickup, durationHours)
    return day >= startOfDay(selectedPickup) && startOfDay(day) < rangeEnd
  }

  function handleDayClick(day: Date) {
    if (isTooSoon(day) || !isDayAvailable(day)) return
    onSelectPickup(startOfDay(day))
  }

  const gridStart = startOfWeek(viewMonth)
  const gridEnd = endOfWeek(endOfMonth(viewMonth))
  const calendarDays: Date[] = []
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) calendarDays.push(d)

  const prevMonthDisabled = isSameMonth(viewMonth, today)

  return (
    <div className="w-full">
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setViewMonth((m) => addMonths(m, -1))}
            disabled={prevMonthDisabled}
            className="p-3 -m-1 rounded-lg hover:bg-pink-50 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold">
            {format(viewMonth, 'MMMM yyyy', { locale: th })}
          </span>
          <button
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            className="p-3 -m-1 rounded-lg hover:bg-pink-50 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[10px] text-gray-400">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day) => {
            const inMonth = isSameMonth(day, viewMonth)
            const past = isPast(day)
            const tooSoon = !past && isTooSoon(day)
            const available = !past && !tooSoon && isDayAvailable(day)
            const disabled = past || tooSoon || !available
            const isStart = !!selectedPickup && isSameDay(day, selectedPickup)
            const inRange = !isStart && isInSelectedRange(day)
            return (
              <button
                key={day.toISOString()}
                onClick={() => handleDayClick(day)}
                disabled={disabled}
                title={
                  past ? 'ผ่านไปแล้ว'
                    : tooSoon ? `ต้องจองล่วงหน้าอย่างน้อย ${PROVINCIAL_SHIP_LEAD_DAYS} วัน`
                    : available ? 'เลือกวันนี้เป็นวันเริ่มเช่าได้'
                    : 'คิวไม่ว่างช่วงนี้'
                }
                className={clsx(
                  'aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-sm transition-all',
                  isStart
                    ? 'bg-pink text-white shadow-pink-glow-sm'
                    : inRange
                    ? 'bg-pink/15 text-pink-700 border border-pink/30'
                    : disabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : inMonth
                    ? 'text-gray-700 hover:bg-pink-50'
                    : 'text-gray-300 hover:bg-pink-50',
                )}
              >
                <span>{format(day, 'd')}</span>
                {!past && !tooSoon && (
                  <span
                    className={clsx(
                      'w-1.5 h-1.5 rounded-full',
                      available ? 'bg-emerald-400' : 'bg-red-500',
                    )}
                  />
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-pink-100 text-[11px] text-gray-500 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            เลือกเป็นวันเริ่มเช่าได้
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            คิวไม่ว่าง
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            ต้องจองล่วงหน้า {PROVINCIAL_SHIP_LEAD_DAYS} วัน
          </span>
        </div>
      </div>
    </div>
  )
}
