'use client'
import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Gift, X } from 'lucide-react'
import { DiscountCodeRow, generateDiscountCode, listDiscountCodes } from '@/lib/api'
import { Booking } from '@/types'
import { dayTimeLabel } from '@/lib/admin'
import { REVIEW_REQUEST, reviewThanks } from '@/lib/messages'
import Button from '@/components/ui/Button'

// Review discount codes, issued straight from the header: the customer sends
// their photos in the chat, so there's no need to find their booking first.
export default function ReviewCodeSheet({ pin, bookings, onClose }: { pin: string; bookings: Booking[]; onClose: () => void }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [manual, setManual] = useState<string | null>(null)
  const [history, setHistory] = useState<DiscountCodeRow[] | null>(null)
  const [historyError, setHistoryError] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'used'>('all')
  const byId = useMemo(() => new Map(bookings.map((b) => [b.bookingId, b])), [bookings])

  useEffect(() => {
    listDiscountCodes(pin)
      .then(setHistory)
      .catch((e) => setHistoryError(e instanceof Error ? e.message : 'โหลดประวัติไม่สำเร็จ'))
  }, [pin])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  async function issue() {
    setLoading(true)
    setError('')
    try {
      const res = await generateDiscountCode(pin)
      if (res.code) {
        const issued = res.code
        setCode(issued); setCopied(null); setManual(null)
        setHistory((h) => [
          { code: issued, source: 'manual', createdAt: new Date().toISOString(), usedBy: '', usedAt: '', status: 'active' },
          ...(h ?? []),
        ])
      }
      else setError(res.error || 'ออกโค้ดไม่สำเร็จ')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ออกโค้ดไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000)
    } catch {
      setManual(id) // clipboard blocked — show the text to copy by hand
    }
  }

  const who = (id: string) => {
    const b = byId.get(id)
    return b ? `${String(b.customerName).trim()} (${id})` : id
  }
  const shown = (history ?? []).filter((r) => filter === 'all' || r.status === filter)
  const counts = {
    all: history?.length ?? 0,
    active: history?.filter((r) => r.status === 'active').length ?? 0,
    used: history?.filter((r) => r.status === 'used').length ?? 0,
  }

  const items = [
    ...(code ? [{ id: 'thanks', label: 'ขอบคุณหลังรีวิว + โค้ด', text: reviewThanks(code) }] : []),
    { id: 'review', label: 'ขอรีวิว', text: REVIEW_REQUEST },
  ]

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="โค้ดส่วนลด"
        className="w-full max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 text-left shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-bold flex items-center gap-1.5"><Gift size={16} className="text-pink" /> โค้ดส่วนลด 10% สำหรับรีวิว</p>
            <p className="text-xs text-gray-600">ใช้ได้ 1 ครั้ง · กดออกใหม่ได้ทุกครั้ง</p>
          </div>
          <button onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center text-gray-600" aria-label="ปิด">
            <X size={20} />
          </button>
        </div>

        {code && (
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 rounded-lg px-3 py-2 text-center font-mono font-bold text-lg tracking-widest bg-pink-50 border border-pink-200 text-gold">
              {code}
            </div>
            <button onClick={() => copy('code', code)} className="w-11 h-11 rounded-lg glass flex items-center justify-center" aria-label="คัดลอกโค้ด" title="คัดลอกโค้ด">
              {copied === 'code' ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} className="text-gold" />}
            </button>
          </div>
        )}

        <Button variant={code ? 'outline' : 'primary'} fullWidth loading={loading} onClick={issue}>
          <Gift size={16} /> {code ? 'ออกโค้ดใหม่อีกอัน' : 'ออกโค้ดส่วนลด'}
        </Button>
        {error && <p className="text-pink text-sm mt-2">{error}</p>}

        <ul className="space-y-2 mt-4">
          {items.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => copy(t.id, t.text)}
                className="w-full text-left rounded-xl border border-pink-100 px-3 py-2.5 hover:bg-pink-50"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{t.label}</span>
                  <span className="text-xs text-pink flex items-center gap-1">
                    {copied === t.id ? <><Check size={13} /> คัดลอกแล้ว</> : <><Copy size={13} /> แตะเพื่อคัดลอก</>}
                  </span>
                </span>
                <span className="block text-xs text-gray-600 whitespace-pre-line mt-1">{t.text}</span>
              </button>
              {manual === t.id && (
                <textarea readOnly value={t.text} rows={5} autoFocus onFocus={(e) => e.currentTarget.select()}
                  className="mt-1 w-full rounded-lg bg-gray-50 px-2 py-1 text-xs outline-none" />
              )}
            </li>
          ))}
        </ul>
        {manual === 'code' && (
          <input readOnly value={code} autoFocus onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded-lg bg-gray-50 px-2 py-1 text-sm font-mono outline-none" />
        )}

        <div className="border-t border-pink-100 mt-4 pt-3">
          <p className="text-sm font-bold mb-2">ประวัติโค้ด</p>
          <div className="flex gap-1 mb-2">
            {(['all', 'active', 'used'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`min-h-9 px-3 rounded-lg text-xs font-medium ${filter === f ? 'bg-pink text-white' : 'border border-pink-100 text-gray-600'}`}
              >
                {f === 'all' ? 'ทั้งหมด' : f === 'active' ? 'ยังไม่ใช้' : 'ใช้แล้ว'} {counts[f]}
              </button>
            ))}
          </div>
          {historyError ? (
            <p className="text-pink text-xs">{historyError}</p>
          ) : !history ? (
            <p className="text-gray-500 text-xs">กำลังโหลด...</p>
          ) : !shown.length ? (
            <p className="text-gray-500 text-xs">ยังไม่มีโค้ด</p>
          ) : (
            <ul className="divide-y divide-pink-50">
              {shown.map((r) => (
                <li key={r.code} className="py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => copy(`h-${r.code}`, r.code)} className="font-mono font-bold text-sm text-ink flex items-center gap-1" title="คัดลอกโค้ด">
                      {r.code}
                      {copied === `h-${r.code}` ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} className="text-gray-400" />}
                    </button>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${
                      r.status === 'used' ? 'bg-emerald-50 text-emerald-700' : r.status === 'active' ? 'bg-pink-50 text-pink' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {r.status === 'used' ? 'ใช้แล้ว' : r.status === 'active' ? 'ยังไม่ใช้' : 'หมดอายุ'}
                    </span>
                  </div>
                  <p className="text-gray-600 mt-0.5">
                    ออก {dayTimeLabel(r.createdAt)}
                    {r.source && r.source !== 'manual' && ` · ให้ ${who(r.source)}`}
                  </p>
                  {r.usedBy && (
                    <p className="text-gray-600">ใช้กับ {who(r.usedBy)}{r.usedAt && ` · ${dayTimeLabel(r.usedAt)}`}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
