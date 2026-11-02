'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, RefreshCw, LogOut, Sun, ListChecks, CalendarDays, BarChart3, CalendarSearch } from 'lucide-react'
import {
  getAdminBookings, getAdminVersion, updateBookingStatus, generateDiscountCode, updateAdminNotes,
  listBlockedSlots, BlockedSlot,
} from '@/lib/api'
import { Booking, BookingStatus } from '@/types'
import { buildCustomerIndex, isNotHandedOver, isOverdue, timeOf } from '@/lib/admin'
import Button from '@/components/ui/Button'
import { FeedbackProvider, useFeedback } from '@/components/admin/Feedback'
import { AdminActions } from '@/components/admin/BookingCard'
import TodayTab from '@/components/admin/TodayTab'
import BookingsTab, { BookingFilters, DEFAULT_FILTERS } from '@/components/admin/BookingsTab'
import QueueTab from '@/components/admin/QueueTab'
import RevenueTab from '@/components/admin/RevenueTab'
import AvailabilitySheet from '@/components/admin/AvailabilitySheet'

const PIN_KEY = 'miwvie_admin_pin'
// How often an open admin tab asks "did anything change?" (a cheap version read)
const POLL_MS = 60_000

type Tab = 'today' | 'bookings' | 'queue' | 'revenue'
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'today', label: 'วันนี้', icon: Sun },
  { id: 'bookings', label: 'การจอง', icon: ListChecks },
  { id: 'queue', label: 'คิว/บล็อก', icon: CalendarDays },
  { id: 'revenue', label: 'รายได้', icon: BarChart3 },
]

// Forward steps that get an "undo" button (the server allows walking back one)
const UNDOABLE = new Set<BookingStatus>(['confirmed', 'active', 'returned'])

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
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [codeLoading, setCodeLoading] = useState<string | null>(null)
  const [discountCodes, setDiscountCodes] = useState<Record<string, string>>({})
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [showAvailability, setShowAvailability] = useState(false)

  const pinRef = useRef('')
  pinRef.current = pin
  // A reload that started before one of our own writes finished would put the
  // old row back on screen; each write bumps this and such reloads are dropped.
  const writeSeq = useRef(0)
  const loadSeq = useRef(0)
  const version = useRef<string | null>(null)

  const load = useCallback(async (p: string): Promise<'ok' | 'badpin' | 'error'> => {
    const seq = ++loadSeq.current
    const writesAtStart = writeSeq.current
    try {
      const [data, blocks] = await Promise.all([
        getAdminBookings(p),
        // A failed block list must not wipe the one on screen
        listBlockedSlots(p).catch(() => null),
      ])
      if (data === null) return 'badpin'
      if (seq !== loadSeq.current || writesAtStart !== writeSeq.current) return 'ok' // superseded
      setBookings(data)
      if (blocks) setBlockedSlots(blocks)
      setUpdatedAt(Date.now())
      return 'ok'
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'เชื่อมต่อไม่ได้')
      return 'error'
    }
  }, [])

  // Remembered PIN: sign straight in. Only a rejected PIN is forgotten — a
  // backend hiccup keeps it and shows the form with the error.
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

  const logout = useCallback(() => {
    writePin(null)
    setAuthed(false)
    setPin('')
    setBookings([])
    setBlockedSlots([])
  }, [])

  async function refresh() {
    setLoading(true)
    const r = await load(pin)
    if (r === 'badpin') logout()
    else if (r === 'error') toast('โหลดข้อมูลไม่สำเร็จ ลองกดรีเฟรชอีกครั้ง', 'error')
    setLoading(false)
  }

  // Keep two owners' phones in step: reload when the app comes back to the
  // front, and when the server's data version moves while it's open.
  useEffect(() => {
    if (!authed) return
    let stopped = false
    const check = async (force: boolean) => {
      if (document.visibilityState !== 'visible') return
      try {
        const v = await getAdminVersion(pinRef.current)
        if (stopped) return
        if (v === null) { logout(); return }
        const changed = version.current !== null && v !== version.current
        version.current = v
        if (force || changed) await load(pinRef.current)
      } catch { /* offline or backend busy — try again next tick */ }
    }
    check(false)
    const id = setInterval(() => check(false), POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check(true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [authed, load, logout])

  const customerOf = useMemo(() => buildCustomerIndex(bookings), [bookings])

  const replaceRow = useCallback((row: Booking) => {
    setBookings((prev) => prev.map((b) => (b.bookingId === row.bookingId ? row : b)))
  }, [])

  const markBusy = useCallback((id: string, on: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const runStatus = useCallback(async (b: Booking, next: BookingStatus, undoable: boolean) => {
    markBusy(b.bookingId, true)
    writeSeq.current++
    try {
      const res = await updateBookingStatus(b.bookingId, next, pinRef.current, b.bookingStatus)
      if (res.stale) {
        if (res.booking) replaceRow(res.booking)
        toast('มีคนแก้ใบจองนี้ไปแล้ว — อัปเดตให้เป็นล่าสุดแล้ว ลองดูอีกครั้ง', 'error')
        return
      }
      if (!res.success) {
        if (res.booking) replaceRow(res.booking)
        toast(res.error || 'อัปเดตสถานะไม่สำเร็จ', 'error')
        return
      }
      const saved = res.booking ?? { ...b, bookingStatus: next }
      replaceRow(saved)
      // Undo goes back to exactly where it was (e.g. returned → confirmed when
      // "รับคืนแล้ว" was pressed straight from confirmed)
      const back = UNDOABLE.has(next) ? b.bookingStatus : undefined
      if (next === 'cancelled') toast(`ยกเลิก ${b.bookingId} แล้ว`)
      else if (undoable && back) {
        toast(`${b.customerName}: อัปเดตแล้ว`, 'success', { label: 'ย้อนกลับ', onClick: () => { runStatus(saved, back, false) } })
      } else toast('ย้อนกลับแล้ว')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'อัปเดตสถานะไม่สำเร็จ', 'error')
    } finally {
      markBusy(b.bookingId, false)
    }
  }, [markBusy, replaceRow, toast])

  const setStatus = useCallback<AdminActions['setStatus']>(async (b, next) => {
    if (next === 'confirmed' && b.bookingStatus === 'pending' && customerOf(b).blacklisted) {
      const ok = await confirm({
        title: 'ลูกค้าอยู่ในรายการห้ามเช่า',
        body: `${b.customerName} มีใบจองที่ติด #ห้ามเช่า — ยืนยันรับเงินต่อไหม?`,
        confirmLabel: 'ยืนยันต่อ',
        danger: true,
      })
      if (!ok) return
    }
    await runStatus(b, next, true)
  }, [confirm, customerOf, runStatus])

  const cancel = useCallback<AdminActions['cancel']>(async (b) => {
    const ok = await confirm({
      title: `ยกเลิก ${b.bookingId}?`,
      body: `${b.customerName} — คิวช่วงนี้จะกลับมาว่างให้คนอื่นจอง (ย้อนกลับไม่ได้)`,
      confirmLabel: 'ยกเลิกการจอง',
      danger: true,
    })
    if (ok) await runStatus(b, 'cancelled', false)
  }, [confirm, runStatus])

  const generateCode = useCallback(async (bookingId: string) => {
    setCodeLoading(bookingId)
    writeSeq.current++
    try {
      const res = await generateDiscountCode(bookingId, pinRef.current)
      if (res.code) setDiscountCodes((prev) => ({ ...prev, [bookingId]: res.code! }))
      else toast(res.error || 'ออกโค้ดไม่สำเร็จ', 'error')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ออกโค้ดไม่สำเร็จ', 'error')
    } finally {
      setCodeLoading(null)
    }
  }, [toast])

  const saveNotes = useCallback(async (bookingId: string, notes: string) => {
    writeSeq.current++
    try {
      const res = await updateAdminNotes(bookingId, notes, pinRef.current)
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
  }, [toast])

  const actions: AdminActions = useMemo(() => ({
    isBusy: (id: string) => busyIds.has(id),
    codeLoading,
    discountCodes,
    setStatus,
    cancel,
    generateCode,
    saveNotes,
  }), [busyIds, codeLoading, discountCodes, setStatus, cancel, generateCode, saveNotes])

  const onToggle = useCallback((id: string) => setExpanded((cur) => (cur === id ? null : id)), [])
  // From the queue chart: show that one booking, expanded, in the bookings tab
  const openBooking = useCallback((id: string) => {
    setFilters({ ...DEFAULT_FILTERS, status: 'all', search: id })
    setExpanded(id)
    setTab('bookings')
    window.scrollTo(0, 0)
  }, [])
  const jumpTo = useCallback((status: BookingStatus) => { setFilters({ ...DEFAULT_FILTERS, status }); setTab('bookings') }, [])

  const todayBadge = useMemo(() => {
    const urgent = bookings.filter((b) => isOverdue(b) || isNotHandedOver(b)).length
    const pending = bookings.filter((b) => b.bookingStatus === 'pending').length
    return { count: urgent + pending, urgent: urgent > 0 }
  }, [bookings])

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
            <p className="text-gray-600 text-sm">MIWVIE SHOP</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setAuthError('') }}
              placeholder="PIN"
              aria-label="PIN"
              className="w-full glass rounded-xl px-4 py-3 text-center text-xl tracking-widest outline-none focus:border-gold/50 placeholder:text-gray-300 placeholder:text-base placeholder:tracking-normal"
              autoFocus
            />
            {authError && <p className="text-pink text-sm text-center">{authError}</p>}
            <Button type="submit" variant="primary" fullWidth loading={loading}>เข้าสู่ระบบ</Button>
            <p className="text-xs text-gray-600 text-center">เครื่องนี้จะจำ PIN ไว้จนกว่าจะกดออกจากระบบ</p>
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
            <p className="text-gray-600 text-xs tabular-nums">
              MIWVIE SHOP{updatedAt && ` · อัปเดต ${timeOf(new Date(updatedAt))}`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowAvailability(true)}
              className="h-11 px-3 rounded-xl glass flex items-center gap-1.5 text-sm font-medium text-pink"
              aria-label="เช็คคิวว่าง"
            >
              <CalendarSearch size={18} /> <span className="hidden sm:inline">เช็คคิวว่าง</span><span className="sm:hidden">คิวว่าง</span>
            </button>
            <button onClick={refresh} className="w-11 h-11 rounded-xl glass flex items-center justify-center" aria-label="รีเฟรช" title="รีเฟรช">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={async () => {
                if (await confirm({ title: 'ออกจากระบบ?', body: 'ครั้งหน้าต้องใส่ PIN ใหม่ในเครื่องนี้', confirmLabel: 'ออกจากระบบ' })) logout()
              }}
              className="w-11 h-11 rounded-xl glass flex items-center justify-center"
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
            onToggle={onToggle}
            actions={actions}
            customerOf={customerOf}
            onJumpToStatus={jumpTo}
          />
        )}
        {tab === 'bookings' && (
          <BookingsTab
            bookings={bookings}
            filters={filters}
            setFilters={setFilters}
            expanded={expanded}
            onToggle={onToggle}
            actions={actions}
            customerOf={customerOf}
          />
        )}
        {tab === 'queue' && (
          <QueueTab
            pin={pin}
            bookings={bookings}
            blockedSlots={blockedSlots}
            setBlockedSlots={setBlockedSlots}
            onOpenBooking={openBooking}
          />
        )}
        {tab === 'revenue' && (
          <RevenueTab
            bookings={bookings}
            blockedSlots={blockedSlots}
            onJumpToPending={() => jumpTo('pending')}
          />
        )}
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-pink-100 grid grid-cols-4"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        role="tablist"
      >
        {TABS.map((t) => {
          const badge = t.id === 'today' ? todayBadge.count : 0
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              aria-label={badge > 0 ? `${t.label} มีงานค้าง ${badge}` : t.label}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-col items-center gap-0.5 min-h-14 py-2 text-[11px] font-medium ${tab === t.id ? 'text-pink' : 'text-gray-600'}`}
            >
              <t.icon size={20} />
              {t.label}
              {badge > 0 && (
                <span className={`absolute top-1.5 left-1/2 ml-2 min-w-5 h-5 px-1 rounded-full text-white text-[11px] leading-5 tabular-nums ${todayBadge.urgent ? 'bg-red-600' : 'bg-brass-dark'}`}>
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {showAvailability && (
        <AvailabilitySheet bookings={bookings} blockedSlots={blockedSlots} onClose={() => setShowAvailability(false)} />
      )}
    </main>
  )
}
