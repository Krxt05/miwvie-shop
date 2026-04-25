'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Lock, RefreshCw, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle, Package, RotateCcw, XCircle, Search, Gift, Copy, Check,
} from 'lucide-react'
import { getAdminBookings, updateBookingStatus, generateDiscountCode } from '@/lib/api'
import { Booking, BookingStatus, CameraId } from '@/types'
import { CAMERAS } from '@/lib/cameras'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

const STATUS_ACTIONS: Record<string, { next: BookingStatus; label: string; icon: React.ElementType }[]> = {
  pending: [{ next: 'confirmed', label: 'ยืนยันรับเงิน', icon: CheckCircle }],
  confirmed: [{ next: 'active', label: 'ส่งกล้องแล้ว', icon: Package }],
  active: [{ next: 'returned', label: 'รับคืนแล้ว', icon: RotateCcw }],
  returned: [],
  cancelled: [],
}

export default function AdminPage() {
  const [pin, setPin] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<BookingStatus | 'all'>('all')
  const [cameraFilter, setCameraFilter] = useState<CameraId | 'all'>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [discountCodes, setDiscountCodes] = useState<Record<string, string>>({})
  const [codeLoading, setCodeLoading] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const data = await getAdminBookings(pin)
    if (data !== null) {
      setBookings(data)
      setAuthed(true)
    } else {
      setAuthError('PIN ไม่ถูกต้อง')
    }
    setLoading(false)
  }

  async function refresh() {
    setLoading(true)
    const data = await getAdminBookings(pin)
    if (data !== null) setBookings(data)
    setLoading(false)
  }

  async function handleAction(bookingId: string, status: BookingStatus) {
    setActionLoading(bookingId)
    const res = await updateBookingStatus(bookingId, status, pin)
    if (res.success) {
      setBookings((prev) =>
        prev.map((b) =>
          b.bookingId === bookingId
            ? { ...b, bookingStatus: status, paymentStatus: status === 'confirmed' ? 'confirmed' : b.paymentStatus }
            : b,
        ),
      )
    }
    setActionLoading(null)
  }

  async function handleCancel(bookingId: string) {
    if (!confirm(`ยืนยันยกเลิก ${bookingId}?`)) return
    await handleAction(bookingId, 'cancelled')
  }

  async function handleGenerateCode(bookingId: string) {
    setCodeLoading(bookingId)
    const res = await generateDiscountCode(bookingId, pin)
    if (res.code) {
      setDiscountCodes((prev) => ({ ...prev, [bookingId]: res.code! }))
    } else {
      alert(res.error || 'เกิดข้อผิดพลาด')
    }
    setCodeLoading(null)
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  const filtered = bookings.filter((b) => {
    if (filter !== 'all' && b.bookingStatus !== filter) return false
    if (cameraFilter !== 'all' && b.cameraId !== cameraFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        b.bookingId?.toLowerCase().includes(q) ||
        String(b.customerName)?.toLowerCase().includes(q) ||
        String(b.customerPhone)?.includes(q)
      )
    }
    return true
  })

  const stats = {
    pending: bookings.filter((b) => b.bookingStatus === 'pending').length,
    confirmed: bookings.filter((b) => b.bookingStatus === 'confirmed').length,
    active: bookings.filter((b) => b.bookingStatus === 'active').length,
    revenue: bookings
      .filter((b) => b.paymentStatus === 'confirmed')
      .reduce((s, b) => s + Number(b.totalAmount), 0),
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-gradient-dark flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-pink rounded-2xl p-8 w-full max-w-sm"
        >
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(212,162,39,0.2)' }}>
              <Lock size={22} className="text-gold" />
            </div>
            <h1 className="text-xl font-bold">Admin</h1>
            <p className="text-white/40 text-sm">MIWVIE SHOP</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setAuthError('') }}
              placeholder="PIN"
              className="w-full glass rounded-xl px-4 py-3 text-center text-xl tracking-widest outline-none focus:border-gold/50 placeholder:text-white/20 placeholder:text-base placeholder:tracking-normal"
              autoFocus
            />
            {authError && <p className="text-pink text-sm text-center">{authError}</p>}
            <Button type="submit" variant="primary" fullWidth loading={loading}>
              เข้าสู่ระบบ
            </Button>
          </form>
        </motion.div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-dark">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-gold/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-white/40 text-sm">MIWVIE SHOP</p>
          </div>
          <button
            onClick={refresh}
            className={`p-2 rounded-lg glass hover:bg-white/10 transition-all ${loading ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'รอยืนยัน', value: stats.pending, color: 'text-yellow-400' },
            { label: 'ยืนยันแล้ว', value: stats.confirmed, color: 'text-blue-400' },
            { label: 'กำลังเช่า', value: stats.active, color: 'text-emerald-400' },
            { label: 'รายได้รวม', value: `${stats.revenue.toLocaleString()}฿`, color: 'text-gold' },
          ].map((s) => (
            <div key={s.label} className="glass rounded-xl p-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-white/40 text-xs mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="glass rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา ID, ชื่อ, เบอร์..."
              className="w-full bg-transparent pl-8 pr-3 py-2 text-sm outline-none placeholder:text-white/25"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as BookingStatus | 'all')}
            className="glass rounded-lg px-3 py-2 text-sm outline-none bg-transparent"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="pending">รอยืนยัน</option>
            <option value="confirmed">ยืนยันแล้ว</option>
            <option value="active">กำลังเช่า</option>
            <option value="returned">คืนแล้ว</option>
            <option value="cancelled">ยกเลิก</option>
          </select>
          <select
            value={cameraFilter}
            onChange={(e) => setCameraFilter(e.target.value as CameraId | 'all')}
            className="glass rounded-lg px-3 py-2 text-sm outline-none bg-transparent"
          >
            <option value="all">ทุกรุ่น</option>
            {CAMERAS.map((c) => (
              <option key={c.id} value={c.id}>{c.shortName}</option>
            ))}
          </select>
          <span className="text-white/30 text-xs">{filtered.length} รายการ</span>
        </div>

        {/* Booking list */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-white/30">ไม่มีรายการ</div>
          )}

          {filtered.map((b) => {
            const isExpanded = expanded === b.bookingId
            const actions = STATUS_ACTIONS[b.bookingStatus] ?? []
            const existingCode = discountCodes[b.bookingId] || String(b.discountCode || '')

            return (
              <div key={b.bookingId} className="glass rounded-xl overflow-hidden">
                {/* Row header */}
                <button
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/3 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : b.bookingId)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-xs text-white/40">{b.bookingId}</span>
                      <Badge label={
                        b.bookingStatus === 'pending' ? 'รอยืนยัน' :
                        b.bookingStatus === 'confirmed' ? 'ยืนยันแล้ว' :
                        b.bookingStatus === 'active' ? 'กำลังเช่า' :
                        b.bookingStatus === 'returned' ? 'คืนแล้ว' : 'ยกเลิก'
                      } variant={b.bookingStatus} />
                      {Number(b.discountAmount) > 0 && (
                        <span className="text-[10px] text-gold border border-gold/30 rounded-full px-1.5 py-0.5">ส่วนลด</span>
                      )}
                    </div>
                    <p className="font-semibold text-sm truncate">{String(b.customerName)}</p>
                    <p className="text-white/40 text-xs">
                      {String(b.cameraId)} ·{' '}
                      {b.pickupDatetime
                        ? format(new Date(b.pickupDatetime), 'd MMM HH:mm', { locale: th })
                        : '-'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-gold font-bold">{Number(b.totalAmount).toLocaleString()} ฿</p>
                    {isExpanded ? <ChevronUp size={16} className="text-white/30 ml-auto mt-1" /> : <ChevronDown size={16} className="text-white/30 ml-auto mt-1" />}
                  </div>
                </button>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-white/5 p-4 space-y-4">
                        {/* Detail grid */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <Detail label="ชื่อ" value={String(b.customerName)} />
                          <Detail label="โทร" value={String(b.customerPhone)} />
                          <Detail label="IG" value={String(b.customerIG) || '-'} />
                          <Detail label="กล้อง" value={String(b.cameraId)} />
                          <Detail
                            label="รับ"
                            value={b.pickupDatetime ? format(new Date(b.pickupDatetime), 'd MMM yyyy HH:mm', { locale: th }) : '-'}
                          />
                          <Detail
                            label="คืน"
                            value={b.returnDatetime ? format(new Date(b.returnDatetime), 'd MMM yyyy HH:mm', { locale: th }) : '-'}
                          />
                          <Detail
                            label="รับเครื่อง"
                            value={b.pickupType === 'delivery' ? `Delivery → ${b.pickupAddress}` : 'รับเอง'}
                          />
                          <Detail
                            label="คืนเครื่อง"
                            value={b.returnType === 'delivery' ? 'ให้ร้านรับ' : 'คืนเอง'}
                          />
                        </div>

                        {/* Discount info */}
                        {(Number(b.discountAmount) > 0 || b.discountCode) && (
                          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(212,162,39,0.1)', border: '1px solid rgba(212,162,39,0.2)' }}>
                            <span className="text-gold">โค้ดส่วนลด: </span>
                            <span className="font-mono font-bold text-gold">{String(b.discountCode)}</span>
                            <span className="text-white/40"> (ลด {Number(b.discountAmount).toLocaleString()} ฿)</span>
                          </div>
                        )}

                        {/* Documents */}
                        <div className="flex gap-2 flex-wrap">
                          {b.idCardImage && (
                            <a
                              href={String(b.idCardImage)}
                              target="_blank"
                              className="flex items-center gap-1 text-xs text-pink hover:text-pink-light transition-colors"
                            >
                              <ExternalLink size={12} /> บัตรประชาชน
                            </a>
                          )}
                          {b.igProfileImage && (
                            <a
                              href={String(b.igProfileImage)}
                              target="_blank"
                              className="flex items-center gap-1 text-xs text-pink hover:text-pink-light transition-colors"
                            >
                              <ExternalLink size={12} /> IG Profile
                            </a>
                          )}
                        </div>

                        {/* Status actions */}
                        <div className="flex flex-wrap gap-2">
                          {actions.map(({ next, label, icon: Icon }) => (
                            <Button
                              key={next}
                              size="sm"
                              variant="primary"
                              loading={actionLoading === b.bookingId}
                              onClick={() => handleAction(b.bookingId, next)}
                            >
                              <Icon size={14} />
                              {label}
                            </Button>
                          ))}
                          {b.bookingStatus !== 'cancelled' && b.bookingStatus !== 'returned' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCancel(b.bookingId)}
                              className="text-red-400 hover:text-red-300"
                            >
                              <XCircle size={14} />
                              ยกเลิก
                            </Button>
                          )}
                        </div>

                        {/* Discount code section — shown for returned bookings */}
                        {b.bookingStatus === 'returned' && (
                          <div className="border-t border-white/5 pt-4">
                            <p className="text-white/40 text-xs mb-2 flex items-center gap-1">
                              <Gift size={11} /> โค้ดส่วนลด 10% สำหรับรีวิว
                            </p>
                            {existingCode ? (
                              <div className="flex items-center gap-2">
                                <div
                                  className="flex-1 rounded-lg px-3 py-2 text-center font-mono font-bold text-base tracking-widest"
                                  style={{ background: 'rgba(212,162,39,0.1)', border: '1px solid rgba(212,162,39,0.3)', color: '#d4a227' }}
                                >
                                  {existingCode}
                                </div>
                                <button
                                  onClick={() => copyCode(existingCode)}
                                  className="p-2 rounded-lg glass hover:bg-white/10 transition-colors"
                                  title="คัดลอกโค้ด"
                                >
                                  {copied === existingCode ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} className="text-gold" />}
                                </button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                loading={codeLoading === b.bookingId}
                                onClick={() => handleGenerateCode(b.bookingId)}
                                className="border-gold/40 text-gold hover:bg-gold/10"
                              >
                                <Gift size={14} />
                                ออกโค้ดส่วนลด
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-white/40 text-xs">{label}</p>
      <p className="text-sm mt-0.5 truncate">{value}</p>
    </div>
  )
}
