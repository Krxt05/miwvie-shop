'use client'
import { useState, useEffect } from 'react'
import { addDays, format, startOfDay, isBefore, isWithinInterval, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'
import { clsx } from 'clsx'
import { BookedSlot, CameraId } from '@/types'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  cameraId: CameraId
  bookedSlots: BookedSlot[]
  onSelectPickup: (dt: Date) => void
  selectedPickup: Date | null
  durationHours: number
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DAYS_SHOWN = 7

export default function HourlyTimeline({
  cameraId,
  bookedSlots,
  onSelectPickup,
  selectedPickup,
  durationHours,
}: Props) {
  const [startDay, setStartDay] = useState(() => startOfDay(new Date()))

  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(startDay, i))

  function isBooked(day: Date, hour: number): boolean {
    const slotStart = new Date(day)
    slotStart.setHours(hour, 0, 0, 0)
    const slotEnd = new Date(slotStart)
    slotEnd.setHours(hour + 1, 0, 0, 0)

    return bookedSlots.some((b) => {
      if (b.cameraId !== cameraId) return false
      const bStart = parseISO(b.pickupDatetime)
      const bEnd = parseISO(b.returnDatetime)
      return slotStart < bEnd && slotEnd > bStart
    })
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
    return (
      slotStart >= selectedPickup &&
      slotStart < returnTime
    )
  }

  function handleClick(day: Date, hour: number) {
    if (isPast(day, hour) || isBooked(day, hour)) return
    const dt = new Date(day)
    dt.setHours(hour, 0, 0, 0)
    onSelectPickup(dt)
  }

  function getSlotClass(day: Date, hour: number): string {
    if (isPast(day, hour)) return 'slot-past'
    if (isBooked(day, hour)) return 'slot-busy'
    if (isSelected(day, hour)) return 'slot-selected'
    return 'slot-available'
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setStartDay(addDays(startDay, -DAYS_SHOWN))}
          className="p-2 rounded-lg glass hover:bg-white/10 transition-colors"
          disabled={isBefore(addDays(startDay, -1), startOfDay(new Date()))}
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm text-white/60">
          {format(startDay, 'd MMM', { locale: th })} —{' '}
          {format(addDays(startDay, DAYS_SHOWN - 1), 'd MMM yyyy', { locale: th })}
        </span>
        <button
          onClick={() => setStartDay(addDays(startDay, DAYS_SHOWN))}
          className="p-2 rounded-lg glass hover:bg-white/10 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Scroll hint on mobile */}
      <p className="text-xs text-white/30 mb-2 md:hidden flex items-center gap-1">
        ← เลื่อนซ้าย-ขวาเพื่อดูทุกชั่วโมง →
      </p>

      {/* Timeline grid */}
      <div className="overflow-x-auto rounded-xl pb-1">
        <div className="min-w-[720px]">
          {/* Hour labels — every hour */}
          <div className="flex items-end mb-1 gap-1">
            <div className="w-20 shrink-0" />
            <div className="flex flex-1 gap-px">
              {HOURS.map((h) => (
                <div key={h} className="flex-1 text-center">
                  <span className={`text-[9px] leading-none ${h % 6 === 0 ? 'text-white/60 font-semibold' : 'text-white/30'}`}>
                    {String(h).padStart(2, '0')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Day rows */}
          {days.map((day) => (
            <div key={day.toISOString()} className="flex items-center mb-1 gap-1">
              {/* Day label */}
              <div className="w-20 shrink-0 text-right pr-3">
                <span className="text-xs text-white/50 block">
                  {format(day, 'EEE', { locale: th })}
                </span>
                <span className="text-sm font-semibold">{format(day, 'd')}</span>
              </div>

              {/* Hour slots */}
              <div className="flex flex-1 gap-px">
                {HOURS.map((h) => {
                  const busy = isBooked(day, h)
                  const past = isPast(day, h)
                  return (
                    <button
                      key={h}
                      title={`${format(day, 'd MMM')} ${String(h).padStart(2, '0')}:00`}
                      className={clsx(
                        'flex-1 h-8 rounded-sm border transition-all duration-150 flex items-center justify-center',
                        getSlotClass(day, h),
                      )}
                      onClick={() => handleClick(day, h)}
                    >
                      {busy && !past && (
                        <span className="text-[9px] font-black leading-none select-none" style={{ color: 'rgba(255,100,120,0.9)' }}>✕</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-white/50 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-500/50" />
          ว่าง
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-pink/20 border border-pink/35 flex items-center justify-center text-[8px] font-black" style={{ color: 'rgba(255,100,120,0.9)' }}>✕</span>
          ถูกจอง
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-gold/30 border border-gold" />
          ที่เลือก
        </span>
      </div>
    </div>
  )
}
