'use client'
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, RefreshCw, LogOut, Sun, ListChecks, CalendarDays, BarChart3 } from 'lucide-react'
import {
  getAdminBookings, updateBookingStatus, generateDiscountCode, updateAdminNotes,
  listBlockedSlots, BlockedSlot,
} from '@/lib/api'
import { Booking, BookingStatus } from '@/types'
import Button from '@/components/ui/Button'
import { FeedbackProvider, useFeedback } from '@/components/admin/Feedback'
import { AdminActions } from '@/components/admin/BookingCard'
import TodayTab from '@/components/admin/TodayTab'
import BookingsTab, { BookingFilters, DEFAULT_FILTERS } from '@/components/admin/BookingsTab'
import QueueTab from '@/components/admin/QueueTab'
import RevenueTab from '@/components/admin/RevenueTab'

const PIN_KEY = 'miwvie_admin_pin'

type Tab = 'today' | 'bookings' | 'queue' | 'revenue'
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'today', label: 'วันนี้', icon: Sun },
  { id: 'bookings', label: 'การจอง', icon: ListChecks },
  { id: 'queue', label: 'คิว/บล็อก', icon: CalendarDays },
  { id: 'revenue', label: 'รายได้', icon: BarChart3 },
]

// Storage can throw (private mode, blocked site data) — the page must still work.
function readPin(): string {
  try { return localStorage.getItem(PIN_KEY) || '' } catch { return '' }
}
function writePin(pin: string | null) {
  try {
    if (pin) localStorage.setItem(PIN_KEY, pin)
    else localStorage.removeItem(PIN_KEY)
  } catch { /* not persisted — PIN asked again next visit */ }
}

export default function AdminPage() {
  return (
    <FeedbackProvider>
      <AdminApp />
    </FeedbackProvider>
  )
}

function AdminApp() {
  const { toast, confirm } = useFeedback()
  const [pin, setPin] = useState('')
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [authError, setAuthError] = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>('today')
  const [filters, setFilters] = useState<BookingFilters>(DEFAULT_FILTERS)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState<string | null>(null)
  const [discountCodes, setDiscountCodes] = useState<Record<string, string>>({})

  const load = useCallback(async (p: string): Promise<'ok' | 'badpin' | 'error'> => {
    try {
      const [data, blocks] = await Promise.all([getAdminBookings(p), listBlockedSlots(p)])
      if (data === null) return 'badpin'
      setBookings(data)
      setBlockedSlots(blocks ?? [])
      return 'ok'
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'เชื่อมต่อไม่ได้')
      return 'error'
    }
  }, [])

  // Remembered PIN: sign straight in. If the PIN was changed on the server the
  // stored one stops working and gets dropped, so the form comes back.
  useEffect(() => {
    const saved = readPin()
    if (!saved) { setChecking(false); return }
    setPin(saved)
    load(saved).then((r) => {
      if (r === 'ok') setAuthed(true)
      if (r === 'badpin') { writePin(null); setPin('') }
      setChecking(false)
    })
  }, [load])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setAuthError('')
    const r = await load(pin)
    if (r === 'ok') {
      writePin(pin)
      setAuthed(true)
    } else if (r === 'badpin') {
      setAuthError('PIN ไม่ถูกต้อง')
    }
    setLoading(false)
  }

  async function refresh() {
    setLoading(true)
    const r = await load(pin)
    if (r === 'badpin') logout()
    else if (r === 'error') toast('โหลดข้อมูลไม่สำเร็จ ลองกดรีเฟรชอีกครั้ง', 'error')
    setLoading(false)
  }

  function logout() {
    writePin(null)
    setAuthed(false)
    setPin('')
    setBookings([])
    setBlockedSlots([])
  }

  async function setStatus(bookingId: string, status: BookingStatus) {
    setActionLoading(bookingId)
    try {
      const res = await updateBookingStatus(bookingId, status, pin)
      if (!res.success) {
        toast(res.error || 'อัปเดตสถานะไม่สำเร็จ', 'error')
        return
      }
      setBookings((prev) =>
        prev.map((b) => {
          if (b.bookingId !== bookingId) return b
          // Take the row the server saved — patching only the status left
          // returned_at stale and the heatmap kept the unit blocked.
          if (res.booking) return res.booking
          return { ...b, bookingStatus: status, paymentStatus: status === 'confirmed' ? 'confirmed' : b.paymentStatus }
        }),
      )
      toast(status === 'cancelled' ? `ยกเลิก ${bookingId} แล้ว` : 'อัปเดตสถานะแล้ว')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'อัปเดตสถานะไม่สำเร็จ', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const actions: AdminActions = {
    actionLoading,
    codeLoading,
    discountCodes,
    setStatus,
    async cancel(bookingId) {
      const b = bookings.find((x) => x.bookingId === bookingId)
      const ok = await confirm({
        title: `ยกเลิก ${bookingId}?`,
        body: b ? `${b.customerName} — คิวช่วงนี้จะกลับมาว่างให้คนอื่นจอง` : undefined,
        confirmLabel: 'ยกเลิกการจอง',
        danger: true,
      })
      if (ok) await setStatus(bookingId, 'cancelled')
    },
    async generateCode(bookingId) {
      setCodeLoading(bookingId)
      try {
        const res = await generateDiscountCode(bookingId, pin)
        if (res.code) setDiscountCodes((prev) => ({ ...prev, [bookingId]: res.code! }))
        else toast(res.error || 'ออกโค้ดไม่สำเร็จ', 'error')
      } catch (e) {
        toast(e instanceof Error ? e.message : 'ออกโค้ดไม่สำเร็จ', 'error')
      } finally {
        setCodeLoading(null)
      }
    },
    async saveNotes(bookingId, notes) {
      try {
        const res = await updateAdminNotes(bookingId, notes, pin)
        if (!res.success) {
          toast(res.error || 'บันทึกโน้ตไม่สำเร็จ', 'error')
          return false
        }
        setBookings((prev) => prev.map((b) => (b.bookingId === bookingId ? { ...b, adminNotes: res.notes ?? notes } : b)))
        toast('บันทึกโน้ตแล้ว')
        return true
      } catch (e) {
        toast(e instanceof Error ? e.message : 'บันทึกโน้ตไม่สำเร็จ', 'error')
        return false
      }
    },
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-gradient-dark flex items-center justify-center">
        <RefreshCw size={22} className="animate-spin text-pink" aria-label="กำลังโหลด" />
      </main>
    )
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-gradient-dark flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-pink rounded-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(140,43,63,0.2)' }}>
              <Lock size={22} className="text-gold" />
            </div>
            <h1 className="text-xl font-bold">Admin</h1>
            <p className="text-gray-400 text-sm">MIWVIE SHOP</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setAuthError('') }}
              placeholder="PIN"
              aria-label="PIN"
              className="w-full glass rounded-xl px-4 py-3 text-center text-xl tracking-widest outline-none focus:border-gold/50 placeholder:text-gray-300 placeholder:text-base placeholder:tracking-normal"
              autoFocus
            />
            {authError && <p className="text-pink text-sm text-center">{authError}</p>}
            <Button type="submit" variant="primary" fullWidth loading={loading}>เข้าสู่ระบบ</Button>
            <p className="text-[11px] text-gray-400 text-center">เครื่องนี้จะจำ PIN ไว้จนกว่าจะกดออกจากระบบ</p>
          </form>
        </motion.div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-dark pb-24 md:pb-10">
      <div className="relative z-10 max-w-5xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Admin</h1>
            <p className="text-gray-400 text-xs">MIWVIE SHOP</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={refresh} className="p-2 rounded-lg glass hover:bg-pink-50" aria-label="รีเฟรช" title="รีเฟรช">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={async () => {
                if (await confirm({ title: 'ออกจากระบบ?', body: 'ครั้งหน้าต้องใส่ PIN ใหม่ในเครื่องนี้', confirmLabel: 'ออกจากระบบ' })) logout()
              }}
              className="p-2 rounded-lg glass hover:bg-pink-50"
              aria-label="ออกจากระบบ"
              title="ออกจากระบบ"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Desktop tabs */}
        <nav className="hidden md:flex gap-1 glass rounded-xl p-1 mb-5" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-pink text-white' : 'text-gray-500 hover:text-pink'
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </nav>

        {tab === 'today' && (
          <TodayTab
            bookings={bookings}
            expanded={expanded}
            setExpanded={setExpanded}
            actions={actions}
            onJumpToStatus={(status) => { setFilters({ ...DEFAULT_FILTERS, status }); setTab('bookings') }}
          />
        )}
        {tab === 'bookings' && (
          <BookingsTab
            bookings={bookings}
            filters={filters}
            setFilters={setFilters}
            expanded={expanded}
            setExpanded={setExpanded}
            actions={actions}
          />
        )}
        {tab === 'queue' && (
          <QueueTab pin={pin} bookings={bookings} blockedSlots={blockedSlots} setBlockedSlots={setBlockedSlots} />
        )}
        {tab === 'revenue' && <RevenueTab bookings={bookings} />}
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-pink-100 grid grid-cols-4"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        role="tablist"
      >
        {TABS.map((t) => {
          const badge = t.id === 'today' ? bookings.filter((b) => b.bookingStatus === 'pending').length : 0
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${tab === t.id ? 'text-pink' : 'text-gray-400'}`}
            >
              <t.icon size={20} />
              {t.label}
              {badge > 0 && (
                <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] leading-4">
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </main>
  )
}
