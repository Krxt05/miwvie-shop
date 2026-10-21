'use client'
import { useState } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Booking } from '@/types'
import { CAMERAS } from '@/lib/cameras'
import { bangkokDay, bangkokMonth, isPaid } from '@/lib/admin'

// Revenue is counted in the month the camera goes out (pickup date), and only
// once payment is confirmed — never cancelled bookings.

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string, pattern = 'MMMM yyyy'): string {
  return format(new Date(`${month}-15T12:00:00+07:00`), pattern, { locale: th })
}

const baht = (n: number) => `${Math.round(n).toLocaleString()} ฿`

export default function RevenueTab({ bookings }: { bookings: Booking[] }) {
  const thisMonth = bangkokMonth(Date.now())
  const [month, setMonth] = useState(thisMonth)
  const [hover, setHover] = useState<string | null>(null)

  const inMonth = (b: Booking, m: string) => bangkokMonth(String(b.pickupDatetime)) === m
  const paid = bookings.filter(isPaid)
  const paidThis = paid.filter((b) => inMonth(b, month))
  const revenue = paidThis.reduce((s, b) => s + Number(b.totalAmount), 0)
  const unpaid = bookings.filter((b) => b.bookingStatus === 'pending' && inMonth(b, month))
  const unpaidAmount = unpaid.reduce((s, b) => s + Number(b.totalAmount), 0)
  const discounts = paidThis.reduce((s, b) => s + Number(b.discountAmount || 0), 0)
  const deliveryFees = paidThis.reduce((s, b) => s + Number(b.deliveryFee || 0), 0)

  // A month still in progress is compared with the same stretch of last month
  // (day 1 to today's date), otherwise a half-finished month always looks down.
  const todayDate = Number(bangkokDay(Date.now()).slice(8, 10))
  const partial = month === thisMonth
  const upToToday = (b: Booking) => !partial || Number(bangkokDay(String(b.pickupDatetime)).slice(8, 10)) <= todayDate
  const sum = (rows: Booking[]) => rows.reduce((s, b) => s + Number(b.totalAmount), 0)
  const prevRevenue = sum(paid.filter((b) => inMonth(b, shiftMonth(month, -1)) && upToToday(b)))
  const compareRevenue = partial ? sum(paidThis.filter(upToToday)) : revenue
  const change = prevRevenue > 0 ? Math.round(((compareRevenue - prevRevenue) / prevRevenue) * 100) : null

  const trend = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map((m) => {
    const rows = paid.filter((b) => inMonth(b, m))
    return { month: m, total: rows.reduce((s, b) => s + Number(b.totalAmount), 0), count: rows.length }
  })
  const trendMax = Math.max(1, ...trend.map((t) => t.total))

  const byCamera = CAMERAS.map((c) => {
    const rows = paidThis.filter((b) => b.cameraId === c.id)
    return { id: c.id, name: c.shortName, total: rows.reduce((s, b) => s + Number(b.totalAmount), 0), count: rows.length }
  }).sort((a, b) => b.total - a.total)
  const camMax = Math.max(1, ...byCamera.map((c) => c.total))

  const shown = hover ? trend.find((t) => t.month === hover) : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between glass rounded-xl px-2 py-2">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-2 rounded-lg hover:bg-pink-50" aria-label="เดือนก่อน">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="font-bold">{monthLabel(month)}</p>
          {month !== thisMonth && (
            <button onClick={() => setMonth(thisMonth)} className="text-xs text-pink hover:text-pink-light">กลับเดือนนี้</button>
          )}
        </div>
        <button
          onClick={() => setMonth(shiftMonth(month, 1))}
          className="p-2 rounded-lg hover:bg-pink-50"
          aria-label="เดือนถัดไป"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Headline + supporting tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <div className="glass rounded-xl p-4 col-span-2 md:col-span-1">
          <p className="text-gray-500 text-xs">รายได้ (ยืนยันเงินแล้ว)</p>
          <p className="text-2xl font-bold text-ink mt-1">{baht(revenue)}</p>
          {change !== null && (
            <p className={`text-xs mt-1 ${change >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {change >= 0 ? '▲' : '▼'} {Math.abs(change)}% {partial ? `เทียบ 1–${todayDate} เดือนก่อน` : 'จากเดือนก่อน'}
            </p>
          )}
        </div>
        <Tile label="จำนวนการเช่า" value={`${paidThis.length} ครั้ง`} />
        <Tile label="เฉลี่ยต่อครั้ง" value={paidThis.length ? baht(revenue / paidThis.length) : '-'} />
        <Tile label="รอยืนยันเงิน" value={baht(unpaidAmount)} sub={`${unpaid.length} รายการ · ยังไม่นับรวม`} className="col-span-2 md:col-span-1" />
      </div>
      <p className="text-xs text-gray-500 px-1">
        รวมค่าส่ง {baht(deliveryFees)} · ส่วนลดที่ให้ไป {baht(discounts)} · นับตามเดือนที่ลูกค้ารับกล้อง
      </p>

      {/* 6-month trend — single series, so no legend; the title names it */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="font-bold text-sm">รายได้ 6 เดือนล่าสุด</h3>
          <p className="text-xs text-gray-500 h-4">
            {shown ? `${monthLabel(shown.month, 'MMM yy')}: ${baht(shown.total)} · ${shown.count} ครั้ง` : ''}
          </p>
        </div>
        <div className="flex items-end gap-2 h-40 border-b border-gray-200" role="list">
          {trend.map((t) => {
            const selected = t.month === month
            const h = (t.total / trendMax) * 100
            return (
              <button
                key={t.month}
                role="listitem"
                onClick={() => setMonth(t.month)}
                onMouseEnter={() => setHover(t.month)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(t.month)}
                onBlur={() => setHover(null)}
                aria-label={`${monthLabel(t.month)} ${baht(t.total)}`}
                className="flex-1 h-full flex flex-col justify-end items-center group"
              >
                {selected && t.total > 0 && (
                  <span className="text-[10px] text-ink font-semibold mb-1 whitespace-nowrap">{Math.round(t.total).toLocaleString()}</span>
                )}
                <span
                  className={`w-full max-w-10 rounded-t transition-colors ${selected ? 'bg-pink' : 'bg-pink-300 group-hover:bg-pink-400'}`}
                  style={{ height: `${Math.max(h, t.total > 0 ? 2 : 0)}%` }}
                />
              </button>
            )
          })}
        </div>
        <div className="flex gap-2 mt-1.5">
          {trend.map((t) => (
            <span key={t.month} className={`flex-1 text-center text-[10px] ${t.month === month ? 'text-ink font-semibold' : 'text-gray-500'}`}>
              {monthLabel(t.month, 'MMM')}
            </span>
          ))}
        </div>
      </div>

      {/* By model */}
      <div className="glass rounded-xl p-4">
        <h3 className="font-bold text-sm mb-3">แยกตามรุ่น · {monthLabel(month, 'MMM yy')}</h3>
        <div className="space-y-2.5">
          {byCamera.map((c) => (
            <div key={c.id}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-ink font-medium">{c.name}</span>
                <span className="text-gray-500">{c.count} ครั้ง · <span className="text-ink font-semibold">{baht(c.total)}</span></span>
              </div>
              <div className="h-2 rounded-full bg-pink-50">
                <div className="h-2 rounded-full bg-pink" style={{ width: `${(c.total / camMax) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, sub, className = '' }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={`glass rounded-xl p-4 ${className}`}>
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-lg font-bold text-ink mt-1">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
