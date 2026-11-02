'use client'
import { useEffect, useRef, useState } from 'react'
import { CalendarPlus, Trash2 } from 'lucide-react'
import { Booking, CameraId } from '@/types'
import { CAMERAS } from '@/lib/cameras'
import { blockDates, listBlockedSlots, deleteBlockedSlot, newRequestKey, BlockedSlot } from '@/lib/api'
import { bangkokDay, dayTimeLabel, shiftDay } from '@/lib/admin'
import { blockConflict, closureCatches } from '@/lib/availability'
import { BlockMode, MODE_LABEL } from '@/lib/closures'
import Button from '@/components/ui/Button'
import { useFeedback } from './Feedback'
import { cameraName } from './BookingCard'
import QueueTimeline from './QueueTimeline'

const DAY_MS = 24 * 60 * 60 * 1000
// Ended blocks older than this drop out of the list (they stay on the sheet)
const ENDED_SHOWN_DAYS = 30

interface Props {
  pin: string
  bookings: Booking[]
  blockedSlots: BlockedSlot[]
  setBlockedSlots: (slots: BlockedSlot[] | ((prev: BlockedSlot[]) => BlockedSlot[])) => void
  onOpenBooking: (bookingId: string) => void
}

// Bangkok wall-clock hour right now (0-23), for form defaults
const hourNow = () => new Date(Date.now() + 7 * 3600_000).getUTCHours()
const at = (day: string, hour: string) => new Date(`${day}T${hour.padStart(2, '0')}:00:00+07:00`)

export default function QueueTab({ pin, bookings, blockedSlots, setBlockedSlots, onOpenBooking }: Props) {
  const { toast, confirm } = useFeedback()
  const formRef = useRef<HTMLFormElement>(null)
  const [showForm, setShowForm] = useState(false)
  // '' = not chosen yet; a walk-in or repair is one model, 'ALL' closes the shop
  const [camera, setCamera] = useState<CameraId | 'ALL' | ''>('')
  // Blocks are whole hours: a date plus an hour, no minutes to fiddle with
  const [startDate, setStartDate] = useState('')
  const [startHour, setStartHour] = useState('10')
  const [endDate, setEndDate] = useState('')
  const [endHour, setEndHour] = useState('10')
  const [reason, setReason] = useState('')
  const [qty, setQty] = useState(1)
  // hold = takes units; closed / nopickup = shop closure (holds no unit)
  const [mode, setMode] = useState<BlockMode>('hold')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showEnded, setShowEnded] = useState(false)
  // The owner saw the "range already full" warning and chose to block anyway
  const [acceptConflict, setAcceptConflict] = useState(false)

  // A fresh key whenever the form changes: a retry of the *same* form after a
  // timeout can't add the block twice, but an edited form is a new block.
  const requestKey = useRef(newRequestKey())
  useEffect(() => { requestKey.current = newRequestKey() }, [camera, qty, mode, startDate, startHour, endDate, endHour, reason])
  useEffect(() => { setAcceptConflict(false) }, [camera, qty, mode, startDate, startHour, endDate, endHour])

  const stock = camera === 'ALL' || camera === '' ? 1 : CAMERAS.find((c) => c.id === camera)?.quantity ?? 1
  const start = startDate ? at(startDate, startHour) : null
  const end = endDate ? at(endDate, endHour) : null
  const rangeError = start && end && end <= start ? 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม' : ''
  // Blocking one model over a range that's already full holds nothing — the
  // DM customer it's meant for would find no camera. Warn, but allow (a broken
  // camera still needs blocking; the owner then calls to move a booking).
  // Only a hold takes units, so only a hold can run out of them.
  const conflict = mode === 'hold' && camera && camera !== 'ALL' && start && end && !rangeError
    ? blockConflict(bookings, blockedSlots, camera, start, end, qty)
    : null
  // A closure strands bookings whose pickup (or return, for 'closed') falls inside
  const catches = mode !== 'hold' && camera && start && end && !rangeError
    ? closureCatches(bookings, { cameraId: camera, start, end, mode })
    : []
  const needsAccept = Boolean(conflict && conflict.over > 0) || catches.length > 0

  // Sensible default per target: closing the whole shop rarely means "hold every unit"
  const defaultMode = (c: CameraId | 'ALL' | ''): BlockMode => (c === 'ALL' ? 'closed' : 'hold')

  function openForm(fill: { camera?: CameraId | 'ALL' | ''; mode?: BlockMode; startDate: string; startHour: string; days?: number; endHour?: string; reason?: string }) {
    const cam = fill.camera ?? (camera === 'ALL' ? '' : camera)
    setCamera(cam)
    setMode(fill.mode ?? defaultMode(cam))
    setQty(1)
    setStartDate(fill.startDate)
    setStartHour(fill.startHour)
    setEndDate(shiftDay(fill.startDate, fill.days ?? 1))
    setEndHour(fill.endHour ?? fill.startHour)
    if (fill.reason !== undefined) setReason(fill.reason)
    setShowForm(true)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const today = bangkokDay(Date.now())
  const nextHour = String(Math.min(23, hourNow() + 1))
  const presets: { label: string; apply: () => void }[] = [
    { label: 'Walk-in 1 วัน', apply: () => openForm({ mode: 'hold', startDate: today, startHour: nextHour, days: 1, reason: 'walk-in: ' }) },
    { label: 'ซ่อม 7 วัน', apply: () => openForm({ mode: 'hold', startDate: today, startHour: nextHour, days: 7, reason: 'กล้องซ่อม' }) },
    { label: 'วันหยุด ทุกรุ่น', apply: () => openForm({ camera: 'ALL', mode: 'closed', startDate: today, startHour: '0', days: 1, endHour: '0', reason: 'ร้านหยุด' }) },
  ]

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!start || !end || rangeError || !camera) return
    if (needsAccept && !acceptConflict) return
    setSubmitting(true)
    try {
      const res = await blockDates(camera, start, end, reason.trim(), pin, mode === 'hold' ? qty : 0, requestKey.current, mode)
      if (!res.success) {
        toast(res.error || 'บันทึกไม่สำเร็จ', 'error')
        return
      }
      // The block is saved; a failed re-read only means the list refreshes later
      listBlockedSlots(pin).then(setBlockedSlots).catch(() => {})
      setStartDate('')
      setEndDate('')
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
      body: `${b.cameraId === 'ALL' ? 'ทุกรุ่น' : cameraName(b.cameraId)} · ${dayTimeLabel(b.startDatetime)} – ${dayTimeLabel(b.endDatetime)} — คิวช่วงนี้จะกลับมาจองได้`,
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
        // e.g. the other owner deleted it already — show the list as it is now
        listBlockedSlots(pin).then(setBlockedSlots).catch(() => {})
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'ลบไม่สำเร็จ', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const now = Date.now()
  const endMs = (b: BlockedSlot) => new Date(b.endDatetime).getTime()
  const sortedBlocks = [...blockedSlots].sort((a, b) => new Date(a.startDatetime).getTime() - new Date(b.startDatetime).getTime())
  const upcoming = sortedBlocks.filter((b) => endMs(b) >= now)
  const ended = sortedBlocks.filter((b) => endMs(b) < now && endMs(b) >= now - ENDED_SHOWN_DAYS * DAY_MS).reverse()

  return (
    <div className="space-y-4">
      <QueueTimeline
        bookings={bookings}
        blocks={blockedSlots}
        onOpenBooking={onOpenBooking}
        onBlockDay={(cameraId, day) => openForm({ camera: cameraId, startDate: day, startHour: '10', days: 1 })}
        onDeleteBlock={handleDelete}
      />

      <section className="glass rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <CalendarPlus size={16} className="text-pink" /> บล็อกคิว
          </h2>
          <button
            onClick={() => (showForm ? setShowForm(false) : openForm({ startDate: today, startHour: nextHour, days: 1 }))}
            className={`min-h-11 px-4 rounded-xl text-sm font-semibold ${showForm ? 'text-gray-600' : 'bg-pink text-white'}`}
          >
            {showForm ? 'ปิด' : '+ บล็อกคิว'}
          </button>
        </div>
        <p className="text-gray-600 text-xs mt-1">ลูกค้าทัก DM/walk-in, กล้องซ่อม หรือร้านหยุด — ช่วงที่บล็อกลูกค้าจองบนเว็บไม่ได้</p>

        <div className="grid grid-cols-3 gap-1.5 mt-3" role="group" aria-label="บล็อกด่วน">
          {presets.map((p) => (
            <button key={p.label} type="button" onClick={p.apply} className="min-h-11 rounded-xl border border-pink-200 text-xs font-medium text-pink px-1">
              {p.label}
            </button>
          ))}
        </div>

        {showForm && (
          <form ref={formRef} onSubmit={handleAdd} className="space-y-3 pt-4 scroll-mt-4">
            <label className="block text-xs text-gray-600">
              รุ่น
              <select
                value={camera}
                onChange={(e) => {
                  const c = e.target.value as CameraId | 'ALL' | ''
                  setCamera(c)
                  setMode(defaultMode(c))
                  setQty(1)
                }}
                className={`mt-1 w-full ${FIELD} ${camera ? '' : 'border-brass'}`}
              >
                <option value="" disabled>เลือกรุ่น…</option>
                <option value="ALL">ทุกรุ่น (ปิดร้าน)</option>
                {CAMERAS.map((c) => <option key={c.id} value={c.id}>{c.shortName}</option>)}
              </select>
            </label>
            <fieldset className="text-xs text-gray-600">
              <legend>ประเภท</legend>
              <div className="mt-1 grid gap-1.5" role="radiogroup" aria-label="ประเภทบล็อก">
                {MODE_OPTIONS.map((o) => (
                  <button
                    key={o.mode}
                    type="button"
                    role="radio"
                    aria-checked={mode === o.mode}
                    onClick={() => setMode(o.mode)}
                    className={`min-h-11 rounded-xl border px-3 py-2 text-left ${mode === o.mode ? 'border-pink bg-pink-50 ring-1 ring-pink' : 'border-pink-100'}`}
                  >
                    <span className="block text-sm font-semibold text-ink">{o.icon} {MODE_LABEL[o.mode]}</span>
                    <span className="block text-[11px] text-gray-600">{o.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            {camera === 'ALL' && mode === 'hold' && (
              <p className="text-xs text-[#6F5220] -mt-1" role="alert">ปิดร้านแบบกันเครื่อง: ลูกค้าที่เช่าอยู่จะคืน/เช่าคร่อมไม่ได้</p>
            )}
            {mode === 'hold' && stock > 1 && (
              <label className="block text-xs text-gray-600">
                จำนวนตัวที่บล็อก (มีทั้งหมด {stock} ตัว)
                <select value={qty} onChange={(e) => setQty(Number(e.target.value))} className={`mt-1 w-full ${FIELD}`}>
                  {Array.from({ length: stock }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} ตัว</option>)}
                </select>
              </label>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <DateHour
                label="เริ่ม"
                date={startDate}
                hour={startHour}
                onDate={(d) => {
                  // Keep the block's length when the start moves (default 1 day)
                  const len = start && end && end > start ? end.getTime() - start.getTime() : DAY_MS
                  setStartDate(d)
                  const ne = new Date(at(d, startHour).getTime() + len + 7 * 3600_000)
                  setEndDate(ne.toISOString().slice(0, 10))
                  setEndHour(String(ne.getUTCHours()))
                }}
                onHour={setStartHour}
              />
              <DateHour label="ถึง" date={endDate} hour={endHour} onDate={setEndDate} onHour={setEndHour} error={rangeError} />
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="หมายเหตุ เช่น walk-in: ชื่อ + เบอร์, กล้องซ่อม"
              aria-label="หมายเหตุ"
              className={`w-full ${FIELD} placeholder:text-gray-500`}
            />
            {!camera && <p className="text-xs text-[#6F5220] -mt-1">เลือกรุ่นที่จะบล็อกก่อน</p>}
            {conflict && conflict.over === 0 && (
              <p className="text-xs text-emerald-700 -mt-1">ช่วงนี้ยังว่างพอให้บล็อก (รวมบล็อกนี้ใช้สูงสุด {conflict.peak}/{conflict.units})</p>
            )}
            {conflict && conflict.over > 0 && (
              <div className="rounded-lg border border-brass bg-brass-light/20 p-3 text-xs text-[#6F5220] space-y-1.5" role="alert">
                <p className="font-semibold">ช่วงนี้ {cameraName(camera)} เต็มแล้ว — บล็อกแล้วจะเกิน {conflict.over} เครื่อง</p>
                {conflict.inTheWay.length > 0 && (
                  <ul className="space-y-0.5">
                    {conflict.inTheWay.map((b) => (
                      <li key={b.bookingId}>{b.customerName} · {b.bookingId} · {dayTimeLabel(b.pickupDatetime)} – {dayTimeLabel(b.returnDatetime)}</li>
                    ))}
                  </ul>
                )}
                <label className="flex items-center gap-2 min-h-11 text-sm text-ink">
                  <input type="checkbox" checked={acceptConflict} onChange={(e) => setAcceptConflict(e.target.checked)} className="w-5 h-5 accent-pink" />
                  รู้แล้ว บล็อกต่อ (จะติดต่อเลื่อนคิวเอง)
                </label>
              </div>
            )}
            {catches.length > 0 && (
              <div className="rounded-lg border border-brass bg-brass-light/20 p-3 text-xs text-[#6F5220] space-y-1.5" role="alert">
                <p className="font-semibold">คิวที่รับ/คืนตรงช่วงนี้ — ต้องติดต่อเลื่อน ({catches.length})</p>
                <ul className="space-y-0.5">
                  {catches.map((b) => (
                    <li key={b.bookingId}>{b.customerName} · {cameraName(b.cameraId)} · {b.bookingId} · {dayTimeLabel(b.pickupDatetime)} – {dayTimeLabel(b.returnDatetime)}</li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 min-h-11 text-sm text-ink">
                  <input type="checkbox" checked={acceptConflict} onChange={(e) => setAcceptConflict(e.target.checked)} className="w-5 h-5 accent-pink" />
                  รู้แล้ว บันทึกต่อ (จะติดต่อเลื่อนคิวเอง)
                </label>
              </div>
            )}
            <Button type="submit" variant="primary" size="sm" fullWidth loading={submitting} disabled={!camera || !start || !end || Boolean(rangeError) || (needsAccept && !acceptConflict)}>
              บันทึกบล็อก
            </Button>
          </form>
        )}

        <div className="mt-4 pt-3 border-t border-pink-100">
          <p className="text-xs text-gray-600 font-semibold mb-1">ยังไม่หมด ({upcoming.length})</p>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-600 py-2">ไม่มีรายการ</p>
          ) : (
            <ul>
              {upcoming.map((b) => (
                <BlockRow key={b.id} b={b} onDelete={() => handleDelete(b)} deleting={deletingId === b.id} />
              ))}
            </ul>
          )}
          {ended.length > 0 && (
            <>
              <button onClick={() => setShowEnded((v) => !v)} className="mt-1 min-h-11 text-sm text-pink font-medium">
                {showEnded ? 'ซ่อนที่หมดแล้ว' : `หมดแล้วใน ${ENDED_SHOWN_DAYS} วันล่าสุด (${ended.length})`}
              </button>
              {showEnded && (
                <ul className="text-gray-600">
                  {ended.map((b) => <BlockRow key={b.id} b={b} ended />)}
                </ul>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function BlockRow({ b, ended, onDelete, deleting }: { b: BlockedSlot; ended?: boolean; onDelete?: () => void; deleting?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 border-b border-cream last:border-0">
      <div className="min-w-0 text-sm">
        <p className={`font-semibold truncate ${ended ? 'text-gray-600' : 'text-ink'}`}>
          {b.cameraId === 'ALL' ? 'ทุกรุ่น' : cameraName(b.cameraId)}
          {b.mode === 'hold' && b.cameraId !== 'ALL' && b.quantity > 1 && ` (${b.quantity} ตัว)`}
          <ModeBadge mode={b.mode} />
          {b.reason && <span className="font-normal text-gray-600"> · {b.reason}</span>}
        </p>
        <p className="text-xs text-gray-600 tabular-nums">{dayTimeLabel(b.startDatetime)} – {dayTimeLabel(b.endDatetime)}</p>
      </div>
      {!ended && onDelete && (
        <button
          onClick={onDelete}
          disabled={deleting}
          className="w-11 h-11 flex items-center justify-center rounded-lg text-red-600 shrink-0 disabled:opacity-40"
          aria-label="ลบรายการบล็อก"
        >
          <Trash2 size={16} />
        </button>
      )}
    </li>
  )
}

const MODE_OPTIONS: { mode: BlockMode; icon: string; hint: string }[] = [
  { mode: 'hold', icon: '📷', hint: 'กันเครื่องไว้ทั้งช่วง ลูกค้าจองทับไม่ได้ (walk-in, ซ่อม)' },
  { mode: 'closed', icon: '🚪', hint: 'ไม่กันเครื่อง แต่ห้ามรับและห้ามคืนในช่วงนี้ เช่าคร่อมได้' },
  { mode: 'nopickup', icon: '↩️', hint: 'ลูกค้าเอากล้องมาคืนได้ แต่ห้ามรับเครื่องใหม่' },
]

function ModeBadge({ mode }: { mode: BlockMode }) {
  if (mode === 'hold') return null
  return (
    <span className={`ml-1.5 inline-block rounded px-1.5 text-[10px] font-medium align-middle ${mode === 'closed' ? 'bg-gray-200 text-gray-700' : 'border border-dashed border-gray-400 text-gray-700'}`}>
      {mode === 'closed' ? 'ร้านหยุด' : 'ห้ามรับใหม่'}
    </span>
  )
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h))
const FIELD = 'min-h-11 glass rounded-lg px-3 text-base sm:text-sm text-ink outline-none bg-transparent'

function DateHour({ label, date, hour, onDate, onHour, error }: {
  label: string
  date: string
  hour: string
  onDate: (v: string) => void
  onHour: (v: string) => void
  error?: string
}) {
  return (
    <fieldset className="text-xs text-gray-600">
      <legend>{label}</legend>
      <div className="mt-1 flex gap-2">
        <input type="date" value={date} onChange={(e) => onDate(e.target.value)} required aria-label={`${label} วันที่`}
          className={`flex-1 min-w-0 ${FIELD} ${error ? 'border-brass' : ''}`} />
        <select value={hour} onChange={(e) => onHour(e.target.value)} aria-label={`${label} เวลา`} className={`w-28 ${FIELD} ${error ? 'border-brass' : ''}`}>
          {HOURS.map((h) => <option key={h} value={h}>{h.padStart(2, '0')}:00</option>)}
        </select>
      </div>
      {error && <p className="text-[#6F5220] mt-1" role="alert">{error}</p>}
    </fieldset>
  )
}
