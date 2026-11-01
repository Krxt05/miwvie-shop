'use client'
import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { Booking } from '@/types'
import { BlockedSlot } from '@/lib/api'
import { bangkokMonth, isPaid } from '@/lib/admin'
import {
  Period, baht, cameraRows, cashIn, comparison, inPeriod, insights, money, monthShort,
  periodLabel, revenueCsv, shiftMonth, shiftPeriod, sumNet,
} from '@/lib/revenue'

// Utilisation hints (CFO rule of thumb): busy most of the time → a second unit
// would pay; idle most of the time → price or keep it under review.
const HIGH_UTIL = 60
const LOW_UTIL = 20
// Too little of the period has passed for a utilisation % to mean anything
const MIN_UTIL_DAYS = 5

interface Props {
  bookings: Booking[]
  blockedSlots: BlockedSlot[]
  onJumpToPending: () => void
}

export default function RevenueTab({ bookings, blockedSlots, onJumpToPending }: Props) {
  const thisMonth = bangkokMonth(Date.now())
  const [period, setPeriod] = useState<Period>({ kind: 'month', key: thisMonth })
  const [picked, setPicked] = useState<string | null>(null) // trend bar the user tapped
  const [more, setMore] = useState(false)

  const isCurrent = period.key === (period.kind === 'month' ? thisMonth : thisMonth.slice(0, 4))
  const label = periodLabel(period)

  const data = useMemo(() => {
    const paid = bookings.filter(isPaid)
    const paidHere = paid.filter((b) => inPeriod(b.pickupDatetime, period))
    const pending = bookings.filter((b) => b.bookingStatus === 'pending' && inPeriod(b.pickupDatetime, period))
    const months = period.kind === 'month'
      ? Array.from({ length: 6 }, (_, i) => shiftMonth(period.key, i - 5))
      : Array.from({ length: 12 }, (_, i) => `${period.key}-${String(i + 1).padStart(2, '0')}`)
    // One pass over paid bookings, grouped by pickup month
    const byMonth = new Map<string, { net: number; count: number }>()
    for (const b of paid) {
      const key = bangkokMonth(String(b.pickupDatetime))
      const cur = byMonth.get(key) ?? { net: 0, count: 0 }
      cur.net += sumNet([b])
      cur.count++
      byMonth.set(key, cur)
    }
    const trend = months.map((m) => ({ month: m, net: byMonth.get(m)?.net ?? 0, count: byMonth.get(m)?.count ?? 0 }))
    return {
      m: money(paidHere),
      cmp: comparison(paid, period),
      cash: cashIn(bookings, period),
      pending: { count: pending.length, total: pending.reduce((s, b) => s + (Number(b.totalAmount) || 0), 0) },
      cams: cameraRows(bookings, blockedSlots, period),
      ins: insights(bookings, period),
      trend,
    }
  }, [bookings, blockedSlots, period])

  const { m, cmp, cash, pending, cams, ins, trend } = data
  const trendMax = Math.max(1, ...trend.map((t) => t.net))
  const selectedMonth = period.kind === 'month' ? period.key : thisMonth.startsWith(period.key) ? thisMonth : `${period.key}-12`
  const shown = trend.find((t) => t.month === (picked ?? selectedMonth)) ?? trend[trend.length - 1]
  const camMax = Math.max(1, ...cams.rows.map((c) => c.net))
  const showUtil = cams.utilDays >= MIN_UTIL_DAYS

  const switchKind = (kind: Period['kind']) => {
    setPicked(null)
    setPeriod(kind === 'month'
      ? { kind, key: period.kind === 'year' && period.key !== thisMonth.slice(0, 4) ? `${period.key}-12` : thisMonth }
      : { kind, key: period.key.slice(0, 4) })
  }
  const go = (delta: number) => { setPicked(null); setPeriod(shiftPeriod(period, delta)) }

  const downloadCsv = () => {
    const blob = new Blob([revenueCsv(bookings, period)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `miwvie-revenue-${period.key}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="space-y-4 tabular-nums">
      {/* Period picker */}
      <div className="glass rounded-xl p-2 space-y-2">
        <div className="grid grid-cols-2 gap-1 bg-pink-50 rounded-lg p-1" role="tablist" aria-label="ช่วงเวลา">
          {(['month', 'year'] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={period.kind === k}
              onClick={() => switchKind(k)}
              className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
                period.kind === k ? 'bg-white text-ink shadow-sm' : 'text-gray-600'
              }`}
            >
              {k === 'month' ? 'รายเดือน' : 'ทั้งปี'}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button onClick={() => go(-1)} className="p-2 rounded-lg hover:bg-pink-50" aria-label="ช่วงก่อนหน้า">
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <p className="font-bold text-ink">{label}</p>
            {isCurrent ? (
              <p className="text-xs text-gray-600">ยังไม่จบ{period.kind === 'month' ? 'เดือน' : 'ปี'}</p>
            ) : (
              <button
                onClick={() => { setPicked(null); setPeriod({ kind: period.kind, key: period.kind === 'month' ? thisMonth : thisMonth.slice(0, 4) }) }}
                className="text-xs text-pink font-medium"
              >
                กลับ{period.kind === 'month' ? 'เดือนนี้' : 'ปีนี้'}
              </button>
            )}
          </div>
          <button
            onClick={() => go(1)}
            disabled={isCurrent}
            className="p-2 rounded-lg hover:bg-pink-50 disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="ช่วงถัดไป"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Headline */}
      <div className="glass rounded-xl p-4">
        <p className="text-gray-600 text-xs">ค่าเช่าสุทธิ · ยืนยันเงินแล้ว</p>
        {m.count === 0 ? (
          <p className="text-sm text-gray-600 mt-2">ยังไม่มีการเช่าที่ยืนยันเงินใน {label}</p>
        ) : (
          <>
            <p className="text-3xl font-bold text-ink mt-1">{baht(m.net)}</p>
            <Delta cmp={cmp} />
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-pink-100 text-sm">
              <div>
                <p className="text-xs text-gray-600">จำนวนการเช่า</p>
                <p className="font-semibold text-ink">{m.count} ครั้ง</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">เฉลี่ยต่อครั้ง</p>
                <p className="font-semibold text-ink">{baht(m.net / m.count)}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {pending.count > 0 && (
        <button
          onClick={onJumpToPending}
          className="w-full flex items-center gap-2 rounded-xl border border-brass bg-brass-light/30 px-4 py-3 text-left text-sm text-ink"
        >
          <AlertTriangle size={16} className="text-brass-dark shrink-0" />
          <span className="flex-1">
            ค้างยืนยันเงิน <b>{pending.count} รายการ · {baht(pending.total)}</b>
            <span className="block text-xs text-gray-600">ยังไม่นับรวมในยอดด้านบน</span>
          </span>
          <ChevronRight size={16} className="text-brass-dark" />
        </button>
      )}

      {/* Statement */}
      {m.count > 0 && (
        <section className="glass rounded-xl p-4">
          <h3 className="font-bold text-sm mb-3">สรุปเงิน · {periodLabel(period, 'short')}</h3>
          <dl className="text-sm space-y-1.5">
            <Line label="ค่าเช่าเต็ม" value={baht(m.gross)} />
            <Line label="หัก ส่วนลดรีวิว" value={baht(-m.discount)} muted />
            <Line label="ค่าเช่าสุทธิ" value={baht(m.net)} strong rule />
            <Line label="ค่าส่งในพื้นที่ (รายได้)" value={baht(m.localFees)} />
            <Line label="รายได้ร้าน" value={baht(m.net + m.localFees)} strong rule />
            <Line label="ค่าส่งต่างจังหวัด (จ่ายต่อขนส่ง)" value={baht(m.provincialFees)} muted />
            <Line label="เงินรับจากลูกค้าทั้งหมด" value={baht(m.totalIn)} strong rule />
          </dl>
          <div className="mt-3 pt-3 border-t border-pink-100 space-y-1 text-xs text-gray-600">
            <p className="flex justify-between gap-3">
              <span>เงินโอนเข้าใน {periodLabel(period, 'short')} (ตามวันกดยืนยันรับเงิน · ไว้เทียบกับบัญชีธนาคาร)</span>
              <span className="text-ink font-semibold whitespace-nowrap">{baht(cash.total)}</span>
            </p>
            {cash.estimated > 0 && <p>{cash.estimated} รายการเก่าไม่มีวันยืนยันรับเงิน ใช้วันที่จองแทน</p>}
            {ins.cancelledPaid.count > 0 && (
              <p className="text-red-700">
                ยกเลิกหลังจ่ายแล้ว {ins.cancelledPaid.count} รายการ · {baht(ins.cancelledPaid.total)} — ไม่นับเป็นรายได้ ตรวจเองว่าคืนเงินแล้วหรือยัง
              </p>
            )}
            {m.mismatched > 0 && <p>{m.mismatched} รายการเก่ายอดรวมไม่ตรงสูตร (ค่าเช่า − ส่วนลด + ค่าส่ง)</p>}
          </div>
        </section>
      )}

      {/* By model */}
      {m.count > 0 && (
        <section className="glass rounded-xl p-4">
          <div className="flex items-baseline justify-between mb-3 gap-2">
            <h3 className="font-bold text-sm">แยกตามรุ่น</h3>
            {showUtil && (
              <p className="text-[11px] text-gray-600 flex items-center gap-2">
                <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm bg-pink" />เช่า</span>
                <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm bg-pink-200" />ไม่ว่าง</span>
              </p>
            )}
          </div>
          <ul className="space-y-3">
            {cams.rows.map((c) => (
              <li key={c.id}>
                <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
                  <span className="text-ink font-medium truncate min-w-0">
                    {c.name}{c.units > 1 && <span className="text-gray-600 font-normal"> · {c.units} ตัว</span>}
                  </span>
                  <span className="text-gray-600 whitespace-nowrap">
                    {c.count} ครั้ง · <span className="text-ink font-semibold">{baht(c.net)}</span>
                  </span>
                </div>
                {showUtil && c.rentedPct !== null && c.busyPct !== null ? (
                  <>
                    <div
                      className="relative h-2.5 rounded-full bg-pink-50 overflow-hidden"
                      role="img"
                      aria-label={`${c.name} ถูกเช่า ${c.rentedPct}% ไม่ว่างรวม ${c.busyPct}%`}
                    >
                      <div className="absolute inset-y-0 left-0 bg-pink-200" style={{ width: `${Math.min(c.busyPct, 100)}%` }} />
                      <div className="absolute inset-y-0 left-0 bg-pink" style={{ width: `${Math.min(c.rentedPct, 100)}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[11px] text-gray-600">
                      <span>
                        ถูกเช่า <b className="text-ink">{c.rentedPct}%</b> · ไม่ว่างรวม {c.busyPct}%
                        {c.units > 1 && c.count > 0 && <> · {baht(c.net / c.units)}/ตัว</>}
                      </span>
                      {period.kind === 'month' && c.rentedPct >= HIGH_UTIL && (
                        <span className="rounded-full bg-brass-light/50 text-brass-dark px-2 py-0.5 font-medium">พิจารณาเพิ่มเครื่อง</span>
                      )}
                      {period.kind === 'month' && c.rentedPct < LOW_UTIL && (
                        <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 font-medium">ว่างเยอะ · พิจารณาลดราคา</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="h-2 rounded-full bg-pink-50">
                    <div className="h-2 rounded-full bg-pink" style={{ width: `${(c.net / camMax) * 100}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!showUtil && <p className="text-[11px] text-gray-600 mt-3">% การเช่าจะขึ้นเมื่อผ่านไปอย่างน้อย {MIN_UTIL_DAYS} วัน</p>}
        </section>
      )}

      {/* Trend */}
      <section className="glass rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-3 gap-2">
          <h3 className="font-bold text-sm">ค่าเช่าสุทธิ{period.kind === 'month' ? ' 6 เดือนล่าสุด' : `รายเดือน ${label}`}</h3>
          <p className="text-xs text-gray-600 whitespace-nowrap">
            {monthShort(shown.month)}: <b className="text-ink">{baht(shown.net)}</b> · {shown.count} ครั้ง
          </p>
        </div>
        <div className="relative">
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-gray-300" aria-hidden />
          <span className="absolute left-0 top-0.5 text-[10px] text-gray-600 bg-white/70 px-0.5 rounded" aria-hidden>{baht(trendMax)}</span>
          <ul className={`flex items-end h-36 border-b border-gray-300 ${period.kind === 'year' ? 'gap-1' : 'gap-2'}`}>
            {trend.map((t) => {
              const active = t.month === shown.month
              const h = (t.net / trendMax) * 100
              return (
                <li key={t.month} className="flex-1 h-full">
                  <button
                    onClick={() => setPicked(t.month)}
                    aria-label={`${monthShort(t.month)} ${baht(t.net)} ${t.count} ครั้ง`}
                    aria-pressed={active}
                    className="w-full h-full flex items-end justify-center"
                  >
                    <span
                      className={`w-full max-w-10 rounded-t ${active ? 'bg-pink-700' : 'bg-pink-400'}`}
                      style={{ height: `${Math.max(h, t.net > 0 ? 2 : 0)}%` }}
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <div className={`flex mt-1.5 ${period.kind === 'year' ? 'gap-1' : 'gap-2'}`} aria-hidden>
          {trend.map((t) => (
            <span key={t.month} className={`flex-1 text-center text-[11px] ${t.month === shown.month ? 'text-ink font-semibold' : 'text-gray-600'}`}>
              {period.kind === 'year' ? monthShort(t.month).replace('.', '').slice(0, 2) : monthShort(t.month)}
            </span>
          ))}
        </div>
      </section>

      {/* Drill-down */}
      <section className="glass rounded-xl">
        <button
          onClick={() => setMore(!more)}
          aria-expanded={more}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold"
        >
          ดูเพิ่ม
          <ChevronDown size={16} className={`transition-transform ${more ? 'rotate-180' : ''}`} />
        </button>
        {more && (
          <div className="px-4 pb-4 space-y-4 text-sm">
            <dl className="space-y-1.5">
              <Line
                label="ลูกค้าเก่ากลับมาเช่า"
                value={ins.repeatPct === null ? '-' : `${ins.repeatPct}% (${ins.repeat}/${ins.known})`}
              />
              <Line label="ส่วนลดเทียบค่าเช่าเต็ม" value={ins.discountPct === null ? '-' : `${ins.discountPct}%`} />
              <Line label="ในพื้นที่" value={`${ins.local.count} ครั้ง · ${baht(ins.local.net)}`} />
              <Line label="ต่างจังหวัด" value={`${ins.provincial.count} ครั้ง · ${baht(ins.provincial.net)}`} />
              <Line label="ยกเลิก" value={ins.cancelPct === null ? '-' : `${ins.cancelled} รายการ (${ins.cancelPct}%)`} />
            </dl>
            <div className="text-xs text-gray-600 space-y-1 border-t border-pink-100 pt-3">
              <p className="font-semibold text-ink">วิธีคิดตัวเลข</p>
              <p>• นับตามวันที่ลูกค้ารับกล้อง เฉพาะรายการที่ยืนยันเงินแล้วและไม่ถูกยกเลิก</p>
              <p>• ค่าส่งในพื้นที่ร้านไปส่งเอง จึงนับเป็นรายได้ ส่วนค่าส่งต่างจังหวัดจ่ายต่อให้ขนส่ง จึงไม่นับ</p>
              <p>• ถูกเช่า % = ชั่วโมงที่ลูกค้าเช่า ÷ (จำนวนเครื่อง × ชั่วโมงที่ผ่านไปของช่วงนี้)</p>
              <p>• ไม่ว่าง % รวมเวลาส่งพัสดุ ±3 วัน, ชาร์จแบต 1 ชม., ใบจองที่ยังไม่จ่าย และวันที่บล็อกเอง</p>
              <p>• ลูกค้าเก่า = เบอร์โทร (หรือ IG) นี้เคยเช่าและจ่ายแล้วมาก่อน</p>
            </div>
          </div>
        )}
      </section>

      <button onClick={downloadCsv} className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-600 hover:text-pink py-2">
        <Download size={14} /> ส่งออก CSV · {label}
      </button>
    </div>
  )
}

function Delta({ cmp }: { cmp: ReturnType<typeof comparison> }) {
  if (!cmp.hasPrev) return <p className="text-xs text-gray-600 mt-1">ยังไม่มีรายการให้{cmp.rangeNote}</p>
  const pct = cmp.pct ?? 0
  const tone = pct > 0 ? 'text-emerald-700' : pct < 0 ? 'text-red-700' : 'text-gray-600'
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '—'
  const sign = cmp.diff > 0 ? '+' : ''
  return (
    <p className={`text-xs mt-1 ${tone}`}>
      {arrow} {pct > 0 ? '+' : ''}{pct}% ({sign}{baht(cmp.diff)}) <span className="text-gray-600">{cmp.rangeNote}</span>
    </p>
  )
}

function Line({ label, value, strong, muted, rule }: { label: string; value: string; strong?: boolean; muted?: boolean; rule?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${rule ? 'border-t border-pink-100 pt-1.5' : ''}`}>
      <dt className={muted ? 'text-gray-600' : strong ? 'text-ink font-semibold' : 'text-ink'}>{label}</dt>
      <dd className={`text-right whitespace-nowrap ${strong ? 'font-bold text-ink' : muted ? 'text-gray-600' : 'text-ink'}`}>{value}</dd>
    </div>
  )
}
