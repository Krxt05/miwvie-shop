'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import {
  Instagram,
  ArrowRight,
  ArrowUpRight,
  Plus,
  MapPin,
  Bike,
  Package,
  ClipboardList,
  MessageCircle,
  Banknote,
  Wallet,
  UserCheck,
  Clock,
} from 'lucide-react'
import {
  CAMERAS,
  PRICE_TABLES,
  ORIGINAL_PRICE_TABLES,
  EXTRA_DAY_RATE,
  PROVINCIAL_SHIPPING_FEE,
  MIN_PROVINCIAL_DURATION_HOURS,
  PROVINCIAL_SHIP_LEAD_DAYS,
  INCLUDED_ACCESSORIES,
  DELIVERY_HOURS_LABEL,
  SHOP_MAP_URL,
  LOCAL_DELIVERY_FEE,
  LINE_URL,
  DELIVERY_LOCATION,
} from '@/lib/cameras'
import { PriceTable } from '@/types'

// Loaded after the page is up (and only fetches once scrolled near), so the
// hero and first paint don't wait on it — the homepage had iPhone jank before.
const QueueHeatmap = dynamic(() => import('@/components/QueueHeatmap'), {
  ssr: false,
  loading: () => <div className="bg-white rounded-[2rem] ring-1 ring-pink-900/[0.07] min-h-[360px]" />,
})

const IG_URL = 'https://www.instagram.com/miwvie_shop/'

const MIN_PRICE = Math.min(...Object.values(PRICE_TABLES).map((t) => t.hourly6))
// The general "book now" buttons carry a query string like the camera-card
// links do (/book?camera=…). On iPhone Safari, entering via the bare /book URL
// froze ~1.3s at a time for the whole booking flow while the camera-card links
// stayed smooth; with this (plus /book no longer reading the URL while
// rendering) it's smooth on the owner's iPhone. Keep both.
const BOOK_HREF = '/book?from=home'

// 1-day price across the price groups, e.g. "150–190"
const DAY1 = Object.values(PRICE_TABLES).map((t) => t.day1)
const DAY1_RANGE = Math.min(...DAY1) === Math.max(...DAY1) ? `${DAY1[0]}` : `${Math.min(...DAY1)}–${Math.max(...DAY1)}`

const TOTAL_UNITS = CAMERAS.reduce((n, c) => n + c.quantity, 0)

const DURATIONS: { label: string; key: keyof PriceTable; days: number }[] = [
  { label: '6 ชม.', key: 'hourly6', days: 0.25 },
  { label: '1 วัน', key: 'day1', days: 1 },
  { label: '2 วัน', key: 'day2', days: 2 },
  { label: '3 วัน', key: 'day3', days: 3 },
  { label: '4 วัน', key: 'day4', days: 4 },
  { label: '5 วัน', key: 'day5', days: 5 },
  { label: '6 วัน', key: 'day6', days: 6 },
  { label: '7 วัน', key: 'day7', days: 7 },
]

// One-line summary shown above the (collapsed) price table, e.g. "กลุ่ม A 110–750฿"
const PRICE_SUMMARY = (['A', 'B'] as const).map((g) => {
  const v = DURATIONS.map((d) => PRICE_TABLES[g][d.key])
  return `กลุ่ม ${g} ${Math.min(...v)}–${Math.max(...v)}฿`
})

// Sticky chip nav on phones (anchor links only)
const SECTION_LINKS = [
  { href: '#cameras', label: 'กล้อง' },
  { href: '#availability', label: 'คิวว่าง' },
  { href: '#pricing', label: 'ราคา' },
  { href: '#pickup', label: 'รับกล้อง' },
  { href: '#faq', label: 'FAQ' },
]

// Sections sit under a sticky header: 56px bar + 56px chip row on phones, 64px on md+
const SCROLL_MT = 'scroll-mt-[120px] md:scroll-mt-20'

// One shot per model, in the order the shop wants them seen: 30s → 10s → 930 IS → 510 IS → 200.
const GALLERY = [
  { src: '/mood/ixy30s-1.jpg', cam: 'IXY 30s' },
  { src: '/mood/ixy10s-1.jpg', cam: 'IXY 10s' },
  { src: '/mood/ixy930is-1.jpg', cam: 'IXY 930 IS' },
  { src: '/mood/ixy510is-1.jpg', cam: 'IXY 510 IS' },
  { src: '/mood/ixy200-1.jpg', cam: 'IXY 200' },
]

const STEPS = [
  { title: 'เลือกวัน แล้วจอง', desc: 'ตรวจสอบคิวว่าง เลือกรุ่นและเวลารับ แล้วกรอกข้อมูลการจอง' },
  { title: 'โอนเต็ม ไม่มีมัดจำ', desc: 'สแกน PromptPay แนบสลิป พร้อมรูปบัตรประชาชน (ปิดเลขได้) + โปรไฟล์ IG/FB' },
  { title: 'รับกล้องไปถ่าย', desc: 'รับที่ร้านหรือให้ร้านจัดส่ง นับ 24 ชั่วโมงจากเวลารับจริง' },
]

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'รับ-คืนกล้องที่ไหน?',
    a: (
      <>
        รับ-คืนเองฟรีที่หอพักเมธาเรสสิเดนท์ 3 ซอยวุ่นวาย มมส.{' '}
        <a href={SHOP_MAP_URL} target="_blank" rel="noopener noreferrer" className="text-pink font-semibold underline underline-offset-2">
          เปิดแผนที่
        </a>{' '}
        หรือให้ร้านส่ง-รับถึงที่ใน มมส. ม.ใหม่ เที่ยวละ {LOCAL_DELIVERY_FEE}฿ (ช่วง {DELIVERY_HOURS_LABEL} น.)
      </>
    ),
  },
  {
    q: 'ในกระเป๋ามีอะไรบ้าง?',
    a: `ทุกการเช่าได้อุปกรณ์ครบชุด: ${INCLUDED_ACCESSORIES.join(' · ')}`,
  },
  {
    q: 'ต้องใช้เอกสารอะไรบ้าง?',
    a: 'รูปบัตรประชาชน (ปิดเลขบัตรได้) และภาพหน้าจอโปรไฟล์ IG หรือ Facebook ของผู้เช่า',
  },
  {
    q: 'นับเวลาเช่ายังไง?',
    a: 'นับ 24 ชั่วโมงจากเวลาที่รับกล้องจริง ไม่ได้นับตามวันปฏิทิน เช่น รับ 14:00 เช่า 1 วัน คืนวันถัดไป 14:00',
  },
  {
    q: 'ต้องวางมัดจำไหม?',
    a: 'ไม่มีมัดจำ ชำระค่าเช่าเต็มจำนวนผ่าน PromptPay แล้วส่งสลิปมาที่ IG @miwvie_shop หรือ LINE ร้าน',
  },
  {
    q: 'อยู่ต่างจังหวัดเช่าได้ไหม?',
    a: `ได้ ร้านจัดส่งทางพัสดุ ค่าส่งขาไป ${PROVINCIAL_SHIPPING_FEE}฿ ขากลับลูกค้าส่งคืนเอง เช่าขั้นต่ำ ${MIN_PROVINCIAL_DURATION_HOURS / 24} วัน และต้องจองล่วงหน้าอย่างน้อย ${PROVINCIAL_SHIP_LEAD_DAYS} วัน`,
  },
  {
    q: 'เช่าเกิน 7 วันคิดยังไง?',
    a: `คิดราคา 7 วัน แล้วบวกเพิ่มวันละ ${EXTRA_DAY_RATE.A}฿ (Group A) หรือ ${EXTRA_DAY_RATE.B}฿ (Group B)`,
  },
  {
    q: 'รีวิวรับส่วนลดยังไง?',
    a: 'หลังเช่าเสร็จ ส่งรูปรีวิวอย่างน้อย 4 รูปมาที่ IG @miwvie_shop หรือ LINE ร้าน รับโค้ดส่วนลด 10% ค่าเช่า ใช้ได้ตอนจองครั้งถัดไป',
  },
]

const PICKUP = [
  {
    icon: MapPin,
    title: 'รับ-คืนเองที่ร้าน',
    sub: 'หอพักเมธาเรสสิเดนท์ 3 ซอยวุ่นวาย มมส.',
    price: 'ฟรี',
    link: { href: SHOP_MAP_URL, label: 'แผนที่' },
  },
  {
    icon: Bike,
    title: 'ส่ง-รับถึงที่',
    sub: `ในเขต มมส. ม.ใหม่ · ${DELIVERY_HOURS_LABEL} น.`,
    price: `${LOCAL_DELIVERY_FEE}฿`,
    unit: '/เที่ยว',
  },
  {
    icon: Package,
    title: 'ส่งต่างจังหวัด',
    sub: `เช่าขั้นต่ำ ${MIN_PROVINCIAL_DURATION_HOURS / 24} วัน · จองล่วงหน้า ${PROVINCIAL_SHIP_LEAD_DAYS} วัน · ขากลับส่งคืนเอง`,
    price: `${PROVINCIAL_SHIPPING_FEE}฿`,
    unit: 'ขาไป',
  },
]

const HIDE_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'


export default function Home() {
  const [showBar, setShowBar] = useState(false)
  const checkerRef = useRef<HTMLDivElement>(null)

  // Mobile booking bar appears once the queue checker has scrolled up out of view
  useEffect(() => {
    const el = checkerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => {
      setShowBar(!e.isIntersecting && e.boundingClientRect.top < 0)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <main className="min-h-screen overflow-x-clip bg-cream text-ink">
      {/* ───────── Header (+ chip nav on phones) ───────── */}
      <header className="sticky top-0 z-40 bg-cream/95 md:bg-cream/80 md:backdrop-blur-lg border-b border-pink-900/10">
        <nav className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 md:h-16 max-w-6xl mx-auto">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <Image src="/logo.png" alt="" width={36} height={36} className="rounded-full shrink-0" />
            <span className="font-display text-xl font-bold tracking-wide text-pink-700 max-[379px]:hidden">MIWVIE</span>
          </Link>
          <div className="hidden md:flex items-center gap-7 text-sm text-ink/70">
            {SECTION_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-pink-700 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href={IG_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram @miwvie_shop"
              className="hidden sm:block p-2 rounded-full text-ink/60 hover:text-pink-700 transition-colors"
            >
              <Instagram size={20} />
            </a>
            <Link
              href="/my-bookings"
              aria-label="ประวัติการจอง"
              className="inline-flex items-center gap-1 rounded-full border border-pink-700/30 text-pink-700 text-xs sm:text-sm font-medium px-2.5 sm:px-3 py-1.5 sm:py-2 hover:bg-pink-700/5 transition-colors whitespace-nowrap"
            >
              <ClipboardList size={16} />
              ประวัติการจอง
            </Link>
            <Link
              href={BOOK_HREF}
              className="inline-flex items-center gap-1.5 bg-pink-700 text-cream text-sm font-medium rounded-full pl-4 pr-3 py-2 hover:bg-pink-600 transition-colors whitespace-nowrap"
            >
              จองคิว <ArrowRight size={15} />
            </Link>
          </div>
        </nav>
        {/* Phones: one evenly split row, every link the same width */}
        <div className="md:hidden px-4 pb-2.5 pt-0.5" aria-label="ไปที่หัวข้อ">
          <div className="grid grid-cols-5 rounded-full bg-white ring-1 ring-pink-900/10 p-1">
            {SECTION_LINKS.map((l, i) => (
              <a
                key={l.href}
                href={l.href}
                className={`relative h-9 flex items-center justify-center rounded-full text-[13px] text-ink/75 whitespace-nowrap active:bg-pink-50 ${
                  i > 0 ? "before:content-[''] before:absolute before:left-0 before:top-2.5 before:bottom-2.5 before:w-px before:bg-pink-900/10" : ''
                }`}
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </header>

      {/* ───────── Top: photo + headline ───────── */}
      <section className="px-4 sm:px-6 pt-4 sm:pt-10 pb-10 sm:pb-20 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6 lg:gap-x-10 items-center">
          {/* Visual: photo + a second print + the camera that took it (the owner's
              favourite part of the old hero), one slide per model — swipe or let it play */}
          <div className="min-w-0 lg:col-start-2">
            <div className="relative mx-auto w-full max-w-[400px] lg:max-w-[440px]">
              <HeroSlides />
              <div
                className="absolute z-10 top-[5%] left-[4%] w-24 h-24 rounded-full flex flex-col items-center justify-center text-pink-900 rotate-[-10deg] shadow-lg pointer-events-none"
                style={{ background: 'radial-gradient(circle at 35% 30%, #EBD39B, #C9A45C 60%, #A07D3B)' }}
              >
                <span className="text-[10px] font-semibold">รีวิวรับ</span>
                <span className="font-display text-3xl font-bold leading-none">10%</span>
                <span className="text-[8px] font-bold tracking-[0.25em] mt-0.5">OFF</span>
              </div>
            </div>
          </div>

          {/* Shop wordmark */}
          <div className="min-w-0 lg:col-start-1 lg:row-start-1 text-center lg:text-left">
            <p className="text-[11px] sm:text-xs tracking-[0.35em] uppercase text-brass-dark">Mahasarakham · Thailand</p>
            <h1 className="mt-2 sm:mt-3 leading-none">
              <span className="block font-display font-bold text-pink-700 text-[3.5rem] sm:text-7xl lg:text-8xl tracking-[0.04em]">MIWVIE</span>
              <span className="block font-display italic text-ink/80 text-2xl sm:text-4xl lg:text-[2.75rem] mt-1 sm:mt-2">camera rental</span>
              <span className="sr-only"> — เช่ากล้องดิจิตอล Canon IXY ใกล้ มมส.</span>
            </h1>
            <div className="flex items-center justify-center lg:justify-start gap-3 mt-4 sm:mt-6" aria-hidden>
              <span className="h-px w-10 bg-brass/60" />
              <span className="w-1.5 h-1.5 rotate-45 bg-brass" />
              <span className="h-px w-10 bg-brass/60" />
            </div>
            <p className="text-sm sm:text-base text-ink/65 mt-4 sm:mt-6">เช่ากล้องดิจิตอล Canon IXY ใกล้ มมส.</p>
          </div>
        </div>
      </section>

      {/* ───────── Cameras ───────── */}
      <section id="cameras" className={`px-4 sm:px-6 pb-12 sm:pb-24 max-w-6xl mx-auto ${SCROLL_MT}`}>
        <SectionHead eyebrow="The Collection" title="เลือกรุ่นที่ใช่" aside={`${CAMERAS.length} รุ่น · ${TOTAL_UNITS} ตัว`} />
        {/* Phones: 2 columns, an odd last card spans the row (photo beside
            text). Tablets: 3 + 2. Desktop: all 5 in one row. No gaps. */}
        <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-5 gap-3 md:gap-4">
          {CAMERAS.map((c, i) => {
            const wide = i === CAMERAS.length - 1 && CAMERAS.length % 2 === 1
            return (
            <Link
              key={c.id}
              href={`/book?camera=${c.id}`}
              className={`group min-w-0 flex ${wide ? 'col-span-2 flex-row md:flex-col' : 'flex-col'} ${i < 3 ? 'md:col-span-2' : 'md:col-span-3'} lg:col-span-1 bg-white rounded-2xl overflow-hidden ring-1 ring-pink-900/[0.07] hover:ring-pink-700/30 hover:shadow-[0_20px_40px_-20px_rgba(69,18,31,0.35)] transition-all duration-300`}
            >
              <div
                className={`relative ${wide ? 'w-1/2 shrink-0 md:w-auto' : ''} aspect-square md:aspect-auto md:h-56 lg:h-auto lg:aspect-[4/5] flex items-center justify-center`}
                style={{ background: `radial-gradient(70% 60% at 50% 55%, ${c.color}26, transparent 75%), #FBF7F4` }}
              >
                <Image
                  src={c.image}
                  alt={c.name}
                  fill
                  sizes="(min-width:1024px) 220px, (min-width:768px) 50vw, 48vw"
                  className="object-contain p-4 sm:p-6 drop-shadow-[0_14px_16px_rgba(46,12,21,0.3)] group-hover:scale-[1.06] group-hover:-rotate-2 transition-transform duration-500"
                />
                {c.quantity > 1 && (
                  <span className="absolute top-2.5 right-2.5 bg-pink-700 text-cream rounded-full px-2 py-0.5 text-[11px] font-medium">
                    {c.quantity} ตัว
                  </span>
                )}
              </div>
              <div className="p-3 sm:p-4 flex flex-col flex-1 min-w-0">
                <p className="font-display text-lg sm:text-xl leading-tight">{c.shortName}</p>
                <div className="flex items-center gap-1.5 mt-1.5" aria-label={`สี ${c.colorways.map((x) => x.name).join(' ')}`}>
                  {c.colorways.map((x) => (
                    <span key={x.name} title={x.name} className="w-3 h-3 rounded-full ring-1 ring-black/10" style={{ background: x.hex }} />
                  ))}
                  <span className="text-xs text-ink/50 ml-1 truncate">{c.colorways.map((x) => x.name).join(' · ')}</span>
                </div>
                <div className="mt-auto pt-3 flex items-end justify-between">
                  <p>
                    <span className="text-base sm:text-lg font-semibold">{PRICE_TABLES[c.priceGroup].day1}฿</span>
                    <span className="text-xs text-ink/50"> /วัน</span>
                  </p>
                  <span className="w-8 h-8 rounded-full bg-pink-50 text-pink-700 flex items-center justify-center group-hover:bg-pink-700 group-hover:text-cream transition-colors">
                    <ArrowUpRight size={16} />
                  </span>
                </div>
              </div>
            </Link>
            )
          })}
        </div>
      </section>

      {/* ───────── Queue checker + key facts ───────── */}
      <section id="availability" className={`px-4 sm:px-6 pb-12 sm:pb-24 max-w-6xl mx-auto ${SCROLL_MT}`}>
        <SectionHead eyebrow="Availability" title="ตรวจสอบคิว" aside="ดูวันว่างของกล้องแต่ละรุ่น" />
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6 lg:gap-x-10 items-start">
          <div ref={checkerRef} className="min-w-0 min-h-[360px]">
            <QueueHeatmap />
          </div>

          <aside className="min-w-0 lg:sticky lg:top-24">
            <div className="bg-white rounded-2xl ring-1 ring-pink-900/[0.07] p-4 sm:p-5">
              <h2 className="font-semibold text-ink">ข้อมูลสำคัญก่อนเช่า</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 mt-4 text-sm">
                <Fact icon={Banknote} title={`เริ่มต้น ${MIN_PRICE} บาท / 6 ชั่วโมง`} sub={`1 วัน ${DAY1_RANGE} บาท`} />
                <Fact icon={Wallet} title="ชำระเต็มจำนวน" sub="ไม่มีมัดจำ" />
                <Fact
                  icon={MapPin}
                  title={`รับ-คืนที่${DELIVERY_LOCATION}`}
                  sub={<>ซ.วุ่นวาย มมส. · <a href={SHOP_MAP_URL} target="_blank" rel="noopener noreferrer" className="text-pink-700 underline underline-offset-2">ดูแผนที่</a></>}
                />
                <Fact icon={UserCheck} title="เอกสารที่ใช้" sub="บัตรประชาชน และโปรไฟล์ IG หรือ Facebook" />
                <div className="col-span-2">
                  <Fact icon={Clock} title="นับ 24 ชั่วโมงจากเวลารับกล้องจริง" sub={`ส่งถึงที่ ${LOCAL_DELIVERY_FEE} บาท/เที่ยว (${DELIVERY_HOURS_LABEL} น.)`} />
                </div>
              </dl>
              <div className="mt-4 pt-3 border-t border-pink-900/[0.08] flex flex-col gap-1 text-sm">
                <Link href="/my-bookings" className="min-h-11 flex items-center justify-between text-pink-700 font-medium">
                  <span className="flex items-center gap-2"><ClipboardList size={16} /> เคยจองแล้ว? ดูการจองของฉัน</span>
                  <ArrowRight size={15} />
                </Link>
                <p className="text-ink/60">
                  สอบถามเพิ่มเติม:{' '}
                  <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="text-pink-700 underline underline-offset-2">LINE</a>
                  {' · '}
                  <a href={IG_URL} target="_blank" rel="noopener noreferrer" className="text-pink-700 underline underline-offset-2">IG @miwvie_shop</a>
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* ───────── Price table ───────── */}
      <section id="pricing" className={`px-4 sm:px-6 pb-12 sm:pb-24 max-w-6xl mx-auto ${SCROLL_MT}`}>
        <SectionHead eyebrow="Pricing" title="ราคาเช่า" />
        {/* Full table, collapsed by default ("เช็กคิวว่าง" shows the price for the chosen dates) */}
        <details className="group bg-white rounded-2xl ring-1 ring-pink-900/[0.07]">
          <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-5 sm:px-6 py-4 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-sm sm:text-base font-medium">
                {PRICE_SUMMARY.join(' · ')} · ค่าส่ง {LOCAL_DELIVERY_FEE}฿/เที่ยว
              </span>
              <span className="block text-xs text-ink/50 mt-0.5">
                <span className="group-open:hidden">แตะดูตารางราคาทั้งหมด</span>
                <span className="hidden group-open:inline">ส่งต่างจังหวัด +{PROVINCIAL_SHIPPING_FEE}฿ (ขาไป)</span>
              </span>
            </span>
            <Plus size={18} className="text-pink-700 shrink-0 transition-transform group-open:rotate-45" />
          </summary>
          <div className="px-4 sm:px-6 pb-6 overflow-x-auto">
            <table className="w-full text-right text-sm sm:text-base">
              <thead>
                <tr className="border-b border-ink/15 align-bottom">
                  <th className="text-left font-normal text-ink/50 py-2">ระยะเวลา</th>
                  {(['A', 'B'] as const).map((g) => (
                    <th key={g} className="py-2 pl-4 font-normal">
                      <span className="block text-[11px] font-semibold tracking-[0.15em] text-pink-700">GROUP {g}</span>
                      <span className="block text-xs text-ink/50">
                        {CAMERAS.filter((c) => c.priceGroup === g).map((c) => c.shortName.replace('IXY ', '')).join(' · ')}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {DURATIONS.map((d) => (
                  <tr key={d.key}>
                    <td className="text-left py-2.5">{d.label}</td>
                    {(['A', 'B'] as const).map((g) => (
                      <td key={g} className="py-2.5 pl-4 whitespace-nowrap">
                        <span className="text-ink/30 text-xs line-through mr-2">{ORIGINAL_PRICE_TABLES[g][d.key]}</span>
                        <span className="font-semibold">{PRICE_TABLES[g][d.key]}฿</span>
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td className="text-left py-2.5 text-ink/60">เกิน 7 วัน</td>
                  {(['A', 'B'] as const).map((g) => (
                    <td key={g} className="py-2.5 pl-4 text-ink/60 whitespace-nowrap">+{EXTRA_DAY_RATE[g]}฿/วัน</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </details>
        <p className="text-sm text-ink/60 mt-3">ส่งรูปรีวิวอย่างน้อย 4 รูป รับโค้ดส่วนลด 10% สำหรับการเช่าครั้งถัดไป</p>
      </section>

      {/* ───────── Pickup options ───────── */}
      <section id="pickup" className={`px-4 sm:px-6 pb-12 sm:pb-24 max-w-6xl mx-auto ${SCROLL_MT}`}>
        <SectionHead eyebrow="Pickup & Delivery" title="รับกล้องได้ 3 แบบ" />
        <ul className="bg-white rounded-2xl ring-1 ring-pink-900/[0.07] divide-y divide-ink/[0.06] md:grid md:grid-cols-3 md:divide-y-0 md:divide-x">
          {PICKUP.map((o, i) => {
            const Icon = o.icon
            return (
              <li key={o.title} className="flex items-center gap-3.5 px-4 sm:px-6 py-3.5 sm:py-5">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${i === 0 ? 'bg-pink-700 text-cream' : 'bg-cream text-pink-700'}`}>
                  <Icon size={19} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[15px]">
                    {o.title}
                    {o.link && (
                      <a
                        href={o.link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-0.5 text-xs font-medium text-pink-700 underline underline-offset-2"
                      >
                        {o.link.label} <ArrowUpRight size={12} />
                      </a>
                    )}
                  </p>
                  <p className="text-xs text-ink/55 leading-snug mt-0.5">{o.sub}</p>
                </div>
                <p className="text-right shrink-0 leading-tight">
                  <span className={`font-display text-xl font-bold ${i === 0 ? 'text-pink-700' : ''}`}>{o.price}</span>
                  {o.unit && <span className="block text-[11px] text-ink/50">{o.unit}</span>}
                </p>
              </li>
            )
          })}
        </ul>
      </section>

      {/* ───────── Gallery ───────── */}
      <section className="px-4 sm:px-6 pb-12 sm:pb-24 max-w-6xl mx-auto">
        <SectionHead
          eyebrow="Shot on IXY"
          title="ภาพจากกล้องจริง"
          aside={
            <a href={IG_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-pink-700 hover:underline underline-offset-4">
              ดูเพิ่มใน IG <ArrowUpRight size={14} />
            </a>
          }
        />
        <div className={`-mx-4 px-4 flex gap-2 sm:gap-3 overflow-x-auto snap-x snap-mandatory md:mx-0 md:px-0 md:grid md:grid-cols-5 md:overflow-visible ${HIDE_SCROLLBAR}`}>
          {GALLERY.map((g) => (
            <figure key={g.src} className="group relative snap-start shrink-0 w-[40%] md:w-auto aspect-[3/4] overflow-hidden rounded-xl bg-pink-100">
              <Image
                src={g.src}
                alt={`ภาพถ่ายจาก ${g.cam}`}
                fill
                sizes="(min-width:768px) 20vw, 40vw"
                className="object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <figcaption className="absolute bottom-0 inset-x-0 p-2.5 bg-gradient-to-t from-black/50 to-transparent text-white text-xs font-medium">
                {g.cam}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section id="how" className={`px-4 sm:px-6 pb-12 sm:pb-24 max-w-6xl mx-auto ${SCROLL_MT}`}>
        <SectionHead eyebrow="How it works" title="จองยังไง?" />
        <ol className="grid md:grid-cols-3 gap-4 md:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex md:block gap-4">
              <span className="font-display text-3xl md:text-5xl text-pink-700/90 leading-none w-10 shrink-0">0{i + 1}</span>
              <div>
                <h3 className="font-semibold text-base md:text-lg md:mt-3">{s.title}</h3>
                <p className="text-sm text-ink/60 mt-1 leading-relaxed">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className={`px-4 sm:px-6 pb-12 sm:pb-20 max-w-6xl mx-auto ${SCROLL_MT}`}>
        <div className="grid lg:grid-cols-[1fr_1.6fr] gap-6 lg:gap-16">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-brass-dark">FAQ</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold mt-2 sm:mt-3">คำถามที่พบบ่อย</h2>
          </div>
          <div className="divide-y divide-ink/10 border-y border-ink/10">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group py-4 sm:py-5">
                <summary className="flex items-center justify-between gap-6 cursor-pointer list-none font-medium text-base sm:text-lg [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="w-8 h-8 rounded-full ring-1 ring-ink/15 flex items-center justify-center shrink-0 group-open:bg-pink-700 group-open:ring-pink-700 group-open:text-cream transition-colors">
                    <Plus size={16} className="transition-transform group-open:rotate-45" />
                  </span>
                </summary>
                <p className="text-ink/65 leading-relaxed mt-3 pr-12">{a}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Ask first */}
        <div className="mt-8 sm:mt-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-white ring-1 ring-pink-900/[0.07] px-5 py-4">
          <p className="font-medium">
            สอบถามเพิ่มเติม
          </p>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <a
              href={LINE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 min-h-11 rounded-full bg-[#06C755] text-white text-sm font-medium px-5"
            >
              <MessageCircle size={16} /> LINE
            </a>
            <a
              href={IG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 min-h-11 rounded-full border border-ink/15 text-sm font-medium px-5 hover:border-pink-700 hover:text-pink-700 transition-colors"
            >
              <Instagram size={16} /> Instagram
            </a>
          </div>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="bg-[#22141A] text-cream/60 pb-24 md:pb-0">
        <div className="px-4 sm:px-6 py-10 sm:py-12 max-w-6xl mx-auto grid sm:grid-cols-[1.5fr_1fr_1fr] gap-6 sm:gap-8 text-sm">
          <div>
            <div className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="" width={32} height={32} className="rounded-full" />
              <span className="font-display text-xl text-cream">MIWVIE SHOP</span>
            </div>
            <p className="mt-3 leading-relaxed">เช่ากล้องดิจิตอล Canon IXY<br />มหาสารคาม · มมส.</p>
          </div>
          <div>
            <p className="text-cream/90 font-medium mb-3">ติดต่อ</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <a href={IG_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-cream transition-colors">
                <Instagram size={15} /> @miwvie_shop
              </a>
              <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-cream transition-colors">
                <MessageCircle size={15} /> LINE
              </a>
            </div>
          </div>
          <div>
            <p className="text-cream/90 font-medium mb-3">จุดรับ-คืน</p>
            <a href={SHOP_MAP_URL} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 hover:text-cream transition-colors">
              <MapPin size={15} className="mt-0.5 shrink-0" /> หอพักเมธาเรสสิเดนท์ 3 ซอยวุ่นวาย มมส.
            </a>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 sm:px-6 py-5 max-w-6xl mx-auto text-xs text-cream/40">
          © {new Date().getFullYear()} Miwvie Shop Digital Rental
        </div>
      </footer>

      {/* ───────── Mobile booking bar ───────── */}
      <div
        data-mobile-bar
        className={`md:hidden fixed bottom-0 inset-x-0 z-40 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform duration-300 ${
          showBar ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 bg-ink/95 rounded-2xl pl-4 pr-2 py-2 shadow-2xl">
          <p className="text-cream text-sm whitespace-nowrap">
            เริ่ม <b className="text-brass-light">{MIN_PRICE}฿</b>
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <a href="#availability" className="inline-flex items-center min-h-11 bg-cream text-ink font-medium text-sm rounded-xl px-4">
              คิวว่าง
            </a>
            <Link href={BOOK_HREF} className="inline-flex items-center min-h-11 bg-pink-600 text-cream font-semibold text-sm rounded-xl px-5">
              จองเลย
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

function SectionHead({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1.5 sm:gap-3 mb-5 sm:mb-10">
      <div>
        <p className="text-xs tracking-[0.2em] uppercase text-brass-dark">{eyebrow}</p>
        <h2 className="font-display text-[1.75rem] sm:text-4xl font-bold mt-1.5 sm:mt-3">{title}</h2>
      </div>
      {aside && <div className="text-sm text-ink/55">{aside}</div>}
    </div>
  )
}

function Fact({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 min-w-0">
      <Icon size={18} className="text-pink-700 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <dt className="font-medium text-ink leading-snug">{title}</dt>
        {sub && <dd className="text-ink/60 text-xs mt-0.5 leading-snug">{sub}</dd>}
      </div>
    </div>
  )
}

// Hero slides: same arched photo + polaroid + camera composition for every
// model. Native scroll-snap does the swiping; a gentle auto-advance runs only
// while the hero is on screen and stops for good once the visitor swipes.
const HERO_SLIDES = [
  { cam: 'IXY 30s', arch: '/mood/ixy30s-3.jpg', print: '/mood/ixy30s-2.jpg', body: '/cameras/ixy30s-new.png', w: 522 },
  { cam: 'IXY 10s', arch: '/mood/ixy10s-1.jpg', print: '/mood/ixy10s-2.jpg', body: '/cameras/ixy10s-new.png', w: 266 },
  { cam: 'IXY 930 IS', arch: '/mood/ixy930is-1.jpg', print: '/mood/ixy930is-2.jpg', body: '/cameras/ixy930is-new.png', w: 526 },
  { cam: 'IXY 510 IS', arch: '/mood/ixy510is-1.jpg', print: '/mood/ixy510is-2.jpg', body: '/cameras/ixy510is-new.png', w: 267 },
  { cam: 'IXY 200', arch: '/mood/ixy200-1.jpg', print: '/mood/ixy200-2.jpg', body: '/cameras/ixy200-new.png', w: 253 },
]
const HERO_AUTOPLAY_MS = 4500

function HeroSlides() {
  const track = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(0)
  const idxRef = useRef(0)
  const touched = useRef(false)

  const go = (i: number) => {
    const el = track.current
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  useEffect(() => {
    const el = track.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const i = Math.max(0, Math.min(HERO_SLIDES.length - 1, Math.round(el.scrollLeft / el.clientWidth)))
        idxRef.current = i
        setIdx(i)
      })
    }
    const stop = () => { touched.current = true }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('pointerdown', stop, { passive: true })
    el.addEventListener('touchstart', stop, { passive: true })
    el.addEventListener('wheel', stop, { passive: true })

    // Auto-advance: on screen, tab visible, no reduced-motion, not yet touched
    let visible = false
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0.5 })
    io.observe(el)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = reduce ? 0 : window.setInterval(() => {
      if (!visible || touched.current || document.hidden) return
      go((idxRef.current + 1) % HERO_SLIDES.length)
    }, HERO_AUTOPLAY_MS)

    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('pointerdown', stop)
      el.removeEventListener('touchstart', stop)
      el.removeEventListener('wheel', stop)
      cancelAnimationFrame(raf)
      io.disconnect()
      if (timer) window.clearInterval(timer)
    }
  }, [])

  return (
    <div>
      {/* Track sticks out well past the photo on every side but the top, so
          the soft shadows, tilted print and camera aren't cut off by the
          scroll box (on phones the screen edge clips it instead) */}
      <div
        ref={track}
        className={`-mx-16 px-0 pb-24 -mb-16 flex overflow-x-auto snap-x snap-mandatory overscroll-x-contain ${HIDE_SCROLLBAR}`}
        aria-roledescription="carousel"
        aria-label="ภาพถ่ายจากกล้องแต่ละรุ่น"
      >
        {HERO_SLIDES.map((sl, i) => (
          <div key={sl.cam} className="shrink-0 w-full snap-start px-16" aria-roledescription="slide" aria-label={`${i + 1} จาก ${HERO_SLIDES.length}: ${sl.cam}`}>
            <div className="relative aspect-[4/5]">
              <div className="absolute inset-y-0 right-0 w-[78%] rounded-t-full overflow-hidden shadow-[0_30px_60px_-20px_rgba(69,18,31,0.45)] ring-1 ring-pink-900/10">
                <Image src={sl.arch} alt={`ภาพถ่ายจากกล้อง ${sl.cam}`} fill priority={i === 0} sizes="(min-width:1024px) 360px, 80vw" className="object-cover" />
              </div>
              <div className="absolute left-0 bottom-[14%] w-[42%] bg-white p-1.5 pb-6 rotate-[-6deg] shadow-[0_20px_40px_-12px_rgba(69,18,31,0.4)]">
                <div className="relative aspect-[3/4]">
                  <Image src={sl.print} alt={`ภาพถ่ายจากกล้อง ${sl.cam}`} fill sizes="180px" className="object-cover" />
                </div>
                <p className="absolute bottom-1 left-0 right-0 text-center font-display italic text-[11px] text-ink/60">shot on {sl.cam}</p>
              </div>
              <Image
                src={sl.body}
                alt=""
                width={sl.w}
                height={460}
                className="absolute -bottom-6 right-[-4%] h-auto drop-shadow-[0_18px_22px_rgba(46,12,21,0.45)]"
                style={{ width: `${(46 * sl.w) / 522}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-1.5 -mt-1" role="group" aria-label="เลือกรุ่น">
        {HERO_SLIDES.map((sl, i) => (
          <button
            key={sl.cam}
            onClick={() => { touched.current = true; go(i) }}
            aria-label={sl.cam}
            aria-current={i === idx}
            className="h-6 flex items-center px-0.5"
          >
            <span className={`block h-1.5 rounded-full transition-all ${i === idx ? 'w-6 bg-pink-700' : 'w-1.5 bg-pink-900/20'}`} />
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-ink/50 mt-0.5" aria-live="polite">{HERO_SLIDES[idx].cam}</p>
    </div>
  )
}
