'use client'
import { useEffect, useState } from 'react'
import {
  addDays,
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
import { hasCapacityConflict } from '@/lib/cameras'
import { ChevronLeft, ChevronRight, Check, X as XIcon } from 'lucide-react'

interface Props {
  cameraId: CameraId
  quantity: number
  bookedSlots: BookedSlot[]
  onSelectPickup: (dt: Date) => void
  selectedPickup: Date | null
  durationHours: number
  onMonthChange?: (year: number, month: number) => void
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

type DayStatus = 'free' | 'partial' | 'full' | 'past'

export default function HourlyTimeline({
  cameraId,
  quantity,
  bookedSlots,
  onSelectPickup,
  selectedPickup,
  durationHours,
  onMonthChange,
}: Props) {
  const today = startOfDay(new Date())
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<Date | null>(
    selectedPickup ? startOfDay(selectedPickup) : null,
  )

  useEffect(() => {
    onMonthChange?.(viewMonth.getFullYear(), viewMonth.getMonth() + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonth])

  const relevantSlots = bookedSlots.filter((b) => b.cameraId === cameraId)

  function isBooked(day: Date, hour: number): boolean {
    const slotStart = new Date(day)
    slotStart.setHours(hour, 0, 0, 0)
    const slotEnd = new Date(slotStart)
    slotEnd.setHours(hour + 1, 0, 0, 0)

    return hasCapacityConflict(relevantSlots, quantity, slotStart, slotEnd)
  }

  function isPast(day: Date, hour: number): boolean {
    const slotStart = new Date(day)
    slotStart.setHours(hour, 0, 0, 0)
    return isBefore(slotStart, new Date())
  }

  function isSelected(day: Date, hour: number): boolean {
    if (!selectedPickup) return false
    const slotStart = new Date(day)
    slotStart.setHours(hour, 0, 0, 0)
    const returnTime = new Date(selectedPickup)
    returnTime.setTime(returnTime.getTime() + durationHours * 3600000)
    return slotStart >= selectedPickup && slotStart < returnTime
  }

  function dayStatus(day: Date): DayStatus {
    const hours = HOURS.filter((h) => !isPast(day, h))
    if (hours.length === 0) return 'past'
    const availableCount = hours.filter((h) => !isBooked(day, h)).length
    if (availableCount === 0) return 'full'
    if (availableCount === hours.length) return 'free'
    return 'partial'
  }

  function handleDayClick(day: Date, status: DayStatus) {
    if (status === 'past' || status === 'full') return
    setSelectedDay(day)
  }

  function handleHourClick(hour: number) {
    if (!selectedDay) return
    if (isPast(selectedDay, hour) || isBooked(selectedDay, hour)) return
    const dt = new Date(selectedDay)
    dt.setHours(hour, 0, 0, 0)
    onSelectPickup(dt)
  }

  const gridStart = startOfWeek(viewMonth)
  const gridEnd = endOfWeek(endOfMonth(viewMonth))
  const calendarDays: Date[] = []
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) calendarDays.push(d)

  const prevMonthDisabled = isSameMonth(viewMonth, today)

  return (
    <div className="w-full">
      {/* Month calendar */}
      <div className="glass rounded-xl p-4 mb-4">
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
            const status = dayStatus(day)
            const inMonth = isSameMonth(day, viewMonth)
            const selected = !!selectedDay && isSameDay(day, selectedDay)
            const disabled = status === 'past' || status === 'full'
            return (
              <button
                key={day.toISOString()}
                onClick={() => handleDayClick(day, status)}
                disabled={disabled}
                className={clsx(
                  'aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-sm transition-all',
                  selected
                    ? 'bg-pink text-white shadow-pink-glow-sm'
                    : disabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : inMonth
                    ? 'text-gray-700 hover:bg-pink-50'
                    : 'text-gray-300 hover:bg-pink-50',
                )}
              >
                <span>{format(day, 'd')}</span>
                {status === 'free' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                {status === 'partial' && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                {status === 'full' && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-pink-100 text-[11px] text-gray-500 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            ว่างทั้งวัน
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            ว่างบางช่วง
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            เต็ม
          </span>
        </div>
      </div>

      {/* Hourly agenda for the selected day */}
      {selectedDay ? (
        <div>
          <p className="text-sm text-gray-500 mb-2">
            เลือกเวลารับ — {format(selectedDay, 'EEEE d MMMM yyyy', { locale: th })}
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {HOURS.map((h) => {
              const busy = isBooked(selectedDay, h)
              const past = isPast(selectedDay, h)
              const selected = isSelected(selectedDay, h)
              const disabled = busy || past
              return (
                <button
                  key={h}
                  onClick={() => handleHourClick(h)}
                  disabled={disabled}
                  title={busy ? 'ถูกจองแล้ว' : past ? 'ผ่านไปแล้ว' : 'ว่าง'}
                  className={clsx(
                    'flex flex-col items-center justify-center gap-1 rounded-lg py-2.5 text-sm font-medium transition-all',
                    selected
                      ? 'bg-pink text-white shadow-pink-glow-sm'
                      : disabled
                      ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                      : 'bg-white border border-emerald-100 text-gray-700 hover:border-emerald-300 hover:bg-emerald-50',
                  )}
                >
                  <span>{String(h).padStart(2, '0')}:00</span>
                  {selected ? (
                    <Check size={12} />
                  ) : busy ? (
                    <XIcon size={10} className="text-gray-300" />
                  ) : !past ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">เลือกวันที่จากปฏิทินด้านบนเพื่อดูช่วงเวลาที่ว่าง</p>
      )}
    </div>
  )
}
