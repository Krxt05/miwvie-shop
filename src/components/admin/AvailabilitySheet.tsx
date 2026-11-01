'use client'
import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { Booking, RentalArea } from '@/types'
import { BlockedSlot } from '@/lib/api'
import { MIN_PROVINCIAL_DURATION_HOURS } from '@/lib/cameras'
import { availabilityReply, checkAvailability } from '@/lib/availability'

interface Props {
  bookings: Booking[]
  blockedSlots: BlockedSlot[]
  onClose: () => void
}

// yyyy-MM-ddTHH:mm in Bangkok time, for <input type="datetime-local">
function localInput(ms: number): string {
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 16)
}
const fromInput = (v: string) => new Date(`${v.length === 10 ? `${v}T12:00` : v}:00+07:00`)

// "ว่างไหมวันที่ X" → which models are free, plus a reply to paste in the chat
export default function AvailabilitySheet({ bookings, blockedSlots, onClose }: Props) {
  const nextHour = Math.ceil(Date.now() / 3600_000) * 3600_000
  const [area, setArea] = useState<RentalArea>('local')
  const [start, setStart] = useState(localInput(nextHour))
  const [end, setEnd] = useState(localInput(nextHour + 24 * 3600_000))
  const [copied, setCopied] = useState(false)
  const [manual, setManual] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const s = fromInput(area === 'provincial' ? start.slice(0, 10) : start)
  const e = fromInput(area === 'provincial' ? end.slice(0, 10) : end)
  const valid = !isNaN(s.getTime()) && !isNaN(e.getTime()) && e > s
  const tooShort = area === 'provincial' && valid && (e.getTime() - s.getTime()) / 3600_000 < MIN_PROVINCIAL_DURATION_HOURS

  const result = useMemo(
    () => (valid ? checkAvailability(bookings, blockedSlots, area, s, e) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, blockedSlots, area, start, end, valid],
  )
  const reply = valid ? availabilityReply(result, area, s, e) : ''

  function setStartKeepLength(v: string) {
    const len = fromInput(end).getTime() - fromInput(start).getTime()
    setStart(v)
    const ns = fromInput(v).getTime()
    if (!isNaN(ns) && len > 0) setEnd(localInput(ns + len))
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(reply)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setManual(true)
    }
  }

  const inputType = area === 'provincial' ? 'date' : 'datetime-local'
  const value = (v: string) => (area === 'provincial' ? v.slice(0, 10) : v)
  const fromValue = (v: string, prev: string) => (area === 'provincial' ? `${v}${prev.slice(10)}` : v)

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-ink/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="เช็คคิวว่าง"
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl bg-white p-4 tabular-nums"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold">เช็คคิวว่าง</p>
          <button onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center text-gray-600" aria-label="ปิด">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 bg-pink-50 rounded-lg p-1 mb-3" role="tablist" aria-label="พื้นที่">
          {(['local', 'provincial'] as const).map((a) => (
            <button
              key={a}
              role="tab"
              aria-selected={area === a}
              onClick={() => {
                setArea(a)
                if (a === 'provincial') {
                  const ns = fromInput(start.slice(0, 10)).getTime()
                  setEnd(localInput(ns + 3 * 24 * 3600_000))
                }
              }}
              className={`min-h-10 rounded-md text-sm font-medium ${area === a ? 'bg-white text-ink shadow-sm' : 'text-gray-600'}`}
            >
              {a === 'local' ? 'ในพื้นที่ มมส.' : 'ส่งต่างจังหวัด'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2">
          <label className="text-xs text-gray-600">
            {area === 'provincial' ? 'วันที่พัสดุถึงมือ' : 'รับกล้อง'}
            <input
              type={inputType}
              value={value(start)}
              onChange={(ev) => setStartKeepLength(fromValue(ev.target.value, start))}
              className="mt-1 w-full min-h-11 rounded-lg border border-pink-100 px-3 text-base text-ink outline-none"
            />
          </label>
          <label className="text-xs text-gray-600">
            {area === 'provincial' ? 'วันที่ส่งคืน' : 'คืนกล้อง'}
            <input
              type={inputType}
              value={value(end)}
              onChange={(ev) => setEnd(fromValue(ev.target.value, end))}
              className="mt-1 w-full min-h-11 rounded-lg border border-pink-100 px-3 text-base text-ink outline-none"
            />
          </label>
        </div>

        {!valid ? (
          <p className="text-sm text-red-700 mt-3">วันคืนต้องอยู่หลังวันรับ</p>
        ) : (
          <>
            {tooShort && <p className="text-xs text-[#6F5220] mt-2">ต่างจังหวัดเช่าขั้นต่ำ 3 วัน</p>}
            <ul className="mt-3 divide-y divide-pink-100 border border-pink-100 rounded-xl">
              {result.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-3 min-h-11 text-sm">
                  <span className="text-ink">{r.name}</span>
                  {r.free > 0 ? (
                    <span className="text-emerald-700 font-semibold">ว่าง{r.units > 1 ? ` ${r.free}/${r.units}` : ''}</span>
                  ) : (
                    <span className="text-red-700">เต็ม</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-600 mt-2">
              คิดเวลาชาร์จแบต 1 ชม. หลังคืน{area === 'provincial' ? ' และเวลาส่งพัสดุ ±3 วัน' : ''} เหมือนตอนลูกค้าจองบนเว็บ
            </p>
            <div className="mt-3 rounded-xl bg-cream/60 p-3">
              <p className="text-sm whitespace-pre-line text-ink">{reply}</p>
            </div>
            {manual && (
              <textarea readOnly value={reply} rows={4} autoFocus onFocus={(ev) => ev.currentTarget.select()}
                className="mt-2 w-full rounded-lg bg-gray-50 px-2 py-1 text-xs outline-none" />
            )}
            <button onClick={copy} className="mt-3 w-full min-h-11 rounded-xl bg-pink text-white text-sm font-medium flex items-center justify-center gap-1.5">
              {copied ? <><Check size={16} /> คัดลอกแล้ว</> : <><Copy size={16} /> คัดลอกคำตอบไปวางในแชท</>}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
