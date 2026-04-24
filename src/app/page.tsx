'use client'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import { Instagram, ChevronRight, Clock, Truck, Shield, Star } from 'lucide-react'
import { CAMERAS, PRICE_TABLES } from '@/lib/cameras'
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
  useEffect(() => setMounted(true), [])

  return (
    <main className="min-h-screen bg-gradient-dark">
      {/* Glow orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-pink/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 -right-40 w-80 h-80 bg-purple-500/10 rounded-full blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-5xl mx-auto">
        <span className="font-display text-xl font-bold text-gradient">MIWVIE SHOP</span>
        <a
          href="https://www.instagram.com/miwvie_shop/"
          target="_blank"
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
        >
          <Instagram size={18} />
          @miwvie_shop
        </a>
      </nav>

      {/* Hero */}
      <section className="relative z-10 px-6 pt-12 pb-20 max-w-5xl mx-auto text-center">
        <motion.div initial="hidden" animate={mounted ? 'show' : 'hidden'} variants={STAGGER}>
          <motion.p
            variants={FADE_UP}
            className="text-pink text-sm font-semibold tracking-widest uppercase mb-4"
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
          <motion.p variants={FADE_UP} className="text-white/50 text-lg mb-8 max-w-md mx-auto">
            Canon IXY ราคาถูก นับ 24 ชม. จากเวลารับจริง ส่งทั่วประเทศ
          </motion.p>
          <motion.div variants={FADE_UP} className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/book">
              <Button size="lg">
                จองเลย
                <ChevronRight size={18} />
              </Button>
            </Link>
            <a href="https://www.instagram.com/miwvie_shop/" target="_blank">
              <Button size="lg" variant="outline">
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
            { icon: Truck, label: 'ส่งทั่วมมส.', sub: 'แค่ 15 บาท' },
            { icon: Shield, label: 'ปลอดภัย', sub: 'มีหลักฐานการเช่า' },
            { icon: Star, label: 'รีวิวรับส่วนลด', sub: '10% ทุกครั้ง' },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="glass rounded-2xl p-4 text-center">
              <Icon size={24} className="text-pink mx-auto mb-2" />
              <p className="font-semibold text-sm">{label}</p>
              <p className="text-white/40 text-xs mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Camera grid */}
      <section className="relative z-10 px-6 pb-20 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold">กล้องทั้งหมด</h2>
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
                        <Badge label="ว่าง" variant="available" />
                      </div>
                    </div>

                    <div className="p-4">
                      <h3 className="font-semibold mb-1">{cam.name}</h3>
                      <div className="flex items-baseline gap-1 mb-3">
                        <span className="text-pink font-bold text-lg">{prices.day1}</span>
                        <span className="text-white/40 text-xs">฿ / วัน</span>
                      </div>
                      <div className="flex justify-between text-xs text-white/40">
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
        <h2 className="text-2xl font-bold mb-8 text-center">ตารางราคา</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-left">
                <th className="pb-4 pr-4">ระยะเวลา</th>
                <th className="pb-4 pr-4 text-center">กลุ่ม A<br /><span className="text-white/30 font-normal text-xs">IXY 10s / 30s / 930 IS</span></th>
                <th className="pb-4 text-center">กลุ่ม B<br /><span className="text-white/30 font-normal text-xs">IXY 910 IS / 200</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                ['6 ชั่วโมง', 149, 129],
                ['1 วัน', 249, 199],
                ['2 วัน', 449, 349],
                ['3 วัน', 649, 499],
                ['5 วัน', 849, 699],
                ['7 วัน', 999, 899],
              ].map(([label, a, b]) => (
                <tr key={String(label)} className="hover:bg-white/2 transition-colors">
                  <td className="py-3 pr-4 text-white/70">{label}</td>
                  <td className="py-3 pr-4 text-center font-semibold text-pink">{a} ฿</td>
                  <td className="py-3 text-center font-semibold text-pink">{b} ฿</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-center text-white/30 text-xs mt-4">
          Delivery ทั่วมมส. เที่ยวละ 15฿ · รีวิวรับส่วนลด 10%
        </p>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 px-6 py-8 text-center text-white/30 text-xs">
        <p className="font-display text-base text-white/60 mb-1">MIWVIE SHOP</p>
        <p>มหาสารคาม มมส. ซอยวุ่นวาย · @miwvie_shop</p>
        <p className="mt-2">© 2024 Miwvie Shop Digital Rental</p>
      </footer>
    </main>
  )
}
