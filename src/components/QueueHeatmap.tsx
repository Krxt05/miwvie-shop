'use client'

// Homepage "ตรวจสอบคิว": one row per model, one cell per day, coloured by how
// free that model is. Display only.
// Data is the anonymous public summary (no names), fetched once the section
// is near the screen so the hero isn't delayed.
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { CameraId, RentalArea } from '@/types'
import {
  CAMERAS, DELIVERY_HOURS_LABEL, LOCAL_DELIVERY_FEE, MIN_PROVINCIAL_DURATION_HOURS,
  PROVINCIAL_SHIPPING_FEE, PROVINCIAL_SHIP_LEAD_DAYS,
} from '@/lib/cameras'
import { FreeMap, PublicQueue, buildFree, fetchPublicQueue, fitsFast, startOfBkkDay } from '@/lib/publicQueue'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const DAYS_SHOWN = 90 // matches PUBLIC_DAYS in Code.gs

type Cell = { status: 'free' | 'partial' | 'full' | 'closed' | 'unknown' | 'past' }

const F_WD = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'narrow' })
const F_MONTH = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', month: 'long', year: 'numeric' })
const bkkDate = (t: number) => new Date(t + 7 * HOUR).toISOString().slice(0, 10)

// Traffic-light colours so nobody needs the legend: green = free,
// amber = some hours, grey = taken. Display only — booking is on /book.
const CELL: Record<Cell['status'], string> = {
  free: 'bg-emerald-500 text-white',
  partial: 'bg-amber-300 text-amber-900',
  full: 'bg-ink/[0.07]',
  closed: 'bg-ink/[0.07] bg-[repeating-linear-gradient(45deg,transparent_0_4px,rgba(43,29,31,0.12)_4px_6px)]',
  unknown: 'bg-white ring-1 ring-inset ring-pink-900/10',
  past: 'bg-transparent',
}
const LABEL: Record<Cell['status'], string> = {
  free: 'ว่าง', partial: 'ว่างบางช่วง', full: 'เต็ม', closed: 'ร้านปิด', unknown: 'ยังไม่มีข้อมูลคิว', past: 'ผ่านไปแล้ว',
}

// Provincial: the day is when the parcel arrives; free = the minimum rental
// fits starting that day (shipping days either side are checked too)
function provCellFor(q: PublicQueue, free: FreeMap, id: string, day: number, today: number): Cell {
  if (day < today + PROVINCIAL_SHIP_LEAD_DAYS * DAY) return { status: 'past' }
  const r = fitsFast(q, free, id, 'provincial', day, day + MIN_PROVINCIAL_DURATION_HOURS * HOUR)
  if (r === 'free') return { status: 'free' }
  if (r === 'unknown') return { status: 'unknown' }
  return { status: 'full' }
}

// One model on one day, read like the admin queue chart:
//   free    — a unit is free the whole day (from now, for today)
//   partial — busy for part of the day, but a 6-hour rental (the shortest)
//             can still start that day; pickups at any hour, as on /book
//   full    — neither
function cellFor(q: PublicQueue, free: FreeMap, id: string, day: number, now: number): Cell {
  const hours: number[] = []
  for (let h = 0; h < 24; h++) if (day + h * HOUR >= now) hours.push(day + h * HOUR)
  if (!hours.length) return { status: 'past' }
  // Shop shut for every pickup hour left that day
  const shut = (t: number) =>
    q.closed.some(([s, e]) => t >= s && t < e) ||
    (q.closures ?? []).some((c) => c.cam === 'ALL' && t >= c.s && t < c.e)
  if (hours.every(shut)) return { status: 'closed' }
  const from = Math.max(day, now)
  const end = day + DAY
  if (end <= q.to && (free[id] ?? []).some(([a, b]) => a <= from && b >= end)) return { status: 'free' }
  let unknown = false
  for (const s of hours) {
    const r = fitsFast(q, free, id, 'local', s, s + 6 * HOUR)
    if (r === 'free') return { status: 'partial' }
    if (r === 'unknown') unknown = true
  }
  return { status: unknown || end > q.to ? 'unknown' : 'full' }
}

export default function QueueHeatmap() {
  const ref = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState<PublicQueue | null>(null)
  const [failed, setFailed] = useState(false)
  const [startIdx, setStartIdx] = useState(0) // first day shown, in days from today
  const [wide, setWide] = useState(false)
  const [area, setArea] = useState<RentalArea>('local')
  const isProv = area === 'provincial'
  const [now] = useState(() => Date.now())
  const today = startOfBkkDay(now)

  // 7 days a page on phones, 14 on wider screens
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const perPage = wide ? 14 : 7
  // Kept in days (not page numbers) so rotating a phone doesn't jump to other dates
  const lastStart = Math.floor((DAYS_SHOWN - 1) / perPage) * perPage
  const safeStart = Math.min(Math.floor(startIdx / perPage) * perPage, lastStart)
  const days = Array.from({ length: perPage }, (_, i) => today + (safeStart + i) * DAY)
  const horizon = today + DAYS_SHOWN * DAY // no data from here on

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Fetch as soon as the browser is idle after load (the reply is tiny), or
    // when the section nears the screen, whichever comes first
    let started = false
    const start = () => {
      if (started) return
      started = true
      io.disconnect()
      fetchPublicQueue().then(setQ).catch(() => setFailed(true))
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) start()
    }, { rootMargin: '400px' })
    io.observe(el)
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const idle = w.requestIdleCallback ? w.requestIdleCallback(start, { timeout: 4000 }) : window.setTimeout(start, 2000)
    return () => {
      io.disconnect()
      if (w.cancelIdleCallback) w.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
    }
  }, [])

  const free = useMemo<FreeMap | null>(() => (q ? buildFree(q) : null), [q])
  const grid = useMemo(() => {
    if (!q || !free) return null
    return CAMERAS.map((c) => ({
      id: c.id as CameraId,
      name: c.shortName,
      cells: days.map((d): Cell =>
        d >= horizon ? { status: 'past' }
          : isProv ? provCellFor(q, free, c.id, d, today)
          : cellFor(q, free, c.id, d, now)),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, free, safeStart, perPage, isProv])
  const hasUnknown = Boolean(grid?.some((r) => r.cells.some((c) => c.status === 'unknown')))

  const first = days[0]
  const last = days[days.length - 1]
  const monthLabel = F_MONTH.format(new Date(first + 12 * HOUR)) === F_MONTH.format(new Date(last + 12 * HOUR))
    ? F_MONTH.format(new Date(first + 12 * HOUR))
    : `${new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', month: 'short' }).format(new Date(first + 12 * HOUR))} – ${new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', month: 'short', year: 'numeric' }).format(new Date(last + 12 * HOUR))}`

  return (
    <div ref={ref} className="bg-white rounded-[2rem] ring-1 ring-pink-900/[0.07] p-4 sm:p-6">
      {/* where: local and provincial rentals hold a camera differently */}
      <p className="text-sm font-semibold text-ink mb-2">สถานที่รับกล้อง</p>
      <div className="grid grid-cols-2 gap-1 bg-cream rounded-xl p-1" role="tablist" aria-label="พื้นที่เช่า">
        {(['local', 'provincial'] as const).map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={area === a}
            onClick={() => setArea(a)}
            className={`min-h-11 rounded-lg text-sm transition-colors ${area === a ? 'bg-white text-ink font-semibold shadow-sm' : 'text-ink/60'}`}
          >
            {a === 'local' ? 'ในเขต มมส.' : 'ส่งต่างจังหวัด'}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink/55 mt-1.5">
        {isProv
          ? `ค่าจัดส่ง ${PROVINCIAL_SHIPPING_FEE} บาท · เช่าขั้นต่ำ ${MIN_PROVINCIAL_DURATION_HOURS / 24} วัน · วันที่ในตาราง = วันที่ได้รับพัสดุ`
          : `รับที่ร้านไม่มีค่าใช้จ่าย หรือให้ร้านจัดส่ง ${LOCAL_DELIVERY_FEE} บาท/เที่ยว (${DELIVERY_HOURS_LABEL})`}
      </p>

      <div className="flex items-center justify-between mt-4 mb-3">
        <button
          onClick={() => setStartIdx(Math.max(0, safeStart - perPage))}
          disabled={safeStart === 0}
          className="w-10 h-10 flex items-center justify-center rounded-full text-pink-700 disabled:text-ink/20"
          aria-label="ช่วงก่อนหน้า"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-semibold text-ink" aria-live="polite">{monthLabel}</p>
        <button
          onClick={() => setStartIdx(Math.min(lastStart, safeStart + perPage))}
          disabled={safeStart === lastStart}
          className="w-10 h-10 flex items-center justify-center rounded-full text-pink-700 disabled:text-ink/20"
          aria-label="ช่วงถัดไป"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid gap-y-1.5" style={{ gridTemplateColumns: `4.5rem repeat(${perPage}, minmax(0, 1fr))` }}>
        {/* day header */}
        <span />
        {days.map((d) => (
          <div key={d} className={`text-center leading-tight rounded-md py-1 ${d === today ? 'bg-brass-light/40 text-ink font-semibold' : 'text-ink/55'}`}>
            <div className="text-[10px]">{F_WD.format(new Date(d + 12 * HOUR))}</div>
            <div className="text-xs tabular-nums">{Number(bkkDate(d).slice(8, 10))}</div>
          </div>
        ))}

        {/* model rows */}
        {(grid ?? CAMERAS.map((c) => ({ id: c.id, name: c.shortName, cells: null as Cell[] | null }))).map((row) => (
          <Row key={row.id} name={row.name} cells={row.cells} days={days} failed={failed} />
        ))}
      </div>

      {failed ? (
        <p className="mt-3 text-xs text-ink/60">
          ไม่สามารถโหลดข้อมูลคิวได้ในขณะนี้ กรุณาตรวจสอบคิวที่{' '}
          <Link href="/book?from=home" prefetch={false} className="text-pink-700 underline underline-offset-2">หน้าจอง</Link>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-[11px] text-ink/60">
            {[...(isProv ? (['free', 'full'] as const) : (['free', 'partial', 'full', 'closed'] as const)), ...(hasUnknown ? (['unknown'] as const) : [])].map((s) => (
              <span key={s} className="flex items-center gap-1.5"><i className={`w-3.5 h-3.5 rounded ${CELL[s]}`} />{LABEL[s]}</span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink/50">
            {isProv
              ? `ว่าง = เช่า ${MIN_PROVINCIAL_DURATION_HOURS / 24} วันได้`
              : 'ว่าง = ว่างทั้งวัน · ว่างบางช่วง = ว่างเฉพาะบางช่วงเวลา'}
          </p>
        </>
      )}
    </div>
  )
}

function Row({ name, cells, days, failed }: { name: string; cells: Cell[] | null; days: number[]; failed: boolean }) {
  return (
    <>
      <span className="text-xs font-medium text-ink/80 truncate self-center pr-1">{name.replace('IXY ', 'IXY ')}</span>
      {days.map((d, i) => {
        const c = cells?.[i]
        const base = 'h-9 sm:h-10 mx-0.5 rounded-md transition-colors'
        if (!c) return <span key={d} className={`${base} ${failed ? 'bg-white ring-1 ring-inset ring-pink-900/10' : 'bg-cream animate-pulse'}`} />
        const label = `${name} ${bkkDate(d)} ${LABEL[c.status]}`
        return (
          <span key={d} role="img" aria-label={label} title={LABEL[c.status]} className={`${base} ${CELL[c.status]} flex items-center justify-center`}>
            {c.status === 'free' && <Check size={16} strokeWidth={3} aria-hidden />}
          </span>
        )
      })}
    </>
  )
}
