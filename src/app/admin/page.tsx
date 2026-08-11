'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Lock, RefreshCw, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle, Package, RotateCcw, XCircle, Search, Gift, Copy, Check,
  CalendarPlus, Trash2,
} from 'lucide-react'
import {
  getAdminBookings, updateBookingStatus, generateDiscountCode,
  blockDates, listBlockedSlots, deleteBlockedSlot, BlockedSlot,
} from '@/lib/api'
import { Booking, BookingStatus, CameraId } from '@/types'
import { CAMERAS } from '@/lib/cameras'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import BookingHeatmap from '@/components/BookingHeatmap'

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
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([])
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [showBlockedList, setShowBlockedList] = useState(false)
  const [blockCamera, setBlockCamera] = useState<CameraId | 'ALL'>('ALL')
  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [blockSubmitting, setBlockSubmitting] = useState(false)
  const [blockDeletingId, setBlockDeletingId] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const [data, blocks] = await Promise.all([getAdminBookings(pin), listBlockedSlots(pin)])
    if (data !== null) {
      setBookings(data)
      setBlockedSlots(blocks ?? [])
      setAuthed(true)
    } else {
      setAuthError('PIN ไม่ถูกต้อง')
    }
    setLoading(false)
  }

  async function refresh() {
    setLoading(true)
    const [data, blocks] = await Promise.all([getAdminBookings(pin), listBlockedSlots(pin)])
    if (data !== null) setBookings(data)
    if (blocks !== null) setBlockedSlots(blocks)
    setLoading(false)
  }

  async function handleAddBlock(e: React.FormEvent) {
    e.preventDefault()
    if (!blockStart || !blockEnd) return
    const start = new Date(blockStart)
    const end = new Date(blockEnd)
    if (end <= start) {
      alert('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม')
      return
    }
    setBlockSubmitting(true)
    const res = await blockDates(blockCamera, start, end, blockReason, pin)
    if (res.success) {
      const blocks = await listBlockedSlots(pin)
      setBlockedSlots(blocks ?? [])
      setBlockStart('')
      setBlockEnd('')
      setBlockReason('')
      setShowBlockForm(false)
    } else {
      alert(res.error || 'เกิดข้อผิดพลาด')
    }
    setBlockSubmitting(false)
  }

  async function handleDeleteBlock(id: string) {
    if (!confirm('ลบรายการนี้?')) return
    setBlockDeletingId(id)
    const res = await deleteBlockedSlot(id, pin)
    if (res.success) {
      setBlockedSlots((prev) => prev.filter((b) => b.id !== id))
    }
    setBlockDeletingId(null)
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

  // A block's `quantity` can cover more than one physical unit (e.g. both 930
  // IS units, or every model at once via "ALL") — expand it into one heatmap
  // row per unit it actually occupies, or partitionByUnit only fills one row
  // and the other unit misleadingly still looks free.
  const occupancyRows = [
    ...bookings
      .filter((b) => b.bookingStatus !== 'cancelled')
      .map((b) => ({ cameraId: b.cameraId, start: String(b.pickupDatetime), end: String(b.returnDatetime) })),
    ...blockedSlots.flatMap((b) => {
      const targetCameras = b.cameraId === 'ALL' ? CAMERAS.map((c) => c.id) : [b.cameraId as CameraId]
      return targetCameras.flatMap((cameraId) => {
        const camera = CAMERAS.find((c) => c.id === cameraId)
        const units = Math.max(1, Math.min(b.quantity, camera?.quantity ?? 1))
        return Array.from({ length: units }, () => ({ cameraId, start: b.startDatetime, end: b.endDatetime }))
      })
    }),
  ]

  if (!authed) {
    return (
      <main className="min-h-screen bg-gradient-dark flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-pink rounded-2xl p-8 w-full max-w-sm"
        >
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(214,51,132,0.2)' }}>
              <Lock size={22} className="text-gold" />
            </div>
            <h1 className="text-xl font-bold">Admin</h1>
            <p className="text-gray-400 text-sm">MIWVIE SHOP</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setAuthError('') }}
              placeholder="PIN"
              className="w-full glass rounded-xl px-4 py-3 text-center text-xl tracking-widest outline-none focus:border-gold/50 placeholder:text-gray-300 placeholder:text-base placeholder:tracking-normal"
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
            <p className="text-gray-400 text-sm">MIWVIE SHOP</p>
          </div>
          <button
            onClick={refresh}
            className={`p-2 rounded-lg glass hover:bg-pink-50 transition-all ${loading ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'รอยืนยัน', value: stats.pending, color: 'text-amber-600' },
            { label: 'ยืนยันแล้ว', value: stats.confirmed, color: 'text-blue-600' },
            { label: 'กำลังเช่า', value: stats.active, color: 'text-emerald-600' },
            { label: 'รายได้รวม', value: `${stats.revenue.toLocaleString()}฿`, color: 'text-gold' },
          ].map((s) => (
            <div key={s.label} className="glass rounded-xl p-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-gray-400 text-xs mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Heatmap */}
        <div className="mb-4">
          <BookingHeatmap rows={occupancyRows} />
        </div>

        {/* Manual booking / block dates */}
        <div className="glass rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <CalendarPlus size={16} className="text-pink" />
              <h2 className="font-bold text-sm">บล็อกคิว / จองด้วยมือ</h2>
            </div>
            <button
              onClick={() => setShowBlockForm((v) => !v)}
              className="text-xs text-pink hover:text-pink-light transition-colors font-semibold"
            >
              {showBlockForm ? 'ปิด' : '+ เพิ่มรายการ'}
            </button>
          </div>
          <p className="text-gray-400 text-xs mb-1">สำหรับลูกค้าที่ทัก DM/โทรจองตรง ไม่ผ่านเว็บ — บล็อกวันไว้ไม่ให้จองซ้ำ</p>

          <AnimatePresence>
            {showBlockForm && (
              <motion.form
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleAddBlock}
                className="overflow-hidden"
              >
                <div className="space-y-3 pt-3">
                  <select
                    value={blockCamera}
                    onChange={(e) => setBlockCamera(e.target.value as CameraId | 'ALL')}
                    className="w-full glass rounded-lg px-3 py-2 text-sm outline-none bg-transparent"
                  >
                    <option value="ALL">ทุกรุ่น</option>
                    {CAMERAS.map((c) => (
                      <option key={c.id} value={c.id}>{c.shortName}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">เริ่ม</label>
                      <input
                        type="datetime-local"
                        value={blockStart}
                        onChange={(e) => setBlockStart(e.target.value)}
                        required
                        className="w-full glass rounded-lg px-3 py-2 text-sm outline-none bg-transparent"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">ถึง</label>
                      <input
                        type="datetime-local"
                        value={blockEnd}
                        onChange={(e) => setBlockEnd(e.target.value)}
                        required
                        className="w-full glass rounded-lg px-3 py-2 text-sm outline-none bg-transparent"
                      />
                    </div>
                  </div>
                  <input
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="หมายเหตุ (เช่น ชื่อลูกค้า, ทักผ่าน IG)"
                    className="w-full glass rounded-lg px-3 py-2 text-sm outline-none bg-transparent placeholder:text-gray-300"
                  />
                  <Button type="submit" variant="primary" size="sm" fullWidth loading={blockSubmitting}>
                    บันทึก
                  </Button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {blockedSlots.length > 0 && (
            <div className="mt-3 pt-3 border-t border-pink-100">
              <button
                onClick={() => setShowBlockedList((v) => !v)}
                className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-pink-600 transition-colors font-semibold"
              >
                <span>รายการที่บล็อกไว้ ({blockedSlots.length})</span>
                {showBlockedList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <AnimatePresence>
                {showBlockedList && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2 pt-3">
                      {blockedSlots.map((b) => (
                        <div key={b.id} className="flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <p className="font-semibold truncate">
                              {b.cameraId === 'ALL' ? 'ทุกรุ่น' : CAMERAS.find((c) => c.id === b.cameraId)?.shortName ?? b.cameraId}
                              {b.reason && <span className="text-gray-400 font-normal"> · {b.reason}</span>}
                            </p>
                            <p className="text-gray-400">
                              {format(new Date(b.startDatetime), 'd MMM HH:mm', { locale: th })} – {format(new Date(b.endDatetime), 'd MMM HH:mm', { locale: th })}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteBlock(b.id)}
                            disabled={blockDeletingId === b.id}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 shrink-0 transition-colors disabled:opacity-40"
                            title="ลบ"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="glass rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา ID, ชื่อ, เบอร์..."
              className="w-full bg-transparent pl-8 pr-3 py-2 text-sm outline-none placeholder:text-gray-300"
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
          <span className="text-gray-400 text-xs">{filtered.length} รายการ</span>
        </div>

        {/* Booking list */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">ไม่มีรายการ</div>
          )}

          {filtered.map((b) => {
            const isExpanded = expanded === b.bookingId
            const actions = STATUS_ACTIONS[b.bookingStatus] ?? []
            const existingCode = discountCodes[b.bookingId] || String(b.discountCode || '')

            return (
              <div key={b.bookingId} className="glass rounded-xl overflow-hidden">
                {/* Row header */}
                <button
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-pink-50 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : b.bookingId)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-xs text-gray-400">{b.bookingId}</span>
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
                    <p className="text-gray-400 text-xs">
                      {String(b.cameraId)} ·{' '}
                      {b.pickupDatetime
                        ? format(new Date(b.pickupDatetime), 'd MMM HH:mm', { locale: th })
                        : '-'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-gold font-bold">{Number(b.totalAmount).toLocaleString()} ฿</p>
                    {isExpanded ? <ChevronUp size={16} className="text-gray-400 ml-auto mt-1" /> : <ChevronDown size={16} className="text-gray-400 ml-auto mt-1" />}
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
                      <div className="border-t border-pink-100 p-4 space-y-4">
                        {/* Detail grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
                          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(214,51,132,0.1)', border: '1px solid rgba(214,51,132,0.2)' }}>
                            <span className="text-gold">โค้ดส่วนลด: </span>
                            <span className="font-mono font-bold text-gold">{String(b.discountCode)}</span>
                            <span className="text-gray-400"> (ลด {Number(b.discountAmount).toLocaleString()} ฿)</span>
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
                              className="text-red-500 hover:text-red-600"
                            >
                              <XCircle size={14} />
                              ยกเลิก
                            </Button>
                          )}
                        </div>

                        {/* Discount code section — shown for returned bookings */}
                        {b.bookingStatus === 'returned' && (
                          <div className="border-t border-pink-100 pt-4">
                            <p className="text-gray-400 text-xs mb-2 flex items-center gap-1">
                              <Gift size={11} /> โค้ดส่วนลด 10% สำหรับรีวิว
                            </p>
                            {existingCode ? (
                              <div className="flex items-center gap-2">
                                <div
                                  className="flex-1 rounded-lg px-3 py-2 text-center font-mono font-bold text-base tracking-widest"
                                  style={{ background: 'rgba(214,51,132,0.1)', border: '1px solid rgba(214,51,132,0.3)', color: '#C2185B' }}
                                >
                                  {existingCode}
                                </div>
                                <button
                                  onClick={() => copyCode(existingCode)}
                                  className="p-2 rounded-lg glass hover:bg-pink-50 transition-colors"
                                  title="คัดลอกโค้ด"
                                >
                                  {copied === existingCode ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} className="text-gold" />}
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
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="text-sm mt-0.5 truncate">{value}</p>
    </div>
  )
}
