'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { ChevronLeft, Clock, CheckCircle, Package, RotateCcw, XCircle, RefreshCw } from 'lucide-react'
import { getBooking } from '@/lib/api'
import { Booking } from '@/types'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

const STATUS_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; sub: string }> = {
  pending: {
    icon: Clock,
    label: 'รอยืนยันการชำระ',
    color: 'text-yellow-400',
    sub: 'กรุณาโอนเงินและส่งสลิปมาที่ @miwvie_shop',
  },
  confirmed: {
    icon: CheckCircle,
    label: 'ยืนยันแล้ว',
    color: 'text-blue-400',
    sub: 'การจองได้รับการยืนยัน รอรับกล้องตามนัด',
  },
  active: {
    icon: Package,
    label: 'กำลังเช่าอยู่',
    color: 'text-emerald-400',
    sub: 'กล้องอยู่กับคุณแล้ว อย่าลืมส่งคืนตรงเวลา',
  },
  returned: {
    icon: RotateCcw,
    label: 'คืนแล้ว',
    color: 'text-gray-400',
    sub: 'การเช่าเสร็จสิ้น ขอบคุณที่ใช้บริการ',
  },
  cancelled: {
    icon: XCircle,
    label: 'ยกเลิกแล้ว',
    color: 'text-red-400',
    sub: 'การจองนี้ถูกยกเลิก',
  },
}

export default function BookingStatusPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  async function load() {
    setLoading(true)
    const b = await getBooking(id)
    if (!b) setNotFound(true)
    else setBooking(b)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const status = booking ? STATUS_CONFIG[booking.bookingStatus] ?? STATUS_CONFIG.pending : null
  const StatusIcon = status?.icon ?? Clock

  return (
    <main className="min-h-screen bg-gradient-dark">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-pink/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 py-8">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1 text-white/40 hover:text-white text-sm mb-8 transition-colors"
        >
          <ChevronLeft size={16} /> หน้าหลัก
        </button>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-2 border-pink/30 border-t-pink rounded-full animate-spin" />
            <p className="text-white/40 text-sm">กำลังโหลด...</p>
          </div>
        )}

        {notFound && !loading && (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">🔍</p>
            <h2 className="text-xl font-bold mb-2">ไม่พบการจอง</h2>
            <p className="text-white/40 text-sm mb-6">Booking ID: {id}</p>
            <Button onClick={() => router.push('/book')} variant="primary">
              จองใหม่
            </Button>
          </div>
        )}

        {booking && status && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Status card */}
            <div className="glass-pink rounded-2xl p-6 text-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-current/10`}>
                <StatusIcon size={32} className={status.color} />
              </div>
              <Badge label={status.label} variant={booking.bookingStatus as any} />
              <p className="text-white/50 text-sm mt-2">{status.sub}</p>
            </div>

            {/* Booking details */}
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold">รายละเอียดการจอง</h2>
                <span className="text-xs text-white/30 font-mono">{booking.bookingId}</span>
              </div>

              <Row label="กล้อง" value={String(booking.cameraId)} />
              <Row
                label="รับกล้อง"
                value={
                  booking.pickupDatetime
                    ? format(new Date(booking.pickupDatetime), 'd MMM yyyy HH:mm', { locale: th }) + ' น.'
                    : '-'
                }
              />
              <Row
                label="คืนกล้อง"
                value={
                  booking.returnDatetime
                    ? format(new Date(booking.returnDatetime), 'd MMM yyyy HH:mm', { locale: th }) + ' น.'
                    : '-'
                }
              />
              <Row
                label="รับเครื่อง"
                value={booking.pickupType === 'self' ? 'รับเอง (ฟรี)' : `Delivery → ${booking.pickupAddress}`}
              />
              <Row
                label="คืนเครื่อง"
                value={booking.returnType === 'self' ? 'คืนเอง (ฟรี)' : 'ให้ร้านรับ'}
              />

              <div className="border-t border-white/10 pt-3 flex justify-between font-bold text-pink">
                <span>ยอดชำระ</span>
                <span>{Number(booking.totalAmount).toLocaleString()} ฿</span>
              </div>
            </div>

            {/* Payment reminder if pending */}
            {booking.bookingStatus === 'pending' && (
              <div className="glass rounded-2xl p-5 space-y-3">
                <h3 className="font-semibold text-yellow-400 flex items-center gap-2">
                  <Clock size={16} /> รอการชำระเงิน
                </h3>
                <p className="text-white/50 text-sm">
                  โอนเงิน <strong className="text-white">{Number(booking.totalAmount).toLocaleString()} บาท</strong> ผ่าน PromptPay แล้วส่งสลิปมาที่ IG DM
                </p>
                <Button
                  onClick={() => window.open('https://www.instagram.com/miwvie_shop/', '_blank')}
                  variant="outline"
                  fullWidth
                >
                  ส่งสลิปที่ @miwvie_shop
                </Button>
              </div>
            )}

            {/* Refresh */}
            <button
              onClick={load}
              className="flex items-center gap-2 text-white/30 hover:text-white/60 text-xs mx-auto transition-colors"
            >
              <RefreshCw size={12} /> รีเฟรชสถานะ
            </button>
          </motion.div>
        )}
      </div>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-white/50 shrink-0">{label}</span>
      <span className="text-right text-white/80">{value}</span>
    </div>
  )
}
