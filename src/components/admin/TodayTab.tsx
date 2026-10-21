'use client'
import { useState } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Package, RotateCcw, AlertTriangle, Clock, CheckCircle } from 'lucide-react'
import { Booking, BookingStatus } from '@/types'
import { bangkokDay, handoverDay, returnDay, shiftDay, isOverdue, timeOf } from '@/lib/admin'
import BookingCard, { AdminActions } from './BookingCard'

interface Props {
  bookings: Booking[]
  expanded: string | null
  setExpanded: (id: string | null) => void
  actions: AdminActions
  onJumpToStatus: (status: BookingStatus) => void
}

export default function TodayTab({ bookings, expanded, setExpanded, actions, onJumpToStatus }: Props) {
  const [which, setWhich] = useState<'today' | 'tomorrow'>('today')
  const today = bangkokDay(Date.now())
  const day = which === 'today' ? today : shiftDay(today, 1)

  const live = bookings.filter((b) => b.bookingStatus !== 'cancelled')
  const byTime = (get: (b: Booking) => string) => (a: Booking, b: Booking) =>
    new Date(get(a)).getTime() - new Date(get(b)).getTime()

  const handovers = live
    .filter((b) => handoverDay(b) === day)
    .sort(byTime((b) => String(b.pickupDatetime)))
  const returns = live
    .filter((b) => returnDay(b) === day)
    .sort(byTime((b) => String(b.returnDatetime)))
  const overdue = bookings.filter((b) => isOverdue(b))

  const count = (s: BookingStatus) => bookings.filter((b) => b.bookingStatus === s).length
  const stats: { status: BookingStatus; label: string; color: string }[] = [
    { status: 'pending', label: 'รอยืนยันเงิน', color: 'text-amber-600' },
    { status: 'confirmed', label: 'ยืนยันแล้ว', color: 'text-blue-600' },
    { status: 'active', label: 'กำลังเช่า', color: 'text-emerald-600' },
  ]

  const card = (b: Booking, context: React.ReactNode) => (
    <BookingCard
      key={b.bookingId}
      b={b}
      expanded={expanded === b.bookingId}
      onToggle={() => setExpanded(expanded === b.bookingId ? null : b.bookingId)}
      actions={actions}
      context={context}
    />
  )

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {stats.map((s) => (
          <button
            key={s.status}
            onClick={() => onJumpToStatus(s.status)}
            className="glass rounded-xl p-3 sm:p-4 text-left hover:bg-pink-50 transition-colors"
          >
            <p className={`text-2xl font-bold ${s.color}`}>{count(s.status)}</p>
            <p className="text-gray-500 text-xs mt-1">{s.label}</p>
          </button>
        ))}
      </div>

      {overdue.length > 0 && (
        <section>
          <SectionTitle icon={AlertTriangle} tone="text-red-600" title={`เลยกำหนดคืน (${overdue.length})`} hint="ยังไม่ได้กดรับคืน ทั้งที่เลยเวลาคืนแล้ว" />
          <div className="space-y-2">
            {overdue.map((b) => card(b, (
              <span className="text-red-600">
                ควรคืน {format(new Date(String(b.returnDatetime)), 'd MMM HH:mm', { locale: th })}
              </span>
            )))}
          </div>
        </section>
      )}

      <div className="inline-flex rounded-xl glass p-1" role="tablist" aria-label="เลือกวัน">
        {(['today', 'tomorrow'] as const).map((w) => (
          <button
            key={w}
            role="tab"
            aria-selected={which === w}
            onClick={() => setWhich(w)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              which === w ? 'bg-pink text-white' : 'text-gray-500 hover:text-pink'
            }`}
          >
            {w === 'today' ? 'วันนี้' : 'พรุ่งนี้'}
            <span className="ml-1.5 text-xs opacity-80">
              {format(new Date(`${w === 'today' ? today : shiftDay(today, 1)}T12:00:00+07:00`), 'd MMM', { locale: th })}
            </span>
          </button>
        ))}
      </div>

      <section>
        <SectionTitle icon={Package} tone="text-pink" title={`ส่งกล้อง / ลูกค้ามารับ (${handovers.length})`} />
        {handovers.length === 0 ? (
          <Empty text="ไม่มีคิวส่งกล้อง" />
        ) : (
          <div className="space-y-2">
            {handovers.map((b) => {
              const done = b.bookingStatus === 'active' || b.bookingStatus === 'returned'
              return card(b, (
                <span className={`flex items-center gap-1 ${done ? 'text-emerald-700' : 'text-ink'}`}>
                  {done ? <CheckCircle size={12} /> : <Clock size={12} />}
                  {b.rentalArea === 'provincial'
                    ? `ส่งพัสดุ (ถึงมือ ${format(new Date(String(b.pickupDatetime)), 'd MMM', { locale: th })})`
                    : `${timeOf(b.pickupDatetime)} · ${b.pickupType === 'delivery' ? `Delivery → ${b.pickupAddress}` : 'รับเอง'}`}
                  {done && ' · ส่งแล้ว'}
                </span>
              ))
            })}
          </div>
        )}
      </section>

      <section>
        <SectionTitle icon={RotateCcw} tone="text-pink" title={`รับคืน (${returns.length})`} />
        {returns.length === 0 ? (
          <Empty text="ไม่มีคิวรับคืน" />
        ) : (
          <div className="space-y-2">
            {returns.map((b) => {
              const done = b.bookingStatus === 'returned'
              return card(b, (
                <span className={`flex items-center gap-1 ${done ? 'text-emerald-700' : 'text-ink'}`}>
                  {done ? <CheckCircle size={12} /> : <Clock size={12} />}
                  {b.rentalArea === 'provincial'
                    ? 'ลูกค้าส่งพัสดุคืน (ก่อน 12:00)'
                    : `${timeOf(b.returnDatetime)} · ${b.returnType === 'delivery' ? `ให้ร้านรับ${b.returnAddress ? ` → ${b.returnAddress}` : ''}` : 'คืนเอง'}`}
                  {done && ' · คืนแล้ว'}
                </span>
              ))
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function SectionTitle({ icon: Icon, tone, title, hint }: { icon: React.ElementType; tone: string; title: string; hint?: string }) {
  return (
    <div className="mb-2">
      <h2 className={`font-bold text-sm flex items-center gap-1.5 ${tone}`}>
        <Icon size={15} /> {title}
      </h2>
      {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="glass rounded-xl py-6 text-center text-sm text-gray-400">{text}</p>
}
