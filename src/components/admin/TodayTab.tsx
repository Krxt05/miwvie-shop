'use client'
import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarDays, CheckCircle, Wallet, PackageX } from 'lucide-react'
import { Booking, BookingStatus } from '@/types'
import {
  CustomerInfo, agoLabel, bangkokDay, dayLabel, dayTimeLabel, dueBack, handoverDay, isNotHandedOver,
  isOverdue, returnDay, shiftDay, timeOf, weekdayLabel,
} from '@/lib/admin'
import BookingCard, { AdminActions } from './BookingCard'

interface Props {
  bookings: Booking[]
  expanded: string | null
  onToggle: (id: string) => void
  actions: AdminActions
  customerOf: (b: Booking) => CustomerInfo
  onJumpToStatus: (status: BookingStatus) => void
}

// Work queue, most urgent first: late cameras → paid but never handed over →
// payments to check → the day's handovers and returns in time order.
export default function TodayTab({ bookings, expanded, onToggle, actions, customerOf, onJumpToStatus }: Props) {
  // 'yyyy-MM-dd' in Bangkok; '' = today (so it rolls over at midnight)
  const [picked, setPicked] = useState('')
  const today = bangkokDay(Date.now())
  const tomorrow = shiftDay(today, 1)
  const day = picked || today
  const which: 'today' | 'tomorrow' | 'other' = day === today ? 'today' : day === tomorrow ? 'tomorrow' : 'other'

  const { overdue, notHandedOver, pending, timeline, counts } = useMemo(() => {
    const live = bookings.filter((b) => b.bookingStatus !== 'cancelled')
    const ms = (v: string | Date) => new Date(String(v)).getTime()

    // One card per booking. A same-day rental (out and back on this day) is
    // listed at its next step: the handover until it's out, then the return.
    type Item = { b: Booking; out: boolean; back: boolean; at: number; done: boolean }
    const items: Item[] = []
    for (const b of live) {
      if (b.bookingStatus === 'pending') continue // shown in the payments box until paid
      const out = handoverDay(b) === day
      const back = returnDay(b) === day
      if (!out && !back) continue
      const handedOver = b.bookingStatus === 'active' || b.bookingStatus === 'returned'
      const outAt = b.rentalArea === 'provincial' ? ms(b.pickupDatetime) - 1 : ms(b.pickupDatetime)
      const nextIsReturn = back && (handedOver || !out)
      items.push({
        b, out, back,
        at: nextIsReturn ? dueBack(b) : outAt,
        done: back ? b.bookingStatus === 'returned' : handedOver,
      })
    }
    // Still to do, by time; finished ones sink to the bottom
    items.sort((x, y) => Number(x.done) - Number(y.done) || x.at - y.at)

    const count = (s: BookingStatus) => bookings.filter((b) => b.bookingStatus === s).length
    return {
      overdue: bookings.filter((b) => isOverdue(b)).sort((a, b) => dueBack(a) - dueBack(b)),
      notHandedOver: bookings.filter((b) => isNotHandedOver(b)),
      pending: bookings.filter((b) => b.bookingStatus === 'pending').sort((a, b) => ms(a.createdAt) - ms(b.createdAt)),
      timeline: items,
      counts: { confirmed: count('confirmed'), active: count('active') },
    }
  }, [bookings, day])

  const card = (b: Booking, context: React.ReactNode, key = b.bookingId) => (
    <BookingCard
      key={key}
      b={b}
      expanded={expanded === b.bookingId}
      onToggle={onToggle}
      actions={actions}
      customer={customerOf(b)}
      context={context}
    />
  )

  return (
    <div className="space-y-6">
      {overdue.length > 0 && (
        <section>
          <SectionTitle icon={AlertTriangle} tone="text-red-700" title={`เลยกำหนดคืน (${overdue.length})`} hint="ส่งกล้องไปแล้ว เลยเวลาคืน ยังไม่ได้กดรับคืน" />
          <div className="space-y-2">
            {overdue.map((b) => card(b, (
              <span className="text-red-700 font-medium">ควรคืน {dayTimeLabel(dueBack(b))} · เลยมา {agoLabel(dueBack(b))}</span>
            )))}
          </div>
        </section>
      )}

      {notHandedOver.length > 0 && (
        <section>
          <SectionTitle icon={PackageX} tone="text-[#6F5220]" title={`ยังไม่ได้กดส่งกล้อง (${notHandedOver.length})`} hint="เลยเวลารับแล้ว — ลูกค้าไม่มารับ หรือลืมกด “ส่งกล้องแล้ว”" />
          <div className="space-y-2">
            {notHandedOver.map((b) => card(b, (
              <span className="text-[#6F5220]">นัดรับ {b.rentalArea === 'provincial' ? dayLabel(b.pickupDatetime) : dayTimeLabel(b.pickupDatetime)}</span>
            )))}
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <SectionTitle icon={Wallet} tone="text-[#6F5220]" title={`รอยืนยันเงิน (${pending.length})`} hint="เช็กสลิปในแชท แล้วกดยืนยัน — ใบจองที่ค้างยังกันคิวไว้" />
          <div className="space-y-2">
            {pending.map((b) => card(b, (
              <span className="text-gray-600">จองมา {agoLabel(b.createdAt)}</span>
            )))}
          </div>
        </section>
      )}

      <section>
        <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-gradient-dark">
          <div className="grid grid-cols-3 gap-1 rounded-xl glass p-1" role="tablist" aria-label="เลือกวัน">
            {(['today', 'tomorrow'] as const).map((w) => (
              <button
                key={w}
                role="tab"
                aria-selected={which === w}
                onClick={() => setPicked(w === 'today' ? '' : tomorrow)}
                className={`min-h-11 rounded-lg text-sm font-medium leading-tight transition-colors ${
                  which === w ? 'bg-pink text-white' : 'text-gray-600'
                }`}
              >
                {w === 'today' ? 'วันนี้' : 'พรุ่งนี้'}
                <span className="block text-[11px] opacity-80">{weekdayLabel(`${w === 'today' ? today : tomorrow}T12:00:00+07:00`)}</span>
              </button>
            ))}
            {/* The native date picker sits invisibly over the button, so a tap
                opens the phone's own calendar */}
            <label
              role="tab"
              aria-selected={which === 'other'}
              className={`relative min-h-11 rounded-lg text-sm font-medium leading-tight flex flex-col items-center justify-center transition-colors ${
                which === 'other' ? 'bg-pink text-white' : 'text-gray-600'
              }`}
            >
              <span className="flex items-center gap-1"><CalendarDays size={14} /> {which === 'other' ? 'วันที่' : 'เลือกวัน'}</span>
              {which === 'other' && <span className="block text-[11px] opacity-80">{weekdayLabel(`${day}T12:00:00+07:00`)}</span>}
              <input
                type="date"
                value={day}
                onChange={(e) => setPicked(e.target.value === today ? '' : e.target.value)}
                aria-label="เลือกวันที่"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </label>
          </div>
        </div>

        <h2 className="font-bold text-sm mt-2 mb-2 text-ink">
          ส่ง / รับคืน{which !== 'today' && ` · ${weekdayLabel(`${day}T12:00:00+07:00`)}`} ({timeline.length})
        </h2>
        {timeline.length === 0 ? (
          <p className="glass rounded-xl py-6 text-center text-sm text-gray-600">ไม่มีคิวส่งหรือรับคืน</p>
        ) : (
          <div className="space-y-2">
            {timeline.map(({ b, out, back, done }) => (
              <div key={b.bookingId} className={done ? 'opacity-70' : ''}>
                {card(b, (
                  <span className="flex flex-col gap-0.5">
                    {out && <TimelineLine b={b} kind="out" done={b.bookingStatus === 'active' || b.bookingStatus === 'returned'} />}
                    {back && <TimelineLine b={b} kind="back" done={b.bookingStatus === 'returned'} />}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex gap-2 text-xs">
        <button onClick={() => onJumpToStatus('confirmed')} className="flex-1 min-h-11 glass rounded-xl px-3 text-left">
          <b className="text-ink text-sm tabular-nums">{counts.confirmed}</b> <span className="text-gray-600">ยืนยันแล้ว รอส่ง</span>
        </button>
        <button onClick={() => onJumpToStatus('active')} className="flex-1 min-h-11 glass rounded-xl px-3 text-left">
          <b className="text-ink text-sm tabular-nums">{counts.active}</b> <span className="text-gray-600">กำลังเช่า</span>
        </button>
      </div>
    </div>
  )
}

function TimelineLine({ b, kind, done }: { b: Booking; kind: 'out' | 'back'; done: boolean }) {
  const prov = b.rentalArea === 'provincial'
  const Icon = done ? CheckCircle : kind === 'out' ? ArrowUpRight : ArrowDownLeft
  let text: string
  if (kind === 'out') {
    text = prov
      ? `ร้านส่งพัสดุ (ถึงมือ ${dayLabel(b.pickupDatetime)})`
      : `ส่ง ${timeOf(b.pickupDatetime)} · ${b.pickupType === 'delivery' ? `Delivery → ${b.pickupAddress}` : 'ลูกค้ามารับเอง'}`
  } else {
    text = prov
      ? 'ลูกค้าส่งพัสดุคืน (ก่อน 12:00)'
      : `คืน ${timeOf(new Date(dueBack(b)))} · ${b.returnType === 'delivery' ? `ร้านไปรับ${b.returnAddress ? ` → ${b.returnAddress}` : ''}` : 'คืนเอง'}`
  }
  return (
    <span className={`flex items-center gap-1 font-medium ${done ? 'text-emerald-700' : kind === 'out' ? 'text-pink-700' : 'text-ink'}`}>
      <Icon size={13} className="shrink-0" />
      {text}
      {done && (kind === 'out' ? ' · ส่งแล้ว' : ' · คืนแล้ว')}
    </span>
  )
}

function SectionTitle({ icon: Icon, tone, title, hint }: { icon: React.ElementType; tone: string; title: string; hint?: string }) {
  return (
    <div className="mb-2">
      <h2 className={`font-bold text-sm flex items-center gap-1.5 ${tone}`}>
        <Icon size={15} /> {title}
      </h2>
      {hint && <p className="text-xs text-gray-600 mt-0.5">{hint}</p>}
    </div>
  )
}
