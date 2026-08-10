'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { Instagram, ChevronRight, Clock, Truck, Shield, Star } from 'lucide-react'
import { CAMERAS, PRICE_TABLES, ORIGINAL_PRICE_TABLES } from '@/lib/cameras'
import { getAllCamerasAvailability } from '@/lib/api'
import { CameraId } from '@/types'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const FADE_UP = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
}

const STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const [busyNow, setBusyNow] = useState<Record<string, boolean>>({})
  useEffect(() => setMounted(true), [])

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
    })
  }, [])

  return (
    <main className="min-h-screen bg-gradient-dark">
      {/* Glow orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-gold/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 -right-40 w-80 h-80 bg-pink/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-gold/5 rounded-full blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex flex-wrap items-center justify-between gap-y-2 px-4 sm:px-6 py-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-[2px] rounded-full shrink-0" style={{ background: 'linear-gradient(135deg, #D63384, #FF69B4, #FFB6C1)' }}>
            <Image src="/logo.png" alt="MIWVIE SHOP" width={40} height={40} className="rounded-full block" />
          </div>
          <span className="font-display text-lg sm:text-xl font-bold text-gradient">MIWVIE SHOP</span>
        </div>
        <a
          href="https://www.instagram.com/miwvie_shop/"
          target="_blank"
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-pink transition-colors"
        >
          <Instagram size={18} />
          @miwvie_shop
        </a>
      </nav>

      {/* Hero */}
      <section className="relative z-10 px-6 pt-8 pb-20 max-w-5xl mx-auto text-center">
        <motion.div initial="hidden" animate={mounted ? 'show' : 'hidden'} variants={STAGGER}>
          <motion.div variants={FADE_UP} className="flex justify-center mb-6">
            <div
              className="p-[3px] rounded-full animate-pulse-pink"
              style={{ background: 'linear-gradient(135deg, #D63384, #FF69B4, #FFB6C1, #D63384)' }}
            >
              <Image
                src="/logo.png"
                alt="MIWVIE SHOP"
                width={140}
                height={140}
                className="rounded-full block"
                style={{ filter: 'drop-shadow(0 0 16px rgba(214,51,132,0.35)) drop-shadow(0 0 32px rgba(255,105,180,0.2))' }}
              />
            </div>
          </motion.div>
          <motion.p
            variants={FADE_UP}
            className="text-gold text-sm font-semibold tracking-widest uppercase mb-4"
          >
            Digital Camera Rental · มมส.
          </motion.p>
          <motion.h1
            variants={FADE_UP}
            className="font-display text-5xl md:text-7xl font-bold leading-tight mb-6"
          >
            เช่ากล้อง
            <br />
            <span className="text-gradient">สวยทุกช็อต</span>
          </motion.h1>

          <motion.p variants={FADE_UP} className="text-gray-500 text-lg mb-8 max-w-md mx-auto">
            Canon IXY ราคาถูก นับ 24 ชม. จากเวลารับจริง
          </motion.p>
          <motion.div variants={FADE_UP} className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/book" className="w-full sm:w-auto">
              <Button size="lg" fullWidth>
                จองเลย
                <ChevronRight size={18} />
              </Button>
            </Link>
            <a href="https://www.instagram.com/miwvie_shop/" target="_blank" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" fullWidth>
                <Instagram size={18} />
                ดูรีวิว
              </Button>
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="relative z-10 px-6 pb-16 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Clock, label: 'นับ 24 ชม.', sub: 'จากเวลารับจริง' },
            { icon: Truck, label: 'ส่งทั่วมมส.', sub: 'แค่ 20 บาท' },
            { icon: Shield, label: 'ปลอดภัย', sub: 'มีหลักฐานการเช่า' },
            { icon: Star, label: 'รีวิวรับส่วนลด', sub: '10% ทุกครั้ง' },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="glass rounded-2xl p-4 text-center">
              <Icon size={24} className="text-pink mx-auto mb-2" />
              <p className="font-semibold text-sm text-gray-700">{label}</p>
              <p className="text-gray-400 text-xs mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Camera grid */}
      <section className="relative z-10 px-6 pb-20 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gray-800">กล้องทั้งหมด</h2>
          <Link href="/book" className="text-pink text-sm hover:text-pink-light transition-colors">
            จองเลย →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {CAMERAS.map((cam, i) => {
            const prices = PRICE_TABLES[cam.priceGroup]
            return (
              <motion.div
                key={cam.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <Link href={`/book?camera=${cam.id}`}>
                  <div className="glass rounded-2xl overflow-hidden group hover:border-pink/30 transition-all duration-300 hover:shadow-pink-glow-sm cursor-pointer">
                    {/* Camera image */}
                    <div
                      className="h-44 flex items-center justify-center relative overflow-hidden"
                      style={{ background: `${cam.color}18` }}
                    >
                      <Image
                        src={cam.image}
                        alt={cam.name}
                        width={220}
                        height={160}
                        className="object-contain h-36 w-auto group-hover:scale-110 transition-transform duration-500 drop-shadow-lg"
                      />
                      <div className="absolute top-3 right-3">
                        {busyNow[cam.id] ? (
                          <Badge label="ไม่ว่าง" variant="busy" />
                        ) : (
                          <Badge label="ว่าง" variant="available" />
                        )}
                      </div>
                    </div>

                    <div className="p-4">
                      <h3 className="font-semibold mb-1 text-gray-800">
                        {cam.name}
                        {cam.quantity > 1 && (
                          <span className="ml-1.5 inline-flex items-center justify-center text-[10px] font-bold text-white bg-pink rounded-full px-1.5 py-0.5 align-middle">
                            x{cam.quantity}
                          </span>
                        )}
                      </h3>
                      <div className="flex items-baseline gap-1 mb-3">
                        <span className="text-pink font-bold text-lg">{prices.day1}</span>
                        <span className="text-gray-400 text-xs">฿ / วัน</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>6 ชม. {prices.hourly6}฿</span>
                        <span>7 วัน {prices.day7}฿</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Pricing table */}
      <section className="relative z-10 px-6 pb-20 max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <span className="inline-block bg-pink text-white text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1 rounded-full mb-3">
            โปรโมชั่น
          </span>
          <h2 className="text-2xl font-bold text-gray-800">ตารางราคา</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {(['A', 'B'] as const).map((group) => {
            const promo = PRICE_TABLES[group]
            const original = ORIGINAL_PRICE_TABLES[group]
            const rows: [string, string, keyof typeof promo][] = [
              ['6 ชั่วโมง', '6 Hours', 'hourly6'],
              ['1 วัน', '1 Day', 'day1'],
              ['2 วัน', '2 Days', 'day2'],
              ['3 วัน', '3 Days', 'day3'],
              ['4 วัน', '4 Days', 'day4'],
              ['5 วัน', '5 Days', 'day5'],
              ['6 วัน', '6 Days', 'day6'],
              ['7 วัน', '7 Days', 'day7'],
            ]
            return (
              <div
                key={group}
                className="bg-white rounded-2xl border border-pink-100 shadow-xl shadow-pink-100 overflow-hidden"
              >
                <div className="px-6 pt-5 pb-4 text-center border-b border-pink-100">
                  <span className="inline-block bg-pink-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-2">
                    Group {group}
                  </span>
                  <p className="text-gray-500 text-xs">
                    {group === 'A' ? 'Canon IXY 10s · 30s · 930 IS · 510 IS' : 'Canon IXUS 185 · IXY 910 IS'}
                  </p>
                </div>
                <div className="divide-y divide-pink-50 px-6">
                  {rows.map(([th, en, key]) => (
                    <div key={key} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{th}</p>
                        <p className="text-gray-400 text-[11px]">{en}</p>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-gray-300 text-xs line-through">{original[key]}฿</span>
                        <span className="text-pink-600 font-display font-bold text-2xl">
                          {promo[key]}
                          <span className="text-sm ml-0.5">฿</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="h-5" />
              </div>
            )
          })}
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          Delivery ทั่วมมส. เที่ยวละ 20฿ · รีวิวรับส่วนลด 10%
        </p>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-pink-100 px-6 py-8 text-center text-gray-400 text-xs">
        <p className="font-display text-base text-pink-600 mb-1">MIWVIE SHOP</p>
        <p>มหาสารคาม มมส. ซอยวุ่นวาย · @miwvie_shop</p>
        <p className="mt-2">© 2024 Miwvie Shop Digital Rental</p>
      </footer>
    </main>
  )
}
