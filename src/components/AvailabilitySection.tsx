'use client'
// Homepage "เช็กคิวว่าง". Kept deliberately light for iPhone Safari: no
// framer-motion, CSS-only transitions, loads its data only when scrolled near,
// and every availability check is a binary search over precomputed free
// stretches (buildFree), so a tap re-renders cheaply.
//
// Simple-first: area → day strip → length → (optional) time, with the answer
// (free models + price) right under it. The power tools (model filter, 30-day
// calendar, per-model hour bars, "find me a date") sit behind one toggle.
//
// What can be picked mirrors what /book accepts, so the hand-off never lands
// on a different slot: pickup on the hour (any hour), duration 6 h or whole
// days. Price = calcPrice, the same formula the booking page and server use.
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ChevronDown, Instagram, MessageCircle, Minus, Plus, Search, X } from 'lucide-react'
import { CameraId, PriceGroup, RentalArea } from '@/types'
import {
  CAMERAS, DELIVERY_HOURS_LABEL, INCLUDED_ACCESSORIES, LOCAL_DELIVERY_FEE, MIN_PROVINCIAL_DURATION_HOURS,
  PRICE_TABLES, PROVINCIAL_SHIPPING_FEE, PROVINCIAL_SHIP_LEAD_DAYS, calcPrice,
} from '@/lib/cameras'
import { FreeMap, PublicQueue, bkkHour, buildFree, fetchPublicQueue, fitsFast, startOfBkkDay } from '@/lib/publicQueue'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const DAYS_SHOWN = 30
const STRIP_DAYS = 7
const LINE_OA_MESSAGE = 'https://line.me/R/oaMessage/%40005vsebr/?'
// IG can't prefill a message, so the button copies it first, then opens the chat
const IG_DM = 'https://ig.me/m/miwvie_shop'
const UI_KEY = 'miwvie_avail_ui_v3'
const SEEN_KEY = 'miwvie_avail_seen' // sessionStorage: same visit → no "ครั้งก่อน" chip
const ALL_IDS = CAMERAS.map((c) => c.id as CameraId)
const BASIC_DURATIONS: Record<RentalArea, number[]> = { local: [6, 24, 48, 72], provincial: [72, 96, 120] }
const MORE_DURATIONS: Record<RentalArea, number[]> = { local: [96, 120, 144, 168], provincial: [144, 168] }
const DEFAULT_DURS: Record<RentalArea, number> = { local: 24, provincial: MIN_PROVINCIAL_DURATION_HOURS }
const OPEN_FROM = 10 // delivery hours; outside them it's self pickup/return
const OPEN_TO = 22
const SHOP_HOURS = Array.from({ length: OPEN_TO - OPEN_FROM + 1 }, (_, i) => OPEN_FROM + i)

// The cheaper price group gets a neutral "ราคาประหยัด" tag (only if groups differ)
const GROUPS = Array.from(new Set(CAMERAS.map((c) => c.priceGroup)))
const CHEAP_GROUP: PriceGroup | null = GROUPS.length > 1
  ? GROUPS.reduce((a, b) => (PRICE_TABLES[b].day1 < PRICE_TABLES[a].day1 ? b : a))
  : null

const F_DAY = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short' })
const F_WD = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short' })
const F_DM = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' })
const F_RANGE = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit' })
const pad = (n: number) => String(n).padStart(2, '0')
const bkkDate = (t: number) => new Date(t + 7 * HOUR).toISOString().slice(0, 10)
const dayLabel = (t: number) => F_DAY.format(new Date(t))
const timeLabel = (t: number) => `${pad(bkkHour(t))}:00`
const durLabel = (h: number) => (h < 24 ? `${h} ชม.` : `${h / 24} วัน`)
const shortName = (id: string) => CAMERAS.find((c) => c.id === id)!.shortName

type Status = 'free' | 'partial' | 'full' | 'unknown'
interface Saved { area: RentalArea; durs: Record<RentalArea, number>; hour: number; model: CameraId | 'all'; adv: boolean; day?: number }

export default function AvailabilitySection() {
  const ref = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState<PublicQueue | null>(null)
  const [failed, setFailed] = useState(false)
  const now = Date.now()
  const today = startOfBkkDay(now)
  const firstHourToday = Math.min(23, bkkHour(now) + 1)

  const [area, setArea] = useState<RentalArea>('local')
  const [durs, setDurs] = useState<Record<RentalArea, number>>(DEFAULT_DURS)
  const [model, setModel] = useState<CameraId | 'all'>('all')
  const [day, setDay] = useState(today + DAY) // tomorrow: the list is never empty on open
  const [hour, setHour] = useState(OPEN_FROM)
  const [advOpen, setAdvOpen] = useState(false)
  const [moreDur, setMoreDur] = useState(false)
  const [timeOpen, setTimeOpen] = useState(false)
  const [otherHours, setOtherHours] = useState(false)
  const [calOpen, setCalOpen] = useState(false)
  const [fullOpen, setFullOpen] = useState(false)
  const [showStarts, setShowStarts] = useState(false)
  const [igCopied, setIgCopied] = useState(false)
  const [restored, setRestored] = useState<string | null>(null)
  const [ready, setReady] = useState(false) // don't overwrite storage before restoring
  const hours = durs[area]
  const setHours = (h: number) => setDurs((d) => ({ ...d, [area]: h }))

  // Restore the last choice (localStorage). Show the "ครั้งก่อน" chip only on a
  // new visit, not when coming back from /book in the same tab session.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(UI_KEY) || 'null') as Saved | null
      const sameVisit = sessionStorage.getItem(SEEN_KEY) === '1'
      sessionStorage.setItem(SEEN_KEY, '1')
      if (s && s.durs && (s.area === 'local' || s.area === 'provincial')) {
        setArea(s.area)
        setDurs({ local: s.durs.local || 24, provincial: Math.max(MIN_PROVINCIAL_DURATION_HOURS, s.durs.provincial || 0) })
        if (s.hour >= 0 && s.hour <= 23) setHour(s.hour)
        if (s.model === 'all' || ALL_IDS.includes(s.model)) setModel(s.model)
        setAdvOpen(Boolean(s.adv))
        if (s.day && s.day >= today) setDay(s.day)
        const h = s.durs[s.area]
        if (h && h !== 24 && !BASIC_DURATIONS[s.area].includes(h)) setMoreDur(true)
        if (s.hour < OPEN_FROM || s.hour > OPEN_TO) setOtherHours(true)
        const changed = s.model !== 'all' || s.area !== 'local' || h !== 24
        if (!sameVisit && changed) {
          setRestored(`${s.area === 'provincial' ? 'ส่งต่างจังหวัด · ' : ''}${s.model === 'all' ? 'ทุกรุ่น' : shortName(s.model)} · ${durLabel(h)}`)
        }
      }
    } catch { /* ignore */ }
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(UI_KEY, JSON.stringify({ area, durs, hour, model, adv: advOpen, day } satisfies Saved)) } catch { /* ignore */ }
  }, [ready, area, durs, hour, model, advOpen, day])

  // Fetch only once the section is near the screen, so the hero isn't delayed
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let started = false
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || started) return
      started = true
      io.disconnect()
      fetchPublicQueue().then(setQ).catch(() => setFailed(true))
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const free = useMemo<FreeMap | null>(() => (q ? buildFree(q) : null), [q])
  const isProv = area === 'provincial'
  const earliestDay = isProv ? today + PROVINCIAL_SHIP_LEAD_DAYS * DAY : today
  const ids = model === 'all' ? ALL_IDS : [model]
  const days = useMemo(() => Array.from({ length: DAYS_SHOWN }, (_, i) => today + i * DAY), [today])
  // Day strip: from the first pickable day (skip today once it's basically over)
  const stripFrom = isProv ? earliestDay : bkkHour(now) >= 23 ? today + DAY : today
  const strip = useMemo(() => Array.from({ length: STRIP_DAYS }, (_, i) => stripFrom + i * DAY), [stripFrom])

  // Keep the picked time valid: not in the past, provincial far enough ahead
  const safeDay = Math.max(day, earliestDay)
  const safeHour = isProv ? 0 : safeDay === today ? Math.max(hour, firstHourToday) : hour
  const start = isProv ? safeDay : safeDay + safeHour * HOUR
  const end = start + hours * HOUR
  const pastToday = !isProv && safeDay === today && bkkHour(now) >= 23

  // Pickup hours offered: shop hours by default, the rest on request
  const shopOpts = SHOP_HOURS.filter((h) => safeDay !== today || h >= firstHourToday)
  const showOther = otherHours || safeHour < OPEN_FROM || safeHour > OPEN_TO || shopOpts.length === 0
  const hourOpts = (showOther ? Array.from({ length: 24 }, (_, h) => h) : SHOP_HOURS)
    .filter((h) => safeDay !== today || h >= firstHourToday)

  const check = (id: string, s: number, h = hours) =>
    free && q ? fitsFast(q, free, id, area, s, s + h * HOUR) : 'unknown'

  // Hours of a day a rental of the chosen length could start (local); for
  // provincial just the day itself
  const startsOn = (d: number) => {
    if (isProv) return [d]
    const from = d === today ? firstHourToday : 0
    return Array.from({ length: 24 - from }, (_, i) => d + (from + i) * HOUR)
  }

  // Calendar/strip shading for the chosen models AND length: free = fits at
  // every pickup hour 10–22, partial = fits at some hour, full = nowhere that day
  const statuses = useMemo(() => {
    const m = new Map<number, Status>()
    if (!q || !free) return m
    for (const d of days) {
      if (d < earliestDay) continue
      const starts = startsOn(d)
      let any = false
      let all = true
      let unknown = false
      for (const id of ids) {
        for (const s of starts) {
          const r = fitsFast(q, free, id, area, s, s + hours * HOUR)
          if (r === 'unknown') { unknown = true; continue }
          const inOpen = isProv || (bkkHour(s) >= OPEN_FROM && bkkHour(s) <= OPEN_TO)
          if (r === 'free') any = true
          else if (inOpen) all = false
        }
      }
      m.set(d, any ? (all && !unknown ? 'free' : 'partial') : unknown ? 'unknown' : 'full')
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, free, days, area, hours, model, earliestDay])

  // Every model at the chosen time (the filter only narrows what's shown)
  const allResults = useMemo(() => {
    if (!q || !free) return []
    return CAMERAS.map((c) => {
      const fit = check(c.id, start)
      return { c, fit, price: calcPrice(c.priceGroup, hours) + (isProv ? PROVINCIAL_SHIPPING_FEE : 0), again: fit === 'full' ? nextStart(c.id, start) : null }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, free, start, hours, area])
  const results = model === 'all' ? allResults : allResults.filter((r) => r.c.id === model)

  // The next start (during delivery hours first, then any hour) that fits
  function nextStart(id: string, after: number): number | null {
    if (!q) return null
    for (const pass of [0, 1]) {
      for (let d = startOfBkkDay(after); d < q.to; d += DAY) {
        for (const s of startsOn(d)) {
          if (s <= after) continue
          const h = bkkHour(s)
          if (!isProv && pass === 0 && (h < OPEN_FROM || h > OPEN_TO)) continue
          const r = check(id, s)
          if (r === 'unknown') break
          if (r === 'free') return s
        }
      }
    }
    return null
  }

  // "หาวันว่างให้": the first few days a rental of this length can start
  const suggestions = useMemo(() => {
    if (!showStarts || !q || !free) return []
    const out: { t: number; id: CameraId }[] = []
    for (let d = Math.max(today, earliestDay); d < q.to && out.length < 6; d += DAY) {
      let found: { t: number; id: CameraId } | null = null
      for (const s of startsOn(d)) {
        const h = bkkHour(s)
        if (!isProv && (h < OPEN_FROM || h > OPEN_TO)) continue
        for (const id of ids) if (check(id, s) === 'free') { found = { t: s, id }; break }
        if (found) break
      }
      if (found) out.push(found)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStarts, q, free, model, area, hours, earliestDay])

  // Per-model hour bar for the picked day (local): which pickup hours work
  const hourBars = useMemo(() => {
    if (!advOpen || isProv || !q || !free) return []
    return ids.map((id) => ({
      id,
      cells: Array.from({ length: 24 }, (_, h) => {
        const s = safeDay + h * HOUR
        return s < now ? 'past' : check(id, s)
      }),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advOpen, q, free, model, safeDay, hours, area])

  const okList = results.filter((r) => r.fit === 'free')
  const fullList = results.filter((r) => r.fit === 'full')
  const unknownList = results.filter((r) => r.fit === 'unknown')
  const allFull = allResults.length > 0 && allResults.every((r) => r.fit === 'full')

  // Nothing free at all → open the detailed tools once for this choice
  const autoKey = useRef('')
  useEffect(() => {
    const key = `${area}|${start}|${hours}`
    if (allFull && autoKey.current !== key) {
      autoKey.current = key
      setAdvOpen(true)
    }
  }, [allFull, area, start, hours])

  function goTo(t: number, id?: CameraId) {
    setDay(startOfBkkDay(t))
    if (!isProv) {
      setHour(bkkHour(t))
      if (bkkHour(t) < OPEN_FROM || bkkHour(t) > OPEN_TO) setOtherHours(true)
    }
    if (id && model !== 'all') setModel(id)
  }
  function switchArea(a: RentalArea) {
    setArea(a)
    setShowStarts(false)
    setFullOpen(false)
    const h = durs[a]
    setMoreDur(!BASIC_DURATIONS[a].includes(h))
  }
  function resetRestored() {
    setRestored(null)
    setArea('local'); setDurs(DEFAULT_DURS); setModel('all'); setDay(today + DAY); setHour(OPEN_FROM)
    setMoreDur(false); setOtherHours(false)
  }

  const basic = BASIC_DURATIONS[area]
  const more = MORE_DURATIONS[area]
  const inMore = !basic.includes(hours)
  const outsideHours = !isProv && (safeHour < OPEN_FROM || safeHour > OPEN_TO || bkkHour(end) < OPEN_FROM || bkkHour(end) > OPEN_TO)
  const bookHref = (id: string) =>
    `/book?camera=${id}&area=${area}&start=${encodeURIComponent(isProv ? bkkDate(start) : `${bkkDate(start)}T${pad(safeHour)}:00`)}&hours=${hours}&from=home`
  const waitText = `สนใจรอคิว ${(fullList.length ? fullList : results).map((r) => r.c.shortName).join(', ')} ${isProv ? 'ส่งต่างจังหวัด ' : ''}${F_RANGE.format(new Date(start))}${isProv ? '' : ` ${timeLabel(start)}`} – ${F_RANGE.format(new Date(end))}${isProv ? '' : ` ${timeLabel(end)}`}`
  const firstWeekday = new Date(today + 12 * HOUR).getUTCDay()
  const relDay = (t: number) => {
    const d = startOfBkkDay(t)
    return d === today ? 'วันนี้' : d === today + DAY ? 'พรุ่งนี้' : dayLabel(t)
  }
  const offStrip = !strip.includes(safeDay)

  const calendar = (
    <div>
      <p className="text-xs text-ink/60 mb-1.5">
        {isProv ? 'แตะวันที่อยากได้รับของ' : 'แตะวันที่อยากรับกล้อง'}
        {model !== 'all' && <> · สีคือคิวของ <b className="text-ink">{shortName(model)}</b></>}
      </p>
      <div className="grid grid-cols-7 text-center text-[11px] text-ink/50 mb-1" aria-hidden>
        {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1" aria-busy={!q && !failed}>
        {Array.from({ length: firstWeekday }, (_, i) => <span key={`pad${i}`} />)}
        {days.map((d) => (
          <DayCell
            key={d}
            d={d}
            label={dayLabel(d)}
            num={Number(bkkDate(d).slice(8, 10))}
            status={statuses.get(d)}
            loaded={Boolean(q)}
            selected={d === safeDay}
            disabled={d < earliestDay}
            onPick={setDay}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-ink/60">
        <span className="flex items-center gap-1"><i className="w-4 h-1.5 rounded-full bg-pink-700" />ว่างทั้งวัน</span>
        <span className="flex items-center gap-1"><i className="w-2 h-1.5 rounded-full bg-pink-700" />ว่างบางเวลา</span>
        <span className="flex items-center gap-1"><s>8</s> เต็มแล้ว</span>
        <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-white ring-1 ring-pink-900/15" />ยังเปิดดูไม่ได้</span>
        <span className="text-ink/45 w-full">สีขึ้นกับรุ่นและจำนวนวันที่เลือก</span>
      </div>
    </div>
  )

  return (
    <div ref={ref} className="bg-white rounded-[2rem] ring-1 ring-pink-900/[0.07] p-4 sm:p-6 space-y-5">
      {restored && (
        <button onClick={resetRestored} className="inline-flex items-center gap-1.5 min-h-9 rounded-full bg-cream px-3 text-xs text-ink/70" aria-label={`ใช้แบบครั้งก่อน ${restored} — แตะเพื่อล้าง`}>
          ใช้แบบครั้งก่อน: {restored} <X size={13} />
        </button>
      )}

      {/* 1 · area */}
      <div>
        <p className="text-sm font-semibold text-ink mb-2">รับกล้องที่ไหนคะ?</p>
        <div className="grid grid-cols-2 gap-1 bg-cream rounded-xl p-1" role="tablist" aria-label="พื้นที่เช่า">
          {(['local', 'provincial'] as const).map((a) => (
            <button
              key={a}
              role="tab"
              aria-selected={area === a}
              onClick={() => switchArea(a)}
              className={`min-h-11 rounded-lg text-sm font-medium transition-colors ${area === a ? 'bg-white text-ink shadow-sm' : 'text-ink/60'}`}
            >
              {a === 'local' ? 'ในเขต มมส.' : 'ส่งต่างจังหวัด'}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink/55 mt-1.5 min-h-[2rem]">
          {isProv
            ? `ส่งพัสดุไปให้ เช่าขั้นต่ำ ${MIN_PROVINCIAL_DURATION_HOURS / 24} วัน จองล่วงหน้า ${PROVINCIAL_SHIP_LEAD_DAYS} วัน ค่าส่งขาไป ${PROVINCIAL_SHIPPING_FEE}฿ รวมในราคาแล้ว ขากลับส่งคืนเองค่ะ`
            : `มารับเองที่ร้านฟรี หรือให้ร้านไปส่ง +${LOCAL_DELIVERY_FEE}฿/เที่ยว (${DELIVERY_HOURS_LABEL})`}
        </p>
      </div>

      {/* 2 · day */}
      <div>
        <p className="text-sm font-semibold text-ink mb-2">{isProv ? 'อยากได้ของวันไหนคะ?' : 'รับวันไหนดี?'}</p>
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1" role="group" aria-label="เลือกวัน">
          {strip.map((d) => (
            <StripCell
              key={d}
              d={d}
              top={d === today ? 'วันนี้' : d === today + DAY ? 'พรุ่งนี้' : F_WD.format(new Date(d))}
              bottom={F_DM.format(new Date(d))}
              status={statuses.get(d)}
              selected={d === safeDay}
              onPick={setDay}
            />
          ))}
          <button
            onClick={() => setCalOpen((v) => !v)}
            aria-expanded={calOpen}
            className={`shrink-0 min-h-14 rounded-xl px-3 text-xs border transition-colors ${offStrip ? 'bg-pink-700 text-cream border-pink-700' : 'border-pink-900/15 text-ink/70'}`}
          >
            {offStrip ? <>{F_DM.format(new Date(safeDay))}<br />เปลี่ยนวัน</> : calOpen ? 'ซ่อนปฏิทิน' : 'เลือกวันอื่น'}
          </button>
        </div>
        {calOpen && <div className="mt-3">{calendar}</div>}
      </div>

      {/* 3 · length */}
      <div>
        <p className="text-sm font-semibold text-ink mb-2">เช่ากี่วัน?</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="ระยะเวลา">
          {basic.map((h) => (
            <DurChip key={h} label={durLabel(h)} on={hours === h} onClick={() => { setHours(h); setMoreDur(false) }} />
          ))}
          <DurChip label={inMore ? `${durLabel(hours)} ▾` : 'นานกว่านี้'} on={inMore} open={moreDur} onClick={() => setMoreDur((v) => !v)} />
        </div>
        {moreDur && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {more.map((h) => <DurChip key={h} label={durLabel(h)} on={hours === h} onClick={() => setHours(h)} />)}
            <div className={`min-h-10 rounded-xl border flex items-center ${hours > 168 ? 'border-pink-700 bg-pink-50' : 'border-pink-900/15'}`}>
              <button onClick={() => setHours(Math.max(192, hours > 168 ? hours - 24 : 192))} className="w-9 h-10 flex items-center justify-center text-pink-700" aria-label="ลดจำนวนวัน">
                <Minus size={14} />
              </button>
              <button onClick={() => setHours(hours > 168 ? hours : 192)} className="text-sm tabular-nums px-1 text-ink/80">
                {hours > 168 ? `${hours / 24} วัน` : '8+ วัน'}
              </button>
              <button onClick={() => setHours(hours > 168 ? Math.min(hours + 24, 25 * 24) : 192)} className="w-9 h-10 flex items-center justify-center text-pink-700" aria-label="เพิ่มจำนวนวัน">
                <Plus size={14} />
              </button>
            </div>
          </div>
        )}
        <p className="text-xs text-ink/55 mt-1.5">
          {isProv ? `ขั้นต่ำ ${MIN_PROVINCIAL_DURATION_HOURS / 24} วัน นับจากวันที่ได้รับของค่ะ` : 'นับ 24 ชม. จากเวลาที่รับจริงค่ะ'}
        </p>
      </div>

      {/* summary + time */}
      <div className="rounded-xl bg-cream px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink tabular-nums">
            {isProv
              ? `ถึงมือ ${relDay(start)} · ส่งคืน ${relDay(end)} (${durLabel(hours)})`
              : `รับ ${relDay(start)} ${timeLabel(start)} · คืน ${relDay(end)} ${timeLabel(end)} (${durLabel(hours)})`}
          </p>
          {!isProv && (
            <button onClick={() => setTimeOpen((v) => !v)} aria-expanded={timeOpen} className="shrink-0 min-h-9 text-xs text-pink-700 font-medium">
              {timeOpen ? 'ซ่อน' : 'เปลี่ยนเวลา ›'}
            </button>
          )}
        </div>
        {!isProv && timeOpen && (
          <div className="mt-2 space-y-1.5">
            <label className="text-xs text-ink/60 flex items-center justify-between gap-2">
              <span>เวลารับ</span>
              <select
                value={safeHour}
                onChange={(e) => setHour(Number(e.target.value))}
                className="min-h-11 rounded-xl border border-pink-900/15 bg-white px-3 text-base text-ink tabular-nums"
                aria-label="เวลารับ"
              >
                {hourOpts.map((h) => (
                  <option key={h} value={h}>{pad(h)}:00{h < OPEN_FROM || h > OPEN_TO ? ' (มารับเองที่ร้าน)' : ''}</option>
                ))}
              </select>
            </label>
            {!showOther && (
              <button onClick={() => setOtherHours(true)} className="min-h-9 text-xs text-ink/60 underline underline-offset-2">
                เวลาอื่น (มารับเองที่ร้าน)
              </button>
            )}
          </div>
        )}
        {outsideHours && <p className="text-xs text-ink/55 mt-1">นอก {DELIVERY_HOURS_LABEL} ร้านไม่ได้ไปส่ง — มารับหรือคืนเองที่ร้านนะคะ</p>}
        {pastToday && <p className="text-xs text-ink/55 mt-1">วันนี้ใกล้หมดเวลาแล้ว เลือกวันอื่นได้เลยค่ะ</p>}
      </div>

      {/* results */}
      <div className="min-h-[14rem]">
        {failed ? (
          <div className="rounded-xl bg-cream p-4 text-sm text-ink/70">
            ตอนนี้เปิดคิวไม่ได้ ไปหน้าจองได้เลย ระบบเช็กให้ตอนเลือกวันค่ะ
            <Link href="/book?from=home" className="mt-2 flex items-center gap-1 text-pink-700 font-medium">ไปหน้าจอง <ArrowRight size={14} /></Link>
          </div>
        ) : !q ? (
          <div className="space-y-2" aria-live="polite">
            <p className="text-xs text-ink/50">กำลังเช็กคิวให้นะคะ…</p>
            {[0, 1, 2].map((i) => <div key={i} className="h-[4.75rem] rounded-xl bg-cream" />)}
          </div>
        ) : (
          <>
            {model !== 'all' && (
              <button onClick={() => setModel('all')} className="mb-2 inline-flex items-center gap-1 min-h-9 rounded-full bg-cream px-3 text-xs text-ink/70">
                แสดงเฉพาะ {shortName(model)} · ดูทุกรุ่น <X size={13} />
              </button>
            )}
            {okList.length > 0 && model === 'all' && (
              <p className="text-xs text-ink/55 mb-2">ไม่แน่ใจรุ่น? ทุกรุ่นโทน Y2K เหมือนกัน ต่างกันที่สีตัวกล้องค่ะ</p>
            )}
            {okList.length === 0 && fullList.length > 0 && (
              <p className="text-sm text-ink/70 mb-2">ช่วงนี้กล้องออกหมดแล้วค่ะ 🙏 ลองวันใกล้ๆ หรือให้เราหาวันว่างให้</p>
            )}
            <ul className="space-y-2">
              {okList.map(({ c, price }) => (
                <ResultRow
                  key={c.id}
                  name={c.shortName}
                  image={c.image}
                  colorways={c.colorways}
                  price={price}
                  prov={isProv}
                  cheap={c.priceGroup === CHEAP_GROUP}
                  href={bookHref(c.id)}
                />
              ))}
            </ul>
            {unknownList.length > 0 && (
              <div className="mt-2 rounded-xl bg-cream p-3 text-xs text-ink/65">
                ไกลเกินที่ดูได้ กดจองได้เลย ระบบจะเช็กให้อีกทีค่ะ
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {unknownList.map(({ c }) => (
                    <Link key={c.id} href={bookHref(c.id)} className="min-h-9 rounded-full px-3 border border-pink-700/30 text-pink-700 flex items-center">
                      จอง {c.shortName} ›
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {fullList.length > 0 && (
              <div className="mt-3">
                {okList.length > 0 && (
                  <button onClick={() => setFullOpen((v) => !v)} aria-expanded={fullOpen} className="min-h-9 text-xs text-ink/60">
                    {model === 'all' ? 'รุ่นอื่นไม่ว่างช่วงนี้' : 'ไม่ว่างช่วงนี้'} · {fullOpen ? 'ซ่อน' : 'ดูวันว่าง ›'}
                  </button>
                )}
                {(fullOpen || okList.length === 0) && (
                  <div className="mt-1 text-xs text-ink/60 space-y-1">
                    {fullList.map(({ c, again }) => (
                      <p key={c.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{c.shortName}</span>
                        {again ? (
                          <button onClick={() => goTo(again)} className="min-h-9 text-pink-700 font-medium shrink-0">
                            ว่างอีกที {dayLabel(again)}{isProv ? '' : ` ${timeLabel(again)}`} · ใช้เวลานี้ ›
                          </button>
                        ) : (
                          <span className="shrink-0">ไม่ว่างใน {DAYS_SHOWN} วันที่ดูได้</span>
                        )}
                      </p>
                    ))}
                    <div className="pt-2">
                      <p className="text-xs text-ink/60 mb-1.5">อยากรอคิวรุ่นนี้? ทักร้านได้เลย (LINE จะพิมพ์ข้อความให้)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href={`${LINE_OA_MESSAGE}${encodeURIComponent(waitText)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-11 rounded-xl border border-[#06C755]/40 text-[#05A647] text-sm font-medium flex items-center justify-center gap-1.5"
                        >
                          <MessageCircle size={16} /> ทัก LINE
                        </a>
                        <a
                          href={IG_DM}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => { navigator.clipboard?.writeText(waitText).then(() => setIgCopied(true)).catch(() => {}) }}
                          className="min-h-11 rounded-xl border border-pink-900/20 text-pink-700 text-sm font-medium flex items-center justify-center gap-1.5"
                        >
                          <Instagram size={16} /> ทัก IG
                        </a>
                      </div>
                      {igCopied && <p className="text-[11px] text-ink/50 mt-1.5">คัดลอกข้อความให้แล้ว วางในแชท IG ได้เลยค่ะ</p>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-ink/55 border-t border-pink-900/[0.08] pt-3">
        จองต้องใช้: บัตรประชาชน + โปรไฟล์ IG/FB · จ่ายเต็ม ไม่มีมัดจำ · ในกระเป๋ามี{INCLUDED_ACCESSORIES.join(' ')}
        <span className="block text-ink/40 mt-0.5">คิวอัปเดตทุก ~2 นาที ระบบเช็กซ้ำอีกครั้งตอนจองค่ะ</span>
      </p>

      {/* detailed tools */}
      <div className="border-t border-pink-900/[0.08] pt-1">
        <button
          onClick={() => setAdvOpen((v) => !v)}
          aria-expanded={advOpen}
          className="w-full min-h-11 flex items-center justify-between gap-2 text-sm text-ink/70"
        >
          <span>ดูแบบละเอียด <span className="text-ink/45 text-xs">(ปฏิทิน · เลือกรุ่น · เวลารายชั่วโมง)</span></span>
          <ChevronDown size={16} className={`transition-transform ${advOpen ? 'rotate-180' : ''}`} />
        </button>
        {advOpen && (
          <div className="pt-2 space-y-5">
            {/* model filter */}
            <div>
              <p className="text-xs text-ink/60 mb-1.5">รุ่น</p>
              <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1" role="group" aria-label="เลือกรุ่น">
                {(['all', ...ALL_IDS] as const).map((id) => (
                  <button
                    key={id}
                    onClick={() => { setModel(id); setShowStarts(false) }}
                    aria-pressed={model === id}
                    className={`shrink-0 min-h-10 rounded-full px-3.5 text-sm border transition-colors ${model === id ? 'bg-ink text-cream border-ink' : 'border-pink-900/15 text-ink/70'}`}
                  >
                    {id === 'all' ? 'ทุกรุ่น' : shortName(id)}
                  </button>
                ))}
              </div>
            </div>

            {!calOpen && calendar}

            {/* which pickup hours work that day, per model — tap to choose */}
            {hourBars.length > 0 && (
              <div className="space-y-1.5" aria-label="ช่วงเวลาที่รับได้ในวันที่เลือก">
                <p className="text-xs text-ink/60">เวลารับที่ได้ · {dayLabel(safeDay)}</p>
                <div className="flex justify-between text-[10px] text-ink/45 pl-16" aria-hidden>
                  <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
                </div>
                {hourBars.map(({ id, cells }) => (
                  <div key={id} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-[11px] text-ink/70 truncate">{shortName(id).replace('IXY ', '')}</span>
                    <div className="flex-1 flex h-6 rounded-md overflow-hidden ring-1 ring-pink-900/10">
                      {cells.map((st, h) => (
                        <button
                          key={h}
                          disabled={st !== 'free'}
                          onClick={() => { setHour(h); if (h < OPEN_FROM || h > OPEN_TO) setOtherHours(true) }}
                          aria-label={`${shortName(id)} รับ ${pad(h)}:00 ${st === 'free' ? 'ได้' : 'ไม่ได้'}`}
                          className={`flex-1 ${h === safeHour ? 'outline outline-2 outline-ink -outline-offset-2 z-10' : ''} ${
                            st === 'free' ? 'bg-pink-200 hover:bg-pink-300' : st === 'unknown' ? 'bg-cream' : 'bg-white'
                          } ${h % 6 === 0 ? 'border-l border-pink-900/10' : ''}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-ink/45 pl-16">แถบสี = เริ่มเช่า {durLabel(hours)} ตอนนั้นได้ · แตะเพื่อเลือกเวลา</p>
              </div>
            )}

            {/* find start dates for this length */}
            {q && (
              <div>
                <button
                  onClick={() => setShowStarts((v) => !v)}
                  className="w-full min-h-11 rounded-xl border border-pink-900/15 text-sm text-ink/80 flex items-center justify-center gap-1.5"
                >
                  <Search size={15} /> หาวันที่ว่างให้หน่อย ({model === 'all' ? 'รุ่นไหนก็ได้' : shortName(model)} · {durLabel(hours)})
                </button>
                {showStarts && (
                  suggestions.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {suggestions.map(({ t, id }) => (
                        <button key={t} onClick={() => goTo(t, id)} className="min-h-10 rounded-full px-3 text-xs border border-pink-700/30 text-pink-700 tabular-nums">
                          {dayLabel(t)}{isProv ? '' : ` ${timeLabel(t)}`}{model === 'all' ? ` · ${shortName(id).replace('IXY ', '')}` : ''}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-ink/60">ไม่เจอวันว่างสำหรับ {durLabel(hours)} ใน {DAYS_SHOWN} วันข้างหน้า — ลองลดจำนวนวันหรือทักร้านนะคะ</p>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const DurChip = ({ label, on, open, onClick }: { label: string; on: boolean; open?: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    aria-pressed={on}
    aria-expanded={open}
    className={`min-h-10 min-w-[3.25rem] rounded-xl px-3 text-sm border tabular-nums transition-colors ${on ? 'bg-pink-700 text-cream border-pink-700' : 'border-pink-900/15 text-ink/70'}`}
  >
    {label}
  </button>
)

const StripCell = memo(function StripCell({ d, top, bottom, status, selected, onPick }: {
  d: number
  top: string
  bottom: string
  status?: Status
  selected: boolean
  onPick: (d: number) => void
}) {
  return (
    <button
      onClick={() => onPick(d)}
      aria-pressed={selected}
      aria-label={`${top} ${bottom}${status ? ` ${STATUS_TEXT[status]}` : ''}`}
      className={`shrink-0 w-[3.75rem] min-h-14 rounded-xl border flex flex-col items-center justify-center text-xs tabular-nums transition-colors ${
        selected ? 'bg-pink-700 text-cream border-pink-700' : status === 'full' ? 'border-pink-900/10 text-ink/35' : 'border-pink-900/15 text-ink/80'
      }`}
    >
      <span className="font-medium">{top}</span>
      <span className={`text-[11px] ${selected ? 'text-cream/85' : 'text-ink/50'} ${status === 'full' && !selected ? 'line-through' : ''}`}>{bottom}</span>
      <span aria-hidden className={`mt-0.5 h-1 rounded-full ${status === 'free' || status === 'partial' ? (selected ? 'bg-cream' : 'bg-pink-700') : 'bg-transparent'} ${status === 'free' ? 'w-4' : 'w-2'}`} />
    </button>
  )
})

const CELL: Record<Status | 'loading' | 'blank', string> = {
  loading: 'bg-cream text-ink/40',
  blank: 'bg-white ring-1 ring-inset ring-pink-900/10 text-ink',
  free: 'bg-pink-50 text-ink',
  partial: 'bg-cream text-ink',
  full: 'bg-white text-ink/35 ring-1 ring-inset ring-ink/5',
  unknown: 'bg-white text-ink/50 ring-1 ring-inset ring-pink-900/10',
}
const STATUS_TEXT: Record<Status, string> = { free: 'ว่างทั้งวัน', partial: 'ว่างบางเวลา', full: 'เต็มแล้ว', unknown: 'ยังเปิดดูไม่ได้' }

const DayCell = memo(function DayCell({ d, label, num, status, loaded, selected, disabled, onPick }: {
  d: number
  label: string
  num: number
  status?: Status
  loaded: boolean
  selected: boolean
  disabled: boolean
  onPick: (d: number) => void
}) {
  return (
    <button
      onClick={() => onPick(d)}
      disabled={disabled}
      aria-label={`${label}${status ? ` ${STATUS_TEXT[status]}` : ''}`}
      aria-pressed={selected}
      className={`relative h-12 rounded-lg text-sm tabular-nums flex flex-col items-center justify-center transition-colors disabled:opacity-30 ${
        selected ? 'bg-pink-700 text-cream' : CELL[status ?? (loaded ? 'blank' : 'loading')]
      }`}
    >
      <span className={status === 'full' && !selected ? 'line-through' : ''}>{num}</span>
      {(status === 'free' || status === 'partial') && (
        <span aria-hidden className={`mt-0.5 h-1.5 rounded-full ${selected ? 'bg-cream' : 'bg-pink-700'} ${status === 'free' ? 'w-4' : 'w-2'}`} />
      )}
    </button>
  )
})

const ResultRow = memo(function ResultRow({ name, image, colorways, price, prov, cheap, href }: {
  name: string
  image: string
  colorways: { name: string; hex: string }[]
  price: number
  prov: boolean
  cheap: boolean
  href: string
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl ring-1 ring-pink-900/[0.08] p-2 min-h-[4.75rem]">
      <div className="relative w-14 h-14 shrink-0 rounded-lg bg-cream">
        <Image src={image} alt="" fill sizes="56px" className="object-contain p-1" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="flex items-center gap-1.5 flex-wrap">
          <span className="font-display text-base leading-tight">{name}</span>
          <span className="text-[10px] rounded-full bg-pink-50 text-pink-700 px-1.5 py-px">ว่าง</span>
          {cheap && <span className="text-[10px] rounded-full bg-cream text-ink/70 px-1.5 py-px">ราคาประหยัด</span>}
        </p>
        <p className="flex items-center gap-2 text-[11px] text-ink/60 mt-0.5">
          {colorways.map((cw) => (
            <span key={cw.name} className="flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-full ring-1 ring-ink/10" style={{ background: cw.hex }} />{cw.name}
            </span>
          ))}
        </p>
        <p className="text-xs text-ink/70 tabular-nums mt-0.5">
          <b className="text-ink">฿{price.toLocaleString('th-TH')}</b>
          {prov ? ' รวมค่าส่งขาไปแล้ว' : <> ค่าเช่า · <span className="text-ink/55">รับเองฟรี / ส่งถึงที่ +{LOCAL_DELIVERY_FEE}฿ ต่อเที่ยว</span></>}
        </p>
      </div>
      <Link href={href} className="min-h-11 shrink-0 rounded-xl bg-pink-700 text-cream text-sm font-medium px-3 flex items-center">
        จองเลย ›
      </Link>
    </li>
  )
})
