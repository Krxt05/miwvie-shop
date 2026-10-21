'use client'
import { ReactNode, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { addDays, format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ChevronDown, ChevronUp, ExternalLink, CheckCircle, Package, RotateCcw,
  XCircle, Gift, Copy, Check, StickyNote, AlertTriangle,
} from 'lucide-react'
import { Booking, BookingStatus } from '@/types'
import { CAMERAS, PROVINCIAL_SHIP_LEAD_DAYS } from '@/lib/cameras'
import { STATUS_LABEL, isOverdue } from '@/lib/admin'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

const STATUS_ACTIONS: Record<BookingStatus, { next: BookingStatus; label: string; icon: React.ElementType }[]> = {
  pending: [{ next: 'confirmed', label: 'ยืนยันรับเงิน', icon: CheckCircle }],
  confirmed: [
    { next: 'active', label: 'ส่งกล้องแล้ว', icon: Package },
    { next: 'returned', label: 'รับคืนแล้ว', icon: RotateCcw },
  ],
  active: [{ next: 'returned', label: 'รับคืนแล้ว', icon: RotateCcw }],
  returned: [],
  cancelled: [],
}

export interface AdminActions {
  actionLoading: string | null
  codeLoading: string | null
  discountCodes: Record<string, string>
  setStatus: (bookingId: string, status: BookingStatus) => void
  cancel: (bookingId: string) => void
  generateCode: (bookingId: string) => void
  saveNotes: (bookingId: string, notes: string) => Promise<boolean>
}

export function cameraName(id: string): string {
  return CAMERAS.find((c) => c.id === id)?.shortName ?? id
}

interface Props {
  b: Booking
  expanded: boolean
  onToggle: () => void
  actions: AdminActions
  // Extra line under the name, e.g. "ส่ง 14:00 · Delivery" on the today tab
  context?: ReactNode
}

export default function BookingCard({ b, expanded, onToggle, actions, context }: Props) {
  const statusActions = STATUS_ACTIONS[b.bookingStatus] ?? []
  const existingCode = actions.discountCodes[b.bookingId] || String(b.discountCode || '')
  const missingDocs = (!b.idCardImage || !b.igProfileImage) && b.bookingStatus !== 'cancelled'
  const overdue = isOverdue(b)
  const isProv = b.rentalArea === 'provincial'
  const busy = actions.actionLoading === b.bookingId

  return (
    <div className={`glass rounded-xl overflow-hidden ${overdue ? 'ring-1 ring-red-300' : ''}`}>
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-pink-50 transition-colors"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <Badge label={STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus} variant={b.bookingStatus} />
            {isProv && (
              <span className="text-[10px] text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-1.5 py-0.5">ต่างจังหวัด</span>
            )}
            {overdue && (
              <span className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5">เลยกำหนดคืน</span>
            )}
            {Number(b.discountAmount) > 0 && (
              <span className="text-[10px] text-gold border border-gold/30 rounded-full px-1.5 py-0.5">ส่วนลด</span>
            )}
            {/* Photos arrive on a second request, so a booking can exist without
                them — surface it so nobody confirms a rental with no ID on file. */}
            {missingDocs && (
              <span className="text-[10px] text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-1.5 py-0.5">
                ⚠️ หลักฐานไม่ครบ
              </span>
            )}
          </div>
          <p className="font-semibold text-sm truncate">{String(b.customerName)}</p>
          <p className="text-gray-500 text-xs truncate">
            {cameraName(b.cameraId)} ·{' '}
            {b.pickupDatetime ? format(new Date(b.pickupDatetime), 'd MMM HH:mm', { locale: th }) : '-'}
            {' → '}
            {b.returnDatetime ? format(new Date(b.returnDatetime), 'd MMM HH:mm', { locale: th }) : '-'}
          </p>
          {context && <div className="text-xs mt-1">{context}</div>}
          {b.adminNotes && (
            <p className="text-xs text-brass-dark mt-1 truncate flex items-center gap-1">
              <StickyNote size={11} className="shrink-0" /> {b.adminNotes}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-gold font-bold">{Number(b.totalAmount).toLocaleString()} ฿</p>
          <p className="font-mono text-[10px] text-gray-400 mt-0.5 hidden sm:block">{b.bookingId}</p>
          {expanded ? <ChevronUp size={16} className="text-gray-400 ml-auto mt-1" /> : <ChevronDown size={16} className="text-gray-400 ml-auto mt-1" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-pink-100 p-4 space-y-4">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
                <Detail label="เลขจอง" value={b.bookingId} mono />
                <Detail label="ชื่อ" value={String(b.customerName)} />
                <Detail label="โทร" value={String(b.customerPhone)} />
                <Detail label="IG" value={String(b.customerIG) || '-'} />
                <Detail label="กล้อง" value={cameraName(b.cameraId)} />
                <Detail label="พื้นที่" value={isProv ? 'ต่างจังหวัด (ส่งพัสดุ)' : 'ในพื้นที่ มมส.'} />
                {isProv && b.pickupDatetime && (
                  <Detail
                    label="ร้านส่งพัสดุ"
                    value={format(addDays(new Date(b.pickupDatetime), -PROVINCIAL_SHIP_LEAD_DAYS), 'd MMM yyyy', { locale: th })}
                  />
                )}
                <Detail
                  label={isProv ? 'พัสดุถึงมือ' : 'รับ'}
                  value={b.pickupDatetime ? format(new Date(b.pickupDatetime), isProv ? 'd MMM yyyy' : 'd MMM yyyy HH:mm', { locale: th }) : '-'}
                />
                <Detail
                  label={isProv ? 'ส่งคืน (ก่อน 12:00)' : 'คืน'}
                  value={b.returnDatetime ? format(new Date(b.returnDatetime), isProv ? 'd MMM yyyy' : 'd MMM yyyy HH:mm', { locale: th }) : '-'}
                />
                {isProv ? (
                  <>
                    <Detail
                      label="ที่อยู่จัดส่ง"
                      value={`${b.shippingAddress} ต.${b.shippingSubdistrict} อ./เขต ${b.shippingDistrict} จ.${b.shippingProvince} ${b.shippingPostalCode}`}
                      wrap
                    />
                    <Detail
                      label="แจ้งเลขพัสดุภายใน"
                      value={b.returnDatetime ? `เที่ยงวันที่ ${format(addDays(new Date(b.returnDatetime), 1), 'd MMM yyyy', { locale: th })}` : '-'}
                    />
                  </>
                ) : (
                  <>
                    <Detail label="รับเครื่อง" value={b.pickupType === 'delivery' ? `Delivery → ${b.pickupAddress}` : 'รับเอง'} wrap />
                    <Detail
                      label="คืนเครื่อง"
                      value={b.returnType === 'delivery' ? `ให้ร้านรับ${b.returnAddress ? ` → ${b.returnAddress}` : ''}` : 'คืนเอง'}
                      wrap
                    />
                  </>
                )}
                <Detail
                  label="ยอด"
                  value={`${Number(b.totalAmount).toLocaleString()} ฿${Number(b.deliveryFee) > 0 ? ` (ค่าส่ง ${Number(b.deliveryFee).toLocaleString()} ฿)` : ''}`}
                />
              </div>

              {(Number(b.discountAmount) > 0 || b.discountCode) && (
                <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(140,43,63,0.1)', border: '1px solid rgba(140,43,63,0.2)' }}>
                  <span className="text-gold">โค้ดส่วนลด: </span>
                  <span className="font-mono font-bold text-gold">{String(b.discountCode)}</span>
                  <span className="text-gray-400"> (ลด {Number(b.discountAmount).toLocaleString()} ฿)</span>
                </div>
              )}

              <div className="flex gap-3 flex-wrap">
                {b.idCardImage && (
                  <a href={String(b.idCardImage)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-pink hover:text-pink-light">
                    <ExternalLink size={12} /> บัตรประชาชน
                  </a>
                )}
                {b.igProfileImage && (
                  <a href={String(b.igProfileImage)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-pink hover:text-pink-light">
                    <ExternalLink size={12} /> IG Profile
                  </a>
                )}
                {(!b.idCardImage || !b.igProfileImage) && (
                  <span className="text-xs text-amber-700">
                    ⚠️ ยังไม่ได้รับ{!b.idCardImage ? 'รูปบัตรประชาชน' : ''}
                    {!b.idCardImage && !b.igProfileImage ? ' และ' : ''}
                    {!b.igProfileImage ? 'รูปโปรไฟล์ IG' : ''} — ขอจากลูกค้าทาง IG ก่อนยืนยัน
                  </span>
                )}
              </div>

              <NotesEditor b={b} onSave={actions.saveNotes} />

              {isProv && b.bookingStatus !== 'returned' && b.bookingStatus !== 'cancelled' && (
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 leading-relaxed flex gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  กด &ldquo;รับคืนแล้ว&rdquo; เมื่อพัสดุถึงร้านจริง (ไม่ใช่ตอนลูกค้าแจ้งเลขพัสดุ) — กดแล้วคิวจะว่างทันที
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {statusActions.map(({ next, label, icon: Icon }) => (
                  <Button key={next} size="sm" variant="primary" loading={busy} onClick={() => actions.setStatus(b.bookingId, next)}>
                    <Icon size={14} />
                    {label}
                  </Button>
                ))}
                {b.bookingStatus !== 'cancelled' && b.bookingStatus !== 'returned' && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => actions.cancel(b.bookingId)} className="text-red-500 hover:text-red-600">
                    <XCircle size={14} />
                    ยกเลิก
                  </Button>
                )}
              </div>

              {b.bookingStatus === 'returned' && (
                <ReviewCode
                  bookingId={b.bookingId}
                  code={existingCode}
                  loading={actions.codeLoading === b.bookingId}
                  onGenerate={() => actions.generateCode(b.bookingId)}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function NotesEditor({ b, onSave }: { b: Booking; onSave: AdminActions['saveNotes'] }) {
  const [draft, setDraft] = useState(b.adminNotes || '')
  const [saving, setSaving] = useState(false)

  // Pick up the saved value after a save or a refresh.
  useEffect(() => { setDraft(b.adminNotes || '') }, [b.adminNotes])

  const dirty = draft !== (b.adminNotes || '')

  async function save() {
    setSaving(true)
    await onSave(b.bookingId, draft.trim())
    setSaving(false)
  }

  return (
    <div>
      <label htmlFor={`note-${b.bookingId}`} className="text-xs text-gray-500 flex items-center gap-1 mb-1">
        <StickyNote size={11} /> โน้ตแอดมิน (ลูกค้าไม่เห็น)
      </label>
      <textarea
        id={`note-${b.bookingId}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="เช่น กล้องมีรอยขีดตอนรับคืน, ลูกค้าขอรับก่อนเวลา 30 นาที"
        className="w-full glass rounded-lg px-3 py-2 text-sm outline-none bg-transparent placeholder:text-gray-300 resize-y"
      />
      {dirty && (
        <div className="flex justify-end gap-2 mt-1.5">
          <button onClick={() => setDraft(b.adminNotes || '')} className="text-xs text-gray-500 px-2 py-1 hover:text-gray-700">
            ยกเลิกแก้
          </button>
          <Button size="sm" variant="outline" loading={saving} onClick={save}>
            บันทึกโน้ต
          </Button>
        </div>
      )}
    </div>
  )
}

function ReviewCode({ bookingId, code, loading, onGenerate }: { bookingId: string; code: string; loading: boolean; onGenerate: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked (http, iframe) — the code is on screen anyway.
    }
  }

  return (
    <div className="border-t border-pink-100 pt-4" data-booking={bookingId}>
      <p className="text-gray-500 text-xs mb-2 flex items-center gap-1">
        <Gift size={11} /> โค้ดส่วนลด 10% สำหรับรีวิว
      </p>
      {code ? (
        <div className="flex items-center gap-2">
          <div
            className="flex-1 rounded-lg px-3 py-2 text-center font-mono font-bold text-base tracking-widest"
            style={{ background: 'rgba(140,43,63,0.1)', border: '1px solid rgba(140,43,63,0.3)', color: '#6E1F31' }}
          >
            {code}
          </div>
          <button onClick={copy} className="p-2 rounded-lg glass hover:bg-pink-50" title="คัดลอกโค้ด" aria-label="คัดลอกโค้ด">
            {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} className="text-gold" />}
          </button>
        </div>
      ) : (
        <Button size="sm" variant="outline" loading={loading} onClick={onGenerate} className="border-gold/40 text-gold hover:bg-gold/10">
          <Gift size={14} />
          ออกโค้ดส่วนลด
        </Button>
      )}
    </div>
  )
}

function Detail({ label, value, mono, wrap }: { label: string; value: string; mono?: boolean; wrap?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-gray-400 text-xs">{label}</p>
      <p className={`text-sm mt-0.5 ${wrap ? 'break-words' : 'truncate'} ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  )
}
