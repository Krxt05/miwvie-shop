'use client'
import { useEffect, useState, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { addDays, format } from 'date-fns'
import { th } from 'date-fns/locale'
import { ChevronLeft, Clock, CheckCircle, Package, RotateCcw, XCircle, RefreshCw } from 'lucide-react'
import { getBooking, ApiError } from '@/lib/api'
import { PROVINCIAL_SHIP_LEAD_DAYS } from '@/lib/cameras'
import { Booking } from '@/types'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

const STATUS_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; sub: string }> = {
  pending: {
    icon: Clock,
    label: 'รอยืนยันการชำระ',
    color: 'text-amber-600',
    sub: 'กรุณาโอนเงินและส่งสลิปมาที่ @miwvie_shop',
  },
  confirmed: {
    icon: CheckCircle,
    label: 'ยืนยันแล้ว',
    color: 'text-blue-600',
    sub: 'การจองได้รับการยืนยัน รอรับกล้องตามนัด',
  },
  active: {
    icon: Package,
    label: 'กำลังเช่าอยู่',
    color: 'text-emerald-600',
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
    color: 'text-red-600',
    sub: 'การจองนี้ถูกยกเลิก',
  },
}

function BookingStatusInner() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const params = useSearchParams()
  // The booking ID is sequential and therefore guessable, so it alone no longer
  // unlocks the customer's own details — the token issued when the booking was
  // made does. An old link without one still shows the status, just not the
  // personal parts.
  const token = params.get('t') ?? ''
  const [booking, setBooking] = useState<Booking | null>(null)
  const [limited, setLimited] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState('')

  async function load() {
    setLoading(true)
    setLoadError('')
    setNotFound(false)
    try {
      const res = await getBooking(id, token)
      // "No such booking" and "we could not reach the system" used to look
      // identical here, which told customers with a perfectly good booking that
      // it did not exist.
      if (!res) setNotFound(true)
      else { setBooking(res.booking); setLimited(res.limited) }
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'เชื่อมต่อไม่ได้ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id, token])

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
          className="flex items-center gap-1 text-gray-400 hover:text-pink-600 text-sm mb-8 transition-colors"
        >
          <ChevronLeft size={16} /> หน้าหลัก
        </button>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-2 border-pink/30 border-t-pink rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">กำลังโหลด...</p>
          </div>
        )}

        {loadError && !loading && (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">⚠️</p>
            <h2 className="text-xl font-bold mb-2">ยังดูสถานะไม่ได้ตอนนี้</h2>
            <p className="text-gray-400 text-sm mb-1">{loadError}</p>
            <p className="text-gray-500 text-xs mb-6">การจองของคุณไม่ได้หายไป ระบบแค่ตอบกลับไม่ได้ชั่วคราว</p>
            <Button onClick={() => load()} variant="primary">ลองใหม่</Button>
          </div>
        )}

        {notFound && !loading && (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">🔍</p>
            <h2 className="text-xl font-bold mb-2">ไม่พบการจอง</h2>
            <p className="text-gray-400 text-sm mb-6">Booking ID: {id}</p>
            <Button onClick={() => router.push('/book')} variant="primary">
              จองใหม่
            </Button>
          </div>
        )}

        {booking && status && !loading && limited && (
          <div className="mb-4 rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            ลิงก์นี้แสดงได้เฉพาะสถานะการจอง — เปิดจากลิงก์ในใบจองที่ได้ตอนจองเสร็จ
            เพื่อดูรายละเอียดทั้งหมด หรือทักมาที่ IG @miwvie_shop ได้เลยค่ะ
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
              <p className="text-gray-500 text-sm mt-2">{status.sub}</p>
            </div>

            {/* Booking details */}
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold">รายละเอียดการจอง</h2>
                <span className="text-xs text-gray-400 font-mono">{booking.bookingId}</span>
              </div>

              <Row label="กล้อง" value={String(booking.cameraId)} />
              <Row label="พื้นที่" value={booking.rentalArea === 'provincial' ? 'ต่างจังหวัด (ส่งพัสดุ)' : 'ในพื้นที่ มมส.'} />
              {booking.rentalArea === 'provincial' && booking.pickupDatetime && (
                <Row
                  label="ร้านส่งพัสดุ"
                  value={format(addDays(new Date(booking.pickupDatetime), -PROVINCIAL_SHIP_LEAD_DAYS), 'd MMM yyyy', { locale: th })}
                />
              )}
              <Row
                label={booking.rentalArea === 'provincial' ? 'พัสดุถึงมือ' : 'รับกล้อง'}
                value={
                  booking.pickupDatetime
                    ? format(new Date(booking.pickupDatetime), booking.rentalArea === 'provincial' ? 'd MMM yyyy' : 'd MMM yyyy HH:mm', { locale: th }) + (booking.rentalArea === 'provincial' ? '' : ' น.')
                    : '-'
                }
              />
              <Row
                label={booking.rentalArea === 'provincial' ? 'ส่งคืน (ไปรษณีย์/ขนส่งเอกชน)' : 'คืนกล้อง'}
                value={
                  booking.returnDatetime
                    ? format(new Date(booking.returnDatetime), booking.rentalArea === 'provincial' ? 'd MMM yyyy' : 'd MMM yyyy HH:mm', { locale: th }) + (booking.rentalArea === 'provincial' ? ' ก่อน 12:00 น.' : ' น.')
                    : '-'
                }
              />
              {booking.rentalArea === 'provincial' ? (
                <>
                  <Row
                    label="ที่อยู่จัดส่ง"
                    value={`${booking.shippingAddress} ต.${booking.shippingSubdistrict} อ./เขต ${booking.shippingDistrict} จ.${booking.shippingProvince} ${booking.shippingPostalCode}`}
                  />
                  <Row
                    label="แจ้งเลขพัสดุภายใน"
                    value={booking.returnDatetime ? `เที่ยงวันที่ ${format(addDays(new Date(booking.returnDatetime), 1), 'd MMM yyyy', { locale: th })}` : '-'}
                  />
                </>
              ) : (
                <>
                  <Row
                    label="รับเครื่อง"
                    value={booking.pickupType === 'self' ? 'รับเอง (ฟรี)' : `Delivery → ${booking.pickupAddress}`}
                  />
                  <Row
                    label="คืนเครื่อง"
                    value={
                      booking.returnType === 'self'
                        ? 'คืนเอง (ฟรี)'
                        : `ให้ร้านรับ${booking.returnAddress ? ` → ${booking.returnAddress}` : ''}`
                    }
                  />
                </>
              )}

              <div className="border-t border-pink-100 pt-3 flex justify-between font-bold text-pink">
                <span>ยอดชำระ</span>
                <span>{Number(booking.totalAmount).toLocaleString()} ฿</span>
              </div>
            </div>

            {/* Payment reminder if pending */}
            {booking.bookingStatus === 'pending' && (
              <div className="glass rounded-2xl p-5 space-y-3">
                <h3 className="font-semibold text-amber-600 flex items-center gap-2">
                  <Clock size={16} /> รอการชำระเงิน
                </h3>
                <p className="text-gray-500 text-sm">
                  โอนเงิน <strong className="text-gray-800">{Number(booking.totalAmount).toLocaleString()} บาท</strong> ผ่าน PromptPay แล้วส่งสลิปมาที่ IG DM
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
              className="flex items-center gap-2 text-gray-400 hover:text-gray-500 text-xs mx-auto transition-colors"
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
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-right text-gray-700">{value}</span>
    </div>
  )
}

export default function BookingStatusPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-gradient-dark" />}>
      <BookingStatusInner />
    </Suspense>
  )
}
