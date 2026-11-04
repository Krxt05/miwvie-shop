'use client'
import { memo, ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown, ChevronUp, ExternalLink, CheckCircle, Package, RotateCcw,
  XCircle, Copy, Check, StickyNote, AlertTriangle, MessageCircle, Phone, MapPin, Ban, X,
} from 'lucide-react'
import { Booking, BookingStatus } from '@/types'
import { CAMERAS, PROVINCIAL_SHIP_LEAD_DAYS } from '@/lib/cameras'
import {
  BLACKLIST_TAG, CustomerInfo, STATUS_LABEL, dayLabel, dayTimeLabel, dayYearLabel, dueBack, hasDocs,
  isNotHandedOver, isOverdue, timeOf,
} from '@/lib/admin'
import { baht } from '@/lib/revenue'
import { bookingLink, messageTemplates } from '@/lib/messages'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

const DAY_MS = 24 * 60 * 60 * 1000

export interface AdminActions {
  isBusy: (bookingId: string) => boolean
  // The booking as this phone sees it — its status is sent as expectedStatus
  setStatus: (b: Booking, next: BookingStatus, opts?: { skipConfirm?: boolean }) => void
  cancel: (b: Booking) => void
  saveNotes: (bookingId: string, notes: string) => Promise<boolean>
}

export function cameraName(id: string): string {
  return CAMERAS.find((c) => c.id === id)?.shortName ?? id
}

interface Props {
  b: Booking
  expanded: boolean
  onToggle: (bookingId: string) => void
  actions: AdminActions
  customer: CustomerInfo
  // Extra line under the name, e.g. "ส่ง 14:00 · Delivery" on the today tab
  context?: ReactNode
}

type Tone = 'pay' | 'out' | 'back'
interface Step { next: BookingStatus; label: string; icon: React.ElementType; tone: Tone }

// Each step has its own colour so a glance tells them apart:
// money in = green, camera out = wine, camera back = blue.
const TONE_CLASS: Record<Tone, string> = {
  pay: 'bg-emerald-700 text-white active:bg-emerald-800',
  out: 'bg-pink text-white active:bg-pink-600',
  back: 'bg-sky-700 text-white active:bg-sky-800',
}

// The steps that move this booking forward, shown on the collapsed card. A
// confirmed booking offers "returned" right next to "handed over", so the
// owner can close it in one tap without stepping through.
function forwardSteps(b: Booking): Step[] {
  const prov = b.rentalArea === 'provincial'
  const back: Step = { next: 'returned', label: 'รับคืนแล้ว', icon: RotateCcw, tone: 'back' }
  if (b.bookingStatus === 'pending') return [{ next: 'confirmed', label: 'ยืนยันรับเงิน', icon: CheckCircle, tone: 'pay' }]
  if (b.bookingStatus === 'confirmed') return [{ next: 'active', label: prov ? 'ส่งพัสดุแล้ว' : 'ส่งกล้องแล้ว', icon: Package, tone: 'out' }, back]
  if (b.bookingStatus === 'active') return [back]
  return []
}

function StepButton({ step, busy, onClick }: { step: Step; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex-1 min-w-0 min-h-11 rounded-xl px-3 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${TONE_CLASS[step.tone]}`}
    >
      {busy
        ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        : <step.icon size={15} className="shrink-0" />}
      <span className="truncate">{step.label}</span>
    </button>
  )
}

function BookingCard({ b, expanded, onToggle, actions, customer, context }: Props) {
  const [sheet, setSheet] = useState(false)
  const [docsChecked, setDocsChecked] = useState(false)
  const isProv = b.rentalArea === 'provincial'
  const docsOk = hasDocs(b)
  const missingDocs = !docsOk && b.bookingStatus !== 'cancelled'
  const overdue = isOverdue(b)
  const notHandedOver = isNotHandedOver(b)
  const busy = actions.isBusy(b.bookingId)
  const steps = forwardSteps(b)
  const ownTag = String(b.adminNotes || '').includes(BLACKLIST_TAG)
  // Without ID/IG the forward button asks for them instead; confirming anyway
  // is still possible from the expanded card, on purpose.
  const needsDocsFirst = b.bookingStatus === 'pending' && missingDocs

  const when = isProv
    ? `ถึงมือ ${dayLabel(b.pickupDatetime)} → คืน ${dayLabel(b.returnDatetime)}`
    : `${dayTimeLabel(b.pickupDatetime)} → ${dayTimeLabel(b.returnDatetime)}`

  const ring = customer.blacklisted ? 'ring-2 ring-red-400' : overdue ? 'ring-1 ring-red-300' : ''

  return (
    <div className={`glass rounded-xl overflow-hidden ${ring}`}>
      <button
        className="w-full flex items-start gap-3 px-4 pt-3.5 pb-2 text-left"
        onClick={() => onToggle(b.bookingId)}
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-600 tabular-nums truncate">{when}</p>
          <p className="text-sm mt-0.5 flex items-baseline gap-1.5 min-w-0">
            {/* The real name keeps its room; a long chat name is the one cut short */}
            <span className="font-semibold truncate shrink-0 max-w-[70%]">{String(b.customerName)}</span>
            {contactHandle(b) && (
              <span className="text-xs text-gray-600 truncate min-w-0">· {contactHandle(b)}</span>
            )}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <Badge label={STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus} variant={b.bookingStatus} />
            {customer.blacklisted && <Pill tone="red"><Ban size={10} /> ห้ามเช่า</Pill>}
            {customer.pastRentals > 0
              ? <Pill tone="wine">ลูกค้าเก่า ×{customer.pastRentals}</Pill>
              : (b.bookingStatus === 'pending' || b.bookingStatus === 'confirmed') && <Pill tone="gray">ลูกค้าใหม่</Pill>}
            {isProv && <Pill tone="sky">ต่างจังหวัด</Pill>}
            {overdue && <Pill tone="red">เลยกำหนดคืน</Pill>}
            {notHandedOver && <Pill tone="brass">ยังไม่ได้กดส่งกล้อง</Pill>}
            {missingDocs && <Pill tone="brass"><AlertTriangle size={10} /> หลักฐานไม่ครบ</Pill>}
          </div>
          <p className="text-gray-600 text-xs truncate mt-1">
            {cameraName(b.cameraId)}
            {!isProv && ` · ${b.pickupType === 'delivery' ? 'Delivery' : 'รับเอง'}`}
          </p>
          {context && <div className="text-xs mt-1">{context}</div>}
          {b.adminNotes && (
            <p className="text-xs text-brass-dark mt-1 truncate flex items-center gap-1">
              <StickyNote size={11} className="shrink-0" /> {b.adminNotes}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-gold font-bold tabular-nums">{baht(Number(b.totalAmount) || 0)}</p>
          <p className="font-mono text-[11px] text-gray-500 mt-0.5 hidden sm:block">{b.bookingId}</p>
          {expanded ? <ChevronUp size={18} className="text-gray-500 ml-auto mt-1" /> : <ChevronDown size={18} className="text-gray-500 ml-auto mt-1" />}
        </div>
      </button>

      {/* Front-row actions: no need to expand for the everyday step */}
      {(steps.length > 0 || b.bookingStatus === 'returned') && (
        <div className="flex gap-2 px-4 pb-3">
          {needsDocsFirst ? (
            <button
              onClick={() => setSheet(true)}
              className="flex-1 min-h-11 rounded-xl border border-brass text-[#6F5220] bg-brass-light/20 text-sm font-medium flex items-center justify-center gap-2"
            >
              <AlertTriangle size={15} /> ขอหลักฐานก่อน
            </button>
          ) : (
            steps.map((st) => (
              <StepButton key={st.next} step={st} busy={busy} onClick={() => actions.setStatus(b, st.next)} />
            ))
          )}
          <button
            onClick={() => setSheet(true)}
            className={`min-h-11 shrink-0 rounded-xl border border-pink-200 text-pink flex items-center justify-center gap-1.5 text-sm font-medium ${steps.length ? 'w-11' : 'flex-1'}`}
            aria-label="ข้อความถึงลูกค้า"
          >
            <MessageCircle size={17} /> {!steps.length && 'ข้อความถึงลูกค้า'}
          </button>
        </div>
      )}

      {expanded && (
        <div className="border-t border-pink-100 p-4 space-y-4">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
            <Detail label="เลขจอง" value={b.bookingId} mono />
            <Detail label="ชื่อ" value={String(b.customerName)} />
            <PhoneDetail phone={String(b.customerPhone)} />
            <ContactDetail channel={b.contactChannel} name={String(b.customerIG)} />
            <Detail label="กล้อง" value={cameraName(b.cameraId)} />
            <Detail label="พื้นที่" value={isProv ? 'ต่างจังหวัด (ส่งพัสดุ)' : 'ในพื้นที่ มมส.'} />
            {isProv && b.pickupDatetime && (
              <Detail label="ร้านส่งพัสดุ" value={dayYearLabel(new Date(b.pickupDatetime).getTime() - PROVINCIAL_SHIP_LEAD_DAYS * DAY_MS)} />
            )}
            <Detail
              label={isProv ? 'พัสดุถึงมือ' : 'รับ (ตามจอง)'}
              value={isProv ? dayYearLabel(b.pickupDatetime) : `${dayYearLabel(b.pickupDatetime)} ${timeOf(b.pickupDatetime)}`}
            />
            <Detail
              label={isProv ? 'ส่งคืน (ก่อน 12:00)' : 'คืน (ตามจอง)'}
              value={isProv ? dayYearLabel(b.returnDatetime) : `${dayYearLabel(b.returnDatetime)} ${timeOf(b.returnDatetime)}`}
            />
            {b.pickedUpAt && (
              <>
                <Detail label="ส่งกล้องจริง" value={dayTimeLabel(b.pickedUpAt)} />
                {!isProv && <Detail label="ควรคืน (24 ชม. จากรับจริง)" value={dayTimeLabel(dueBack(b))} />}
              </>
            )}
            {isProv ? (
              <>
                <Detail
                  label="ที่อยู่จัดส่ง"
                  value={`${b.shippingAddress} ต.${b.shippingSubdistrict} อ./เขต ${b.shippingDistrict} จ.${b.shippingProvince} ${b.shippingPostalCode}`}
                  wrap
                />
                <Detail
                  label="แจ้งเลขพัสดุภายใน"
                  value={b.returnDatetime ? `เที่ยงวันที่ ${dayYearLabel(new Date(b.returnDatetime).getTime() + DAY_MS)}` : '-'}
                />
              </>
            ) : (
              <>
                <AddressDetail label="รับเครื่อง" delivery={b.pickupType === 'delivery'} address={String(b.pickupAddress || '')} selfLabel="รับเอง" />
                <AddressDetail
                  label="คืนเครื่อง"
                  delivery={b.returnType === 'delivery'}
                  address={String(b.returnAddress || '')}
                  selfLabel="คืนเอง"
                  prefix="ให้ร้านรับ"
                />
              </>
            )}
            <Detail
              label="ยอด"
              value={`${baht(Number(b.totalAmount) || 0)}${Number(b.deliveryFee) > 0 ? ` (ค่าส่ง ${baht(Number(b.deliveryFee))})` : ''}`}
            />
          </div>

          {(Number(b.discountAmount) > 0 || b.discountCode) && (
            <div className="rounded-lg px-3 py-2 text-xs bg-pink-50 border border-pink-200">
              <span className="text-gold">โค้ดส่วนลด: </span>
              <span className="font-mono font-bold text-gold">{String(b.discountCode)}</span>
              <span className="text-gray-600"> (ลด {baht(Number(b.discountAmount) || 0)})</span>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {b.idCardImage && <LinkChip href={String(b.idCardImage)}>บัตรประชาชน</LinkChip>}
            {b.igProfileImage && <LinkChip href={String(b.igProfileImage)}>IG Profile</LinkChip>}
            {missingDocs && (
              <p className="text-xs text-[#6F5220] w-full">
                ยังไม่ได้รับ{!b.idCardImage ? 'รูปบัตรประชาชน' : ''}
                {!b.idCardImage && !b.igProfileImage ? ' และ' : ''}
                {!b.igProfileImage ? 'รูปโปรไฟล์ IG' : ''} — ขอจากลูกค้าก่อนยืนยัน
              </p>
            )}
          </div>

          {/* Confirming without ID on file takes a deliberate tick */}
          {needsDocsFirst && (
            <div className="rounded-lg border border-brass/60 bg-brass-light/15 p-3 space-y-2">
              <label className="flex items-start gap-2 text-sm min-h-11">
                <input
                  type="checkbox"
                  checked={docsChecked}
                  onChange={(e) => setDocsChecked(e.target.checked)}
                  className="mt-1 w-5 h-5 accent-pink"
                />
                ตรวจบัตร/โปรไฟล์ลูกค้าทางแชทแล้ว
              </label>
              <button
                disabled={!docsChecked || busy}
                onClick={() => actions.setStatus(b, 'confirmed')}
                className={`w-full min-h-11 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-40 ${TONE_CLASS.pay}`}
              >
                <CheckCircle size={15} /> ยืนยันรับเงิน (ไม่มีหลักฐานในระบบ)
              </button>
            </div>
          )}

          {isProv && <ShippingLabelCopy b={b} />}

          <BookingLink b={b} />

          <NotesEditor b={b} onSave={actions.saveNotes} />

          {isProv && b.bookingStatus === 'active' && (
            <p className="text-xs text-[#6F5220] bg-brass-light/20 rounded-lg px-2.5 py-1.5 leading-relaxed flex gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              กด &ldquo;รับคืนแล้ว&rdquo; เมื่อพัสดุถึงร้านจริง (ไม่ใช่ตอนลูกค้าแจ้งเลขพัสดุ) — กดแล้วคิวจะว่างทันที
            </p>
          )}

          {/* Less common moves, kept away from the main button */}
          <div className="border-t border-pink-100 pt-3 flex flex-wrap gap-x-4 gap-y-1">
            <TextAction
              onClick={() => {
                const notes = String(b.adminNotes || '')
                actions.saveNotes(
                  b.bookingId,
                  ownTag ? notes.replace(BLACKLIST_TAG, '').replace(/\s{2,}/g, ' ').trim() : `${BLACKLIST_TAG} ${notes}`.trim(),
                )
              }}
              disabled={customer.blacklisted && !ownTag}
              tone={ownTag ? 'gray' : 'red'}
            >
              <Ban size={14} />
              {ownTag ? 'เอาออกจากห้ามเช่า' : customer.blacklisted ? 'ติดห้ามเช่าจากใบจองอื่น' : 'ตั้งเป็นลูกค้าห้ามเช่า'}
            </TextAction>
            {b.bookingStatus !== 'cancelled' && b.bookingStatus !== 'returned' && (
              <TextAction onClick={() => actions.cancel(b)} disabled={busy} tone="red">
                <XCircle size={14} /> ยกเลิกการจอง
              </TextAction>
            )}
          </div>
        </div>
      )}

      {/* Rendered on <body>, not inside the card: a faded (done) card made the
          sheet see-through, and the card's stacking put it under the tab bar. */}
      {sheet && createPortal(<MessageSheet b={b} onClose={() => setSheet(false)} />, document.body)}
    </div>
  )
}

export default memo(BookingCard)

function Pill({ tone, children }: { tone: 'red' | 'wine' | 'gray' | 'sky' | 'brass'; children: ReactNode }) {
  const tones = {
    red: 'text-red-700 bg-red-50 border-red-200',
    wine: 'text-pink-700 bg-pink-50 border-pink-200',
    gray: 'text-gray-600 bg-gray-50 border-gray-200',
    sky: 'text-sky-800 bg-sky-50 border-sky-200',
    brass: 'text-[#6F5220] bg-brass-light/30 border-brass/50',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] border rounded-full px-2 py-0.5 ${tones[tone]}`}>{children}</span>
  )
}

function TextAction({ onClick, disabled, tone = 'wine', children }: { onClick: () => void; disabled?: boolean; tone?: 'wine' | 'red' | 'gray'; children: ReactNode }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'gray' ? 'text-gray-600' : 'text-pink'
  return (
    <button onClick={onClick} disabled={disabled} className={`min-h-11 flex items-center gap-1.5 text-sm font-medium ${color} disabled:opacity-40`}>
      {children}
    </button>
  )
}

function LinkChip({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-pink-200 px-3 text-sm text-pink">
      <ExternalLink size={14} /> {children}
    </a>
  )
}

// Copy-ready chat messages, picked from a sheet so the card stays short
function MessageSheet({ b, onClose }: { b: Booking; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [manual, setManual] = useState<string | null>(null)
  const templates = messageTemplates(b)
  const handle = String(b.customerIG || '').trim().replace(/^@/, '')
  const igLink = b.contactChannel === 'ig' && /^[A-Za-z0-9._]+$/.test(handle) ? `https://ig.me/m/${handle}` : ''

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    // Keep the page behind from scrolling under the finger
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setManual(id) // clipboard blocked — show the text selected for copying by hand
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ข้อความถึงลูกค้า"
        className="w-full max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 text-left shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0">
            <p className="font-bold">ข้อความถึงลูกค้า</p>
            <p className="text-xs text-gray-600 truncate">{String(b.customerName)} · {b.contactChannel === 'line' ? 'LINE' : 'IG'} {String(b.customerIG)}</p>
          </div>
          <button onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center text-gray-600" aria-label="ปิด">
            <X size={20} />
          </button>
        </div>
        <ul className="space-y-2">
          {templates.map((t) => (
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
                <span className="block text-xs text-gray-600 whitespace-pre-line mt-1 line-clamp-3">{t.text}</span>
              </button>
              {manual === t.id && (
                <textarea readOnly value={t.text} rows={4} autoFocus onFocus={(e) => e.currentTarget.select()}
                  className="mt-1 w-full rounded-lg bg-gray-50 px-2 py-1 text-xs outline-none" />
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mt-3">
          {igLink && (
            <a href={igLink} target="_blank" rel="noreferrer" className="flex-1 min-h-11 rounded-xl bg-pink text-white text-sm font-medium flex items-center justify-center gap-1.5">
              <MessageCircle size={16} /> เปิดแชท IG
            </a>
          )}
          {b.customerPhone && (
            <a href={`tel:${telNumber(String(b.customerPhone))}`} className="flex-1 min-h-11 rounded-xl border border-pink-200 text-pink text-sm font-medium flex items-center justify-center gap-1.5">
              <Phone size={16} /> โทร
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// "IG @name" / "LINE name" shown next to the real name, so the owner knows
// which chat to open without expanding the card
function contactHandle(b: Booking): string {
  const name = String(b.customerIG || '').trim()
  if (!name) return ''
  if (b.contactChannel === 'line') return `LINE ${name}`
  if (b.contactChannel === 'ig') return `IG @${name.replace(/^@/, '')}`
  return `IG/LINE ${name}` // older bookings didn't record which app
}

function telNumber(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 9 && !digits.startsWith('0')) digits = `0${digits}`
  return digits
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
      <label htmlFor={`note-${b.bookingId}`} className="text-xs text-gray-600 flex items-center gap-1 mb-1">
        <StickyNote size={11} /> โน้ตแอดมิน (ลูกค้าไม่เห็น)
      </label>
      <textarea
        id={`note-${b.bookingId}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="เช่น กล้องมีรอยขีดตอนรับคืน, ลูกค้าขอรับก่อนเวลา 30 นาที"
        className="w-full glass rounded-lg px-3 py-2 text-base sm:text-sm outline-none bg-transparent placeholder:text-gray-400 resize-y"
      />
      {dirty && (
        <div className="flex justify-end gap-2 mt-1.5">
          <button onClick={() => setDraft(b.adminNotes || '')} className="min-h-11 text-sm text-gray-600 px-3">
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

// Name / phone / address ready to paste into the parcel app when shipping out.
// Bangkok uses แขวง/เขต; everywhere else ตำบล/อำเภอ.
export function shippingLabel(b: Booking): string {
  const bkk = String(b.shippingProvince).includes('กรุงเทพ')
  const address = [
    String(b.shippingAddress).trim(),
    b.shippingSubdistrict ? `${bkk ? 'แขวง' : 'ต.'}${b.shippingSubdistrict}` : '',
    b.shippingDistrict ? `${bkk ? 'เขต' : 'อ.'}${b.shippingDistrict}` : '',
    b.shippingProvince ? (bkk ? String(b.shippingProvince) : `จ.${b.shippingProvince}`) : '',
    String(b.shippingPostalCode || ''),
  ].filter(Boolean).join(' ')
  return [String(b.customerName).trim(), String(b.customerPhone).trim(), address].join('\n')
}

function CopyButton({ text, label = 'คัดลอก', onBlocked }: { text: string; label?: string; onBlocked: () => void }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      onBlocked()
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button type="button" onClick={copy} className="min-h-11 flex items-center gap-1 text-sm text-pink shrink-0">
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'คัดลอกแล้ว' : label}
    </button>
  )
}

function ShippingLabelCopy({ b }: { b: Booking }) {
  const [manual, setManual] = useState(false)
  const label = shippingLabel(b)
  return (
    <div className="rounded-lg border border-pink-100 px-3 py-1.5 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-600">ที่อยู่สำหรับส่งพัสดุ</p>
        <CopyButton text={label} onBlocked={() => setManual(true)} />
      </div>
      {manual ? (
        <textarea readOnly value={label} rows={3} onFocus={(e) => e.currentTarget.select()} autoFocus
          className="w-full rounded-md bg-gray-50 px-2 py-1 text-xs outline-none resize-none" />
      ) : (
        <p className="text-sm whitespace-pre-line leading-relaxed pb-1">{label}</p>
      )}
    </div>
  )
}

// Shortcut to the customer's own booking page, to resend when they lost it.
// Without the token the page shows status only (rows from before tokens existed).
function BookingLink({ b }: { b: Booking }) {
  const [manual, setManual] = useState(false)
  const link = bookingLink(b)
  return (
    <div className="rounded-lg border border-pink-100 px-3 py-1 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-600">
          ลิงก์ใบจอง{!b.accessToken && <span className="text-[#6F5220]"> · ใบเก่า ดูได้แค่สถานะ</span>}
        </p>
        <div className="flex items-center gap-4 shrink-0">
          <CopyButton text={link} onBlocked={() => setManual(true)} />
          <a href={`${link}${b.accessToken ? '&' : '?'}admin=1`} target="_blank" rel="noreferrer" className="min-h-11 flex items-center gap-1 text-sm text-pink">
            <ExternalLink size={14} /> เปิด
          </a>
        </div>
      </div>
      {manual && (
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} autoFocus
          className="w-full rounded-md bg-gray-50 px-2 py-1 font-mono text-[11px] outline-none mb-1" />
      )}
    </div>
  )
}

function PhoneDetail({ phone }: { phone: string }) {
  const num = telNumber(phone)
  return (
    <div className="min-w-0">
      <p className="text-gray-600 text-xs">โทร</p>
      {num ? (
        <a href={`tel:${num}`} className="text-sm mt-0.5 inline-flex items-center gap-1 text-pink-700 underline underline-offset-2">
          <Phone size={12} /> {num}
        </a>
      ) : <p className="text-sm mt-0.5">-</p>}
    </div>
  )
}

// Delivery addresses open in Maps — the owner drives there
function AddressDetail({ label, delivery, address, selfLabel, prefix = 'Delivery' }: { label: string; delivery: boolean; address: string; selfLabel: string; prefix?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-gray-600 text-xs">{label}</p>
      {delivery && address ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address} มหาสารคาม`)}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm mt-0.5 break-words text-pink-700 underline underline-offset-2 inline-flex gap-1"
        >
          <MapPin size={12} className="shrink-0 mt-1" /> {prefix} → {address}
        </a>
      ) : (
        <p className="text-sm mt-0.5 break-words">{delivery ? prefix : selfLabel}</p>
      )}
    </div>
  )
}

// IG names link straight to the profile; a LINE display name can't be linked to.
// Older bookings didn't record the app, so they keep the "IG/LINE" label.
function ContactDetail({ channel, name }: { channel: Booking['contactChannel']; name: string }) {
  const label = channel === 'line' ? 'LINE' : channel === 'ig' ? 'IG' : 'IG/LINE'
  const handle = name.trim().replace(/^@/, '')
  return (
    <div className="min-w-0">
      <p className="text-gray-600 text-xs">{label}</p>
      {channel === 'ig' && /^[A-Za-z0-9._]+$/.test(handle) ? (
        <a
          href={`https://instagram.com/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm mt-0.5 truncate block text-pink-700 underline underline-offset-2"
        >
          @{handle}
        </a>
      ) : (
        <p className="text-sm mt-0.5 truncate">{name || '-'}</p>
      )}
    </div>
  )
}

function Detail({ label, value, mono, wrap }: { label: string; value: string; mono?: boolean; wrap?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-gray-600 text-xs">{label}</p>
      <p className={`text-sm mt-0.5 ${wrap ? 'break-words' : 'truncate'} ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  )
}
