'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import {
  Instagram,
  ArrowRight,
  ArrowUpRight,
  Plus,
  Clock,
  Banknote,
  UserCheck,
  MapPin,
  Bike,
  Package,
  BatteryFull,
  PlugZap,
  Briefcase,
  MemoryStick,
  Usb,
  Backpack,
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
} from '@/lib/cameras'
import { getAllCamerasAvailability } from '@/lib/api'
import { CameraId, PriceTable } from '@/types'

const IG_URL = 'https://www.instagram.com/miwvie_shop/'
const WINE_BG = 'radial-gradient(120% 100% at 80% 0%, #8E3A4C 0%, #6E1F31 45%, #45121F 100%)'

const MIN_PRICE = Math.min(...Object.values(PRICE_TABLES).map((t) => t.hourly6))
const TOTAL_UNITS = CAMERAS.reduce((n, c) => n + c.quantity, 0)

const ACCESSORY_ICONS = [BatteryFull, PlugZap, Briefcase, MemoryStick, Usb, Backpack]

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

// Ordered by how much the shop wants each model seen: 30s → 10s → 930 IS → 510 IS → 200.
// The first one runs large.
const GALLERY = [
  { src: '/mood/ixy30s-1.jpg', cam: 'IXY 30s' },
  { src: '/mood/ixy30s-2.jpg', cam: 'IXY 30s' },
  { src: '/mood/ixy30s-4.jpg', cam: 'IXY 30s' },
  { src: '/mood/ixy10s-1.jpg', cam: 'IXY 10s' },
  { src: '/mood/ixy10s-3.jpg', cam: 'IXY 10s' },
  { src: '/mood/ixy930is-1.jpg', cam: 'IXY 930 IS' },
  { src: '/mood/ixy930is-3.jpg', cam: 'IXY 930 IS' },
  { src: '/mood/ixy510is-1.jpg', cam: 'IXY 510 IS' },
  { src: '/mood/ixy200-1.jpg', cam: 'IXY 200' },
]

const STEPS = [
  { title: 'เลือกกล้อง & เวลา', desc: 'ดูคิวว่างแบบเรียลไทม์ เลือกวันและเวลารับได้เลย' },
  { title: 'กรอกข้อมูล', desc: 'แนบรูปบัตรประชาชน (ปิดเลขได้) + แคปโปรไฟล์ IG/FB' },
  { title: 'โอน & ส่งสลิป', desc: 'สแกน PromptPay เต็มจำนวน ไม่มีมัดจำ แล้วส่งสลิปทาง IG' },
  { title: 'รับกล้องไปถ่าย', desc: 'รับเองฟรี หรือให้ร้านส่งถึงที่ เริ่มนับ 24 ชม. จากเวลารับจริง' },
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
    q: 'ต้องใช้เอกสารอะไรบ้าง?',
    a: 'รูปบัตรประชาชน (ปิดเลขบัตรได้) และแคปหน้าโปรไฟล์ IG หรือ Facebook ที่ยืนยันได้ว่าเป็นคนเดียวกัน',
  },
  {
    q: 'นับเวลาเช่ายังไง?',
    a: 'นับ 24 ชั่วโมงจากเวลาที่รับกล้องจริง ไม่ได้นับตามวันปฏิทิน เช่น รับ 14:00 เช่า 1 วัน คืนวันถัดไป 14:00',
  },
  {
    q: 'ต้องวางมัดจำไหม?',
    a: 'ไม่มีมัดจำ ชำระค่าเช่าเต็มจำนวนผ่าน PromptPay แล้วส่งสลิปมาที่ IG @miwvie_shop',
  },
  {
    q: 'อยู่ต่างจังหวัดเช่าได้ไหม?',
    a: `ได้ ร้านส่งพัสดุไปให้ ค่าส่งขาไป ${PROVINCIAL_SHIPPING_FEE}฿ ขากลับลูกค้าส่งคืนเอง เช่าขั้นต่ำ ${MIN_PROVINCIAL_DURATION_HOURS / 24} วัน และต้องจองล่วงหน้าอย่างน้อย ${PROVINCIAL_SHIP_LEAD_DAYS} วัน`,
  },
  {
    q: 'เช่าเกิน 7 วันคิดยังไง?',
    a: `คิดราคา 7 วัน แล้วบวกเพิ่มวันละ ${EXTRA_DAY_RATE.A}฿ (Group A) หรือ ${EXTRA_DAY_RATE.B}฿ (Group B)`,
  },
]

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, ease: 'easeOut' },
} as const

export default function Home() {
  const [busyNow, setBusyNow] = useState<Record<string, boolean>>({})
  const [calcCam, setCalcCam] = useState<CameraId>(CAMERAS[0].id)
  const [calcDur, setCalcDur] = useState<keyof PriceTable>('day1')
  const [showBar, setShowBar] = useState(false)

  useEffect(() => {
    const now = new Date()
    getAllCamerasAvailability(now.getFullYear(), now.getMonth() + 1).then((data) => {
      const busy: Record<string, boolean> = {}
      for (const cam of CAMERAS) {
        const slots = data[cam.id as CameraId] ?? []
        const concurrent = slots
          .filter((s) => {
            const start = new Date(s.pickupDatetime)
            const end = new Date(s.returnDatetime)
            return start <= now && end > now
          })
          .reduce((sum, s) => sum + (s.quantity || 1), 0)
        busy[cam.id] = concurrent >= cam.quantity
      }
      setBusyNow(busy)
    }).catch((e) => {
      // The free/busy badges are a nice-to-have: leave them off, but say why
      console.warn('[home] availability badges unavailable:', e)
    })
  }, [])

  // Mobile booking bar appears once the hero's own buttons are scrolled away
  useEffect(() => {
    const onScroll = () => setShowBar(window.scrollY > 640)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const cam = CAMERAS.find((c) => c.id === calcCam) ?? CAMERAS[0]
  const dur = DURATIONS.find((d) => d.key === calcDur) ?? DURATIONS[1]
  const price = PRICE_TABLES[cam.priceGroup][dur.key]
  const original = ORIGINAL_PRICE_TABLES[cam.priceGroup][dur.key]

  return (
    <main className="min-h-screen overflow-x-hidden bg-cream text-ink">
      {/* ───────── Nav ───────── */}
      <nav className="sticky top-0 z-40 bg-cream/80 backdrop-blur-lg border-b border-pink-900/10">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-16 max-w-6xl mx-auto">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <Image src="/logo.png" alt="" width={36} height={36} className="rounded-full shrink-0" />
            <span className="font-display text-xl font-bold tracking-wide text-pink-700">MIWVIE</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-ink/70">
            <a href="#cameras" className="hover:text-pink-700 transition-colors">กล้อง</a>
            <a href="#pricing" className="hover:text-pink-700 transition-colors">ราคา</a>
            <a href="#how" className="hover:text-pink-700 transition-colors">วิธีจอง</a>
            <a href="#faq" className="hover:text-pink-700 transition-colors">คำถาม</a>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href={IG_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram @miwvie_shop"
              className="p-2 rounded-full text-ink/60 hover:text-pink-700 transition-colors"
            >
              <Instagram size={20} />
            </a>
            <Link
              href="/book"
              className="inline-flex items-center gap-1.5 bg-pink-700 text-cream text-sm font-medium rounded-full pl-4 pr-3 py-2 hover:bg-pink-600 transition-colors"
            >
              จองคิว <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ───────── Hero ───────── */}
      <section className="relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(60% 60% at 85% 20%, rgba(140,43,63,0.10), transparent 70%)' }}
        />
        <div className="relative grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-8 items-center px-4 sm:px-6 pt-10 sm:pt-14 lg:pt-20 pb-16 lg:pb-24 max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.18em] uppercase text-pink-700/80">
              <span className="w-6 h-px bg-pink-700/50" />
              Canon IXY · Camera Rental · มมส.
            </p>
            <h1 className="font-display text-[2.35rem] leading-[1.2] sm:text-6xl sm:leading-[1.15] lg:text-[3.4rem] xl:text-6xl font-bold mt-5 text-ink">
              <span className="whitespace-nowrap">เช่ากล้องดิจิตอล</span>
              <br />
              <span className="whitespace-nowrap">
                <span className="italic text-pink-700">โทน Y2K</span> สวยทุกช็อต
              </span>
            </h1>
            <p className="text-ink/65 text-base sm:text-lg mt-6 max-w-md leading-relaxed">
              Canon IXY {CAMERAS.length} รุ่น พร้อมอุปกรณ์ครบชุด เช่าเริ่มต้น {MIN_PRICE} บาท
              นับ 24 ชม. จากเวลารับจริง ไม่มีมัดจำ
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <Link
                href="/book"
                className="group inline-flex items-center justify-center gap-2 bg-pink-700 text-cream font-medium rounded-full px-7 py-4 text-base hover:bg-pink-600 transition-all shadow-[0_10px_30px_-10px_rgba(110,31,49,0.7)]"
              >
                เช็กคิวว่าง & จองเลย
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#pricing"
                className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-4 text-base text-ink border border-ink/15 hover:border-ink/40 transition-colors"
              >
                คำนวณราคา
              </a>
            </div>

            <dl className="grid grid-cols-3 mt-10 pt-8 border-t border-ink/10 max-w-md">
              {[
                { v: `${MIN_PRICE}฿`, l: 'เริ่มต้น / 6 ชม.' },
                { v: '0฿', l: 'ไม่มีมัดจำ' },
                { v: '10%', l: 'ส่วนลดเมื่อรีวิว' },
              ].map((s, i) => (
                <div key={s.l} className={i > 0 ? 'pl-4 sm:pl-6 border-l border-ink/10' : ''}>
                  <dt className="font-display text-3xl sm:text-4xl text-pink-700">{s.v}</dt>
                  <dd className="text-xs sm:text-sm text-ink/55 mt-1">{s.l}</dd>
                </div>
              ))}
            </dl>
          </motion.div>

          {/* Visual: arched photo + a second print + the camera that took it */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
            className="relative mx-auto w-full max-w-[400px] lg:max-w-[440px] aspect-[4/5]"
          >
            <div className="absolute inset-y-0 right-0 w-[78%] rounded-t-full overflow-hidden shadow-[0_30px_60px_-20px_rgba(69,18,31,0.45)] ring-1 ring-pink-900/10">
              <Image src="/mood/ixy30s-3.jpg" alt="ภาพถ่ายจากกล้อง IXY 30s" fill priority sizes="(min-width:1024px) 360px, 80vw" className="object-cover" />
            </div>
            <div className="absolute left-0 bottom-[14%] w-[42%] bg-white p-1.5 pb-6 rotate-[-6deg] shadow-[0_20px_40px_-12px_rgba(69,18,31,0.4)]">
              <div className="relative aspect-[3/4]">
                <Image src="/mood/ixy30s-2.jpg" alt="ภาพถ่ายจากกล้อง IXY 30s" fill sizes="180px" className="object-cover" />
              </div>
              <p className="absolute bottom-1 left-0 right-0 text-center font-display italic text-[11px] text-ink/60">shot on IXY 30s</p>
            </div>
            <Image
              src="/cameras/ixy30s-new.png"
              alt=""
              width={522}
              height={460}
              className="absolute -bottom-6 right-[-4%] w-[46%] h-auto drop-shadow-[0_18px_22px_rgba(46,12,21,0.45)]"
            />
            <div
              className="absolute top-[6%] left-[4%] w-24 h-24 rounded-full flex flex-col items-center justify-center text-pink-900 rotate-[-10deg] shadow-lg"
              style={{ background: 'radial-gradient(circle at 35% 30%, #EBD39B, #C9A45C 60%, #A07D3B)' }}
            >
              <span className="text-[10px] font-semibold">รีวิวรับ</span>
              <span className="font-display text-3xl font-bold leading-none">10%</span>
              <span className="text-[8px] font-bold tracking-[0.25em] mt-0.5">OFF</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ───────── Marquee ───────── */}
      <div className="bg-pink-800 text-cream/90 py-3.5 overflow-hidden select-none" aria-hidden>
        <div className="flex w-max animate-marquee motion-reduce:animate-none">
          {[0, 1].map((k) => (
            <div key={k} className="flex shrink-0">
              {[...CAMERAS.map((c) => c.shortName), 'อุปกรณ์ครบชุด', 'ไม่มีมัดจำ', 'รับฟรีที่ มมส.'].map((t) => (
                <span key={t} className="font-display italic text-lg px-6 whitespace-nowrap">
                  {t} <span className="text-brass not-italic ml-6">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ───────── Cameras ───────── */}
      <section id="cameras" className="px-4 sm:px-6 py-20 sm:py-28 max-w-6xl mx-auto scroll-mt-16">
        <SectionHead
          eyebrow="The Collection"
          title="เลือกรุ่นที่ใช่"
          aside={`${CAMERAS.length} รุ่น · ${TOTAL_UNITS} ตัว · สถานะว่าง ณ ตอนนี้`}
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {CAMERAS.map((c, i) => {
            const busy = busyNow[c.id]
            return (
              <motion.div key={c.id} {...reveal} transition={{ ...reveal.transition, delay: i * 0.06 }}>
                <Link
                  href={`/book?camera=${c.id}`}
                  className="group flex flex-col h-full bg-white rounded-2xl overflow-hidden ring-1 ring-pink-900/[0.07] hover:ring-pink-700/30 hover:shadow-[0_20px_40px_-20px_rgba(69,18,31,0.35)] transition-all duration-300"
                >
                  <div
                    className="relative aspect-[4/5] flex items-center justify-center p-4"
                    style={{ background: `radial-gradient(70% 60% at 50% 55%, ${c.color}26, transparent 75%), #FBF7F4` }}
                  >
                    <Image
                      src={c.image}
                      alt={c.name}
                      fill
                      sizes="(min-width:1024px) 220px, (min-width:768px) 30vw, 45vw"
                      className="object-contain p-5 sm:p-6 drop-shadow-[0_14px_16px_rgba(46,12,21,0.3)] group-hover:scale-[1.06] group-hover:-rotate-2 transition-transform duration-500"
                    />
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[11px]">
                      {busy === undefined ? (
                        <span />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 bg-white/85 backdrop-blur rounded-full px-2 py-0.5 text-ink/70">
                          <span className={`w-1.5 h-1.5 rounded-full ${busy ? 'bg-pink-400' : 'bg-emerald-500'}`} />
                          {busy ? 'ไม่ว่าง' : 'ว่าง'}
                        </span>
                      )}
                      {c.quantity > 1 && (
                        <span className="bg-pink-700 text-cream rounded-full px-2 py-0.5 font-medium">{c.quantity} ตัว</span>
                      )}
                    </div>
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <p className="font-display text-xl leading-tight">{c.shortName}</p>
                    <div className="flex items-center gap-1.5 mt-2" aria-label={`สี ${c.colorways.map((x) => x.name).join(' ')}`}>
                      {c.colorways.map((x) => (
                        <span key={x.name} title={x.name} className="w-3 h-3 rounded-full ring-1 ring-black/10" style={{ background: x.hex }} />
                      ))}
                      <span className="text-xs text-ink/50 ml-1">{c.colorways.map((x) => x.name).join(' · ')}</span>
                    </div>
                    <div className="mt-auto pt-4 flex items-end justify-between">
                      <p>
                        <span className="text-lg font-semibold">{PRICE_TABLES[c.priceGroup].day1}฿</span>
                        <span className="text-xs text-ink/50"> /วัน</span>
                      </p>
                      <span className="w-8 h-8 rounded-full bg-pink-50 text-pink-700 flex items-center justify-center group-hover:bg-pink-700 group-hover:text-cream transition-colors">
                        <ArrowUpRight size={16} />
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ───────── Pricing calculator ───────── */}
      <section id="pricing" className="px-4 sm:px-6 pb-20 sm:pb-28 max-w-6xl mx-auto scroll-mt-16">
        <motion.div {...reveal} className="rounded-[2rem] overflow-hidden text-cream grid lg:grid-cols-[1.2fr_1fr]" style={{ background: WINE_BG }}>
          <div className="p-6 sm:p-10">
            <p className="text-xs tracking-[0.2em] uppercase text-brass-light/80">Price Calculator</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold mt-3">คำนวณค่าเช่า</h2>

            <p className="text-sm text-cream/60 mt-8 mb-3">กล้อง</p>
            <div className="flex flex-wrap gap-2">
              {CAMERAS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCalcCam(c.id)}
                  className={`rounded-full px-4 py-2 text-sm transition-all ${
                    calcCam === c.id ? 'bg-cream text-pink-800 font-semibold' : 'bg-white/10 text-cream/80 hover:bg-white/20'
                  }`}
                >
                  {c.shortName}
                </button>
              ))}
            </div>

            <p className="text-sm text-cream/60 mt-6 mb-3">ระยะเวลา</p>
            <div className="grid grid-cols-4 gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.key}
                  onClick={() => setCalcDur(d.key)}
                  className={`rounded-xl py-2.5 text-sm transition-all ${
                    calcDur === d.key ? 'bg-brass text-pink-900 font-semibold' : 'bg-white/10 text-cream/80 hover:bg-white/20'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-black/15 p-6 sm:p-10 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-white/10">
            <div>
              <p className="text-sm text-cream/60">
                {cam.shortName} · {dur.label}
              </p>
              <div className="flex items-baseline gap-3 mt-2">
                <motion.span
                  key={`${calcCam}-${calcDur}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="font-display text-6xl sm:text-7xl font-bold"
                >
                  {price}
                </motion.span>
                <span className="text-2xl text-cream/70">฿</span>
              </div>
              <p className="mt-3 text-sm">
                <span className="line-through text-cream/40 mr-2">{original}฿</span>
                <span className="inline-block bg-brass/20 text-brass-light rounded-full px-2.5 py-0.5">
                  ประหยัด {original - price}฿
                </span>
              </p>
              {dur.days >= 2 && (
                <p className="text-sm text-cream/55 mt-3">เฉลี่ยวันละ {Math.round(price / dur.days)}฿</p>
              )}
              <p className="text-xs text-cream/45 mt-6 leading-relaxed">
                เกิน 7 วัน +{EXTRA_DAY_RATE[cam.priceGroup]}฿/วัน · ค่า Delivery แยก {LOCAL_DELIVERY_FEE}฿/เที่ยว · รีวิวหลังเช่าลดอีก 10%
              </p>
            </div>
            <Link
              href={`/book?camera=${cam.id}`}
              className="group mt-8 inline-flex items-center justify-center gap-2 bg-cream text-pink-800 font-semibold rounded-full px-6 py-4 hover:bg-white transition-colors"
            >
              จอง {cam.shortName}
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </motion.div>

        {/* Full table, tucked away for people who want to compare everything */}
        <details className="group mt-4 bg-white rounded-2xl ring-1 ring-pink-900/[0.07]">
          <summary className="flex items-center justify-between cursor-pointer list-none px-6 py-4 font-medium [&::-webkit-details-marker]:hidden">
            ดูตารางราคาทั้งหมด
            <Plus size={18} className="text-pink-700 transition-transform group-open:rotate-45" />
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
      </section>

      {/* ───────── Pickup options + what's included ───────── */}
      <section className="bg-white/60 border-y border-pink-900/[0.06]">
        <div className="px-4 sm:px-6 py-20 sm:py-28 max-w-6xl mx-auto">
          <SectionHead eyebrow="Pickup & Delivery" title="รับกล้องได้ 3 แบบ" />
          <div className="grid md:grid-cols-3 gap-4">
            <OptionCard
              icon={MapPin}
              title="รับ-คืนเองที่ร้าน"
              price="ฟรี"
              lines={['หอพักเมธาเรสสิเดนท์ 3', 'ซอยวุ่นวาย มมส.']}
              link={{ href: SHOP_MAP_URL, label: 'เปิดแผนที่' }}
              featured
            />
            <OptionCard
              icon={Bike}
              title="ส่ง-รับถึงที่"
              price={`${LOCAL_DELIVERY_FEE}฿`}
              unit="/เที่ยว"
              lines={['ในเขต มมส. ม.ใหม่', `ช่วง ${DELIVERY_HOURS_LABEL} น.`]}
            />
            <OptionCard
              icon={Package}
              title="ส่งต่างจังหวัด"
              price={`${PROVINCIAL_SHIPPING_FEE}฿`}
              unit="ขาไป"
              lines={[
                `เช่าขั้นต่ำ ${MIN_PROVINCIAL_DURATION_HOURS / 24} วัน · จองล่วงหน้า ${PROVINCIAL_SHIP_LEAD_DAYS} วัน`,
                'ขากลับลูกค้าส่งคืนเอง',
              ]}
            />
          </div>

          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 mt-4">
            <div className="bg-cream rounded-2xl p-6 sm:p-8">
              <h3 className="font-display text-2xl font-bold">ในกระเป๋ามีอะไรบ้าง</h3>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5 mt-6">
                {INCLUDED_ACCESSORIES.map((label, i) => {
                  const Icon = ACCESSORY_ICONS[i] ?? Package
                  return (
                    <li key={label} className="flex items-center gap-3 text-sm">
                      <span className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 ring-1 ring-pink-900/[0.06]">
                        <Icon size={19} className="text-pink-700" strokeWidth={1.75} />
                      </span>
                      {label}
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="bg-cream rounded-2xl p-6 sm:p-8">
              <h3 className="font-display text-2xl font-bold">เงื่อนไขการเช่า</h3>
              <ul className="space-y-4 mt-6 text-sm">
                <li className="flex gap-3">
                  <Clock size={18} className="text-pink-700 shrink-0 mt-0.5" />
                  นับ 24 ชม. จากเวลารับกล้องจริง
                </li>
                <li className="flex gap-3">
                  <Banknote size={18} className="text-pink-700 shrink-0 mt-0.5" />
                  ชำระเต็มจำนวน ไม่มีมัดจำ
                </li>
                <li className="flex gap-3">
                  <UserCheck size={18} className="text-pink-700 shrink-0 mt-0.5" />
                  บัตรประชาชน + โปรไฟล์ IG/FB ยืนยันตัวตน
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Gallery ───────── */}
      <section className="px-4 sm:px-6 py-20 sm:py-28 max-w-6xl mx-auto">
        <SectionHead
          eyebrow="Shot on IXY"
          title="ภาพจากกล้องจริง"
          aside={
            <a href={IG_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-pink-700 hover:underline underline-offset-4">
              ดูเพิ่มใน IG <ArrowUpRight size={14} />
            </a>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          {GALLERY.map((g, i) => (
            <motion.figure
              key={g.src}
              {...reveal}
              transition={{ ...reveal.transition, delay: (i % 4) * 0.05 }}
              className={`group relative overflow-hidden rounded-xl bg-pink-100 ${
                i === 0 ? 'col-span-2 aspect-[3/4] md:aspect-auto md:row-span-2' : 'aspect-[3/4]'
              }`}
            >
              <Image
                src={g.src}
                alt={`ภาพถ่ายจาก ${g.cam}`}
                fill
                sizes={i === 0 ? '(min-width:768px) 50vw, 100vw' : '(min-width:768px) 25vw, 50vw'}
                className="object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <figcaption className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/50 to-transparent text-white text-xs font-medium">
                {g.cam}
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section id="how" className="px-4 sm:px-6 pb-20 sm:pb-28 max-w-6xl mx-auto scroll-mt-16">
        <SectionHead eyebrow="How it works" title="จองง่าย ใน 4 ขั้นตอน" />
        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
          {STEPS.map((s, i) => (
            <motion.li key={s.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }} className="relative">
              <div className="flex items-center gap-4">
                <span className="font-display text-5xl text-pink-700/90 leading-none">0{i + 1}</span>
                {i < STEPS.length - 1 && <span className="hidden lg:block flex-1 h-px bg-ink/10" />}
              </div>
              <h3 className="font-semibold text-lg mt-4">{s.title}</h3>
              <p className="text-sm text-ink/60 mt-1.5 leading-relaxed">{s.desc}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="px-4 sm:px-6 pb-20 sm:pb-28 max-w-6xl mx-auto scroll-mt-16">
        <div className="grid lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-16">
          <div>
            <p className="text-xs tracking-[0.2em] uppercase text-brass-dark">FAQ</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold mt-3">คำถามที่พบบ่อย</h2>
            <p className="text-ink/60 mt-4 leading-relaxed">ไม่เจอคำตอบที่หา? ทักแชทมาถามได้เลย ตอบไว</p>
            <a
              href={IG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-6 rounded-full border border-ink/15 px-5 py-3 text-sm hover:border-pink-700 hover:text-pink-700 transition-colors"
            >
              <Instagram size={16} /> ทัก @miwvie_shop
            </a>
          </div>
          <div className="divide-y divide-ink/10 border-y border-ink/10">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group py-5">
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
      </section>

      {/* ───────── Closing CTA ───────── */}
      <section className="px-4 sm:px-6 pb-20 sm:pb-28 max-w-6xl mx-auto">
        <motion.div {...reveal} className="relative overflow-hidden rounded-[2rem] text-cream px-6 py-14 sm:px-14 sm:py-20" style={{ background: WINE_BG }}>
          <Image
            src="/cameras/ixy30s-new.png"
            alt=""
            width={522}
            height={460}
            className="hidden md:block absolute right-10 bottom-0 translate-y-6 w-72 h-auto opacity-95 drop-shadow-[0_20px_30px_rgba(0,0,0,0.4)]"
          />
          <div className="relative max-w-lg">
            <h2 className="font-display text-4xl sm:text-5xl font-bold leading-tight">
              ทริปหน้า
              <br />
              <span className="italic text-brass-light">พกกล้องไปด้วยกัน</span>
            </h2>
            <p className="text-cream/70 mt-5">เช็กคิวว่างได้ทันที จองเสร็จในไม่กี่นาที</p>
            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <Link
                href="/book"
                className="group inline-flex items-center justify-center gap-2 bg-cream text-pink-800 font-semibold rounded-full px-7 py-4 hover:bg-white transition-colors"
              >
                จองกล้องเลย <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href={IG_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-4 border border-cream/30 hover:bg-white/10 transition-colors"
              >
                <Instagram size={18} /> ดูรีวิวลูกค้า
              </a>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="bg-[#22141A] text-cream/60 pb-24 md:pb-0">
        <div className="px-4 sm:px-6 py-12 max-w-6xl mx-auto grid sm:grid-cols-[1.5fr_1fr_1fr] gap-8 text-sm">
          <div>
            <div className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="" width={32} height={32} className="rounded-full" />
              <span className="font-display text-xl text-cream">MIWVIE SHOP</span>
            </div>
            <p className="mt-3 leading-relaxed">เช่ากล้องดิจิตอล Canon IXY<br />มหาสารคาม · มมส.</p>
          </div>
          <div>
            <p className="text-cream/90 font-medium mb-3">ติดต่อ</p>
            <a href={IG_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-cream transition-colors">
              <Instagram size={15} /> @miwvie_shop
            </a>
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
        className={`md:hidden fixed bottom-0 inset-x-0 z-40 p-3 transition-transform duration-300 ${
          showBar ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 bg-ink/95 backdrop-blur rounded-2xl pl-5 pr-2 py-2 shadow-2xl">
          <p className="text-cream text-sm">
            เริ่มต้น <b className="text-brass-light">{MIN_PRICE}฿</b>
            <span className="text-cream/50"> · ไม่มีมัดจำ</span>
          </p>
          <Link href="/book" className="bg-cream text-pink-800 font-semibold text-sm rounded-xl px-5 py-3">
            จองเลย
          </Link>
        </div>
      </div>
    </main>
  )
}

function SectionHead({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: React.ReactNode }) {
  return (
    <motion.div {...reveal} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-10">
      <div>
        <p className="text-xs tracking-[0.2em] uppercase text-brass-dark">{eyebrow}</p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold mt-3">{title}</h2>
      </div>
      {aside && <div className="text-sm text-ink/55">{aside}</div>}
    </motion.div>
  )
}

function OptionCard({
  icon: Icon,
  title,
  price,
  unit,
  lines,
  link,
  featured,
}: {
  icon: React.ElementType
  title: string
  price: string
  unit?: string
  lines: string[]
  link?: { href: string; label: string }
  featured?: boolean
}) {
  return (
    <motion.div
      {...reveal}
      className={`rounded-2xl p-6 sm:p-7 flex flex-col ${
        featured ? 'bg-pink-700 text-cream' : 'bg-cream'
      }`}
    >
      <div className="flex items-start justify-between">
        <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${featured ? 'bg-white/15' : 'bg-white'}`}>
          <Icon size={20} className={featured ? 'text-cream' : 'text-pink-700'} />
        </span>
        <p className="text-right">
          <span className="font-display text-3xl font-bold">{price}</span>
          {unit && <span className={`text-sm ml-1 ${featured ? 'text-cream/60' : 'text-ink/50'}`}>{unit}</span>}
        </p>
      </div>
      <h3 className="font-semibold text-lg mt-6">{title}</h3>
      <div className={`text-sm mt-1.5 leading-relaxed ${featured ? 'text-cream/75' : 'text-ink/60'}`}>
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
      {link && (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brass-light hover:underline underline-offset-4"
        >
          {link.label} <ArrowUpRight size={14} />
        </a>
      )}
    </motion.div>
  )
}
