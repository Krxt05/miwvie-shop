'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { CalendarPlus, ChevronDown, ChevronUp, Trash2, CalendarDays } from 'lucide-react'
import { Booking, CameraId } from '@/types'
import { CAMERAS, PROVINCIAL_SHIP_LEAD_DAYS } from '@/lib/cameras'
import { blockDates, listBlockedSlots, deleteBlockedSlot, BlockedSlot } from '@/lib/api'
import Button from '@/components/ui/Button'
import BookingHeatmap from '@/components/BookingHeatmap'
import { useFeedback } from './Feedback'
import { cameraName } from './BookingCard'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

interface Props {
  pin: string
  bookings: Booking[]
  blockedSlots: BlockedSlot[]
  setBlockedSlots: (slots: BlockedSlot[] | ((prev: BlockedSlot[]) => BlockedSlot[])) => void
}

export default function QueueTab({ pin, bookings, blockedSlots, setBlockedSlots }: Props) {
  const { toast, confirm } = useFeedback()
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [camera, setCamera] = useState<CameraId | 'ALL'>('ALL')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [qty, setQty] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showEnded, setShowEnded] = useState(false)

  const stock = camera === 'ALL' ? 1 : CAMERAS.find((c) => c.id === camera)?.quantity ?? 1

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!start || !end) return
    const s = new Date(start)
    const en = new Date(end)
    if (en <= s) {
      toast('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม', 'error')
      return
    }
    setSubmitting(true)
    try {
      const res = await blockDates(camera, s, en, reason, pin, qty)
      if (!res.success) {
        toast(res.error || 'บันทึกไม่สำเร็จ', 'error')
        return
      }
      const blocks = await listBlockedSlots(pin)
      setBlockedSlots(blocks ?? [])
      setStart('')
      setEnd('')
      setReason('')
      setQty(1)
      setShowForm(false)
      toast('บล็อกคิวแล้ว')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(b: BlockedSlot) {
    const ok = await confirm({
      title: 'ลบรายการบล็อกนี้?',
      body: `${b.cameraId === 'ALL' ? 'ทุกรุ่น' : cameraName(b.cameraId)} · ${format(new Date(b.startDatetime), 'd MMM HH:mm', { locale: th })} – ${format(new Date(b.endDatetime), 'd MMM HH:mm', { locale: th })} — คิวช่วงนี้จะกลับมาจองได้`,
      confirmLabel: 'ลบ',
      danger: true,
    })
    if (!ok) return
    setDeletingId(b.id)
    try {
      const res = await deleteBlockedSlot(b.id, pin)
      if (res.success) {
        setBlockedSlots((prev) => prev.filter((x) => x.id !== b.id))
        toast('ลบแล้ว')
      } else {
        toast(res.error || 'ลบไม่สำเร็จ', 'error')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'ลบไม่สำเร็จ', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const occupancyRows = [
    // Provincial bookings tie the unit up for both ship legs, so widen by the
    // lead time on each side; once returned they free up at the actual return
    // moment (mirrors readBookingSlotsAll on the backend).
    ...bookings
      .filter((b) => b.bookingStatus !== 'cancelled')
      .map((b) => {
        const isProv = b.rentalArea === 'provincial'
        const pad = isProv ? PROVINCIAL_SHIP_LEAD_DAYS * DAY_MS : 0
        const rawStart = new Date(String(b.pickupDatetime)).getTime()
        let s: number
        let e: number
        if (isProv && b.bookingStatus === 'returned' && b.returnedAt) {
          s = rawStart
          e = new Date(b.returnedAt).getTime() + HOUR_MS
          if (e < s) s = e
        } else {
          s = rawStart - pad
          e = new Date(String(b.returnDatetime)).getTime() + pad
        }
        return {
          cameraId: b.cameraId,
          start: new Date(s).toISOString(),
          end: new Date(e).toISOString(),
          kind: isProv ? ('provincial' as const) : ('local' as const),
        }
      }),
    // A block covering N units needs N rows so every unit shows busy; an 'ALL'
    // block applies to every model (capped at its stock).
    ...blockedSlots.flatMap((b) => {
      const targets = b.cameraId === 'ALL' ? CAMERAS : CAMERAS.filter((c) => c.id === b.cameraId)
      return targets.flatMap((cam) =>
        Array.from({ length: Math.min(b.quantity || 1, cam.quantity) }, () => ({
          cameraId: cam.id,
          start: b.startDatetime,
          end: b.endDatetime,
          kind: 'block' as const,
        })),
      )
    }),
  ]

  const now = Date.now()
  const sortedBlocks = [...blockedSlots].sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime())
  const upcoming = sortedBlocks.filter((b) => new Date(b.endDatetime).getTime() >= now)
  const ended = sortedBlocks.filter((b) => new Date(b.endDatetime).getTime() < now)
  const visible = showEnded ? [...upcoming, ...ended] : upcoming

  return (
    <div className="space-y-4">
      {/* Heatmap — collapsed by default */}
      <div className="glass rounded-xl">
        <button
          onClick={() => setShowHeatmap((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left"
          aria-expanded={showHeatmap}
        >
          <span className="flex items-center gap-2 font-bold text-sm">
            <CalendarDays size={16} className="text-pink" /> ปฏิทินความหนาแน่นคิว
          </span>
          {showHeatmap ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>
        {showHeatmap && (
          <div className="px-2 pb-2">
            <BookingHeatmap rows={occupancyRows} />
          </div>
        )}
      </div>

      {/* Manual booking / block */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <CalendarPlus size={16} className="text-pink" /> บล็อกคิว / จองด้วยมือ
          </h2>
          <button onClick={() => setShowForm((v) => !v)} className="text-xs text-pink hover:text-pink-light font-semibold">
            {showForm ? 'ปิด' : '+ เพิ่มรายการ'}
          </button>
        </div>
        <p className="text-gray-500 text-xs mt-1">สำหรับลูกค้าที่ทัก DM/โทรจองตรง ไม่ผ่านเว็บ — บล็อกวันไว้ไม่ให้จองซ้ำ</p>

        <AnimatePresence>
          {showForm && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleAdd}
              className="overflow-hidden"
            >
              <div className="space-y-3 pt-3">
                <label className="block text-xs text-gray-500">
                  รุ่น
                  <select
                    value={camera}
                    onChange={(e) => { setCamera(e.target.value as CameraId | 'ALL'); setQty(1) }}
                    className="mt-1 w-full glass rounded-lg px-3 py-2 text-sm text-ink outline-none bg-transparent"
                  >
                    <option value="ALL">ทุกรุ่น</option>
                    {CAMERAS.map((c) => <option key={c.id} value={c.id}>{c.shortName}</option>)}
                  </select>
                </label>
                {stock > 1 && (
                  <label className="block text-xs text-gray-500">
                    จำนวนตัวที่บล็อก (มีทั้งหมด {stock} ตัว)
                    <select
                      value={qty}
                      onChange={(e) => setQty(Number(e.target.value))}
                      className="mt-1 w-full glass rounded-lg px-3 py-2 text-sm text-ink outline-none bg-transparent"
                    >
                      {Array.from({ length: stock }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} ตัว</option>)}
                    </select>
                  </label>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="text-xs text-gray-500">
                    เริ่ม
                    <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required
                      className="mt-1 w-full glass rounded-lg px-3 py-2 text-sm text-ink outline-none bg-transparent" />
                  </label>
                  <label className="text-xs text-gray-500">
                    ถึง
                    <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required
                      className="mt-1 w-full glass rounded-lg px-3 py-2 text-sm text-ink outline-none bg-transparent" />
                  </label>
                </div>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="หมายเหตุ (เช่น ชื่อลูกค้า, ทักผ่าน IG)"
                  aria-label="หมายเหตุ"
                  className="w-full glass rounded-lg px-3 py-2 text-sm outline-none bg-transparent placeholder:text-gray-300"
                />
                <Button type="submit" variant="primary" size="sm" fullWidth loading={submitting}>บันทึก</Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-4 pt-3 border-t border-pink-100">
          <p className="text-xs text-gray-500 font-semibold mb-2">
            รายการที่บล็อกไว้ — ยังไม่หมด {upcoming.length}
          </p>
          {visible.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">ไม่มีรายการ</p>
          ) : (
            <div className="space-y-2">
              {visible.map((b) => {
                const isEnded = new Date(b.endDatetime).getTime() < now
                return (
                  <div key={b.id} className={`flex items-center justify-between gap-2 text-xs ${isEnded ? 'opacity-50' : ''}`}>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {b.cameraId === 'ALL' ? 'ทุกรุ่น' : cameraName(b.cameraId)}
                        {b.cameraId !== 'ALL' && b.quantity > 1 && ` (${b.quantity} ตัว)`}
                        {isEnded && <span className="text-gray-400 font-normal"> · หมดแล้ว</span>}
                        {b.reason && <span className="text-gray-500 font-normal"> · {b.reason}</span>}
                      </p>
                      <p className="text-gray-500">
                        {format(new Date(b.startDatetime), 'd MMM HH:mm', { locale: th })} – {format(new Date(b.endDatetime), 'd MMM HH:mm', { locale: th })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(b)}
                      disabled={deletingId === b.id}
                      className="p-2 rounded-lg hover:bg-red-50 text-red-500 shrink-0 disabled:opacity-40"
                      title="ลบ"
                      aria-label="ลบรายการบล็อก"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {ended.length > 0 && (
            <button onClick={() => setShowEnded((v) => !v)} className="mt-3 text-xs text-pink hover:text-pink-light font-medium">
              {showEnded ? 'ซ่อนที่หมดแล้ว' : `แสดงที่หมดแล้ว (${ended.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
