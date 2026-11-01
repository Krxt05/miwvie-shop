'use client'
import { useDeferredValue, useMemo, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Booking, BookingStatus, CameraId } from '@/types'
import { CAMERAS } from '@/lib/cameras'
import { CustomerInfo, STATUS_LABEL, bangkokDay, isOpen } from '@/lib/admin'
import BookingCard, { AdminActions } from './BookingCard'

export type StatusFilter = 'open' | 'all' | BookingStatus
export type SortKey = 'pickupAsc' | 'pickupDesc' | 'createdDesc'

export interface BookingFilters {
  search: string
  status: StatusFilter
  camera: CameraId | 'all'
  from: string // yyyy-MM-dd, pickup day
  to: string
  sort: SortKey
}

export const DEFAULT_FILTERS: BookingFilters = {
  search: '',
  status: 'open',
  camera: 'all',
  from: '',
  to: '',
  sort: 'pickupAsc',
}

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'ค้างอยู่' },
  { value: 'pending', label: STATUS_LABEL.pending },
  { value: 'confirmed', label: STATUS_LABEL.confirmed },
  { value: 'active', label: STATUS_LABEL.active },
  { value: 'returned', label: STATUS_LABEL.returned },
  { value: 'cancelled', label: STATUS_LABEL.cancelled },
  { value: 'all', label: 'ทั้งหมด' },
]

interface Props {
  bookings: Booking[]
  filters: BookingFilters
  setFilters: (f: BookingFilters) => void
  expanded: string | null
  onToggle: (id: string) => void
  actions: AdminActions
  customerOf: (b: Booking) => CustomerInfo
}

const PAGE = 30
const ms = (v: unknown) => new Date(String(v)).getTime() || 0

export default function BookingsTab({ bookings, filters, setFilters, expanded, onToggle, actions, customerOf }: Props) {
  const set = (patch: Partial<BookingFilters>) => setFilters({ ...filters, ...patch })
  const [showMore, setShowMore] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  // Typing stays responsive; the list catches up a beat later
  const search = useDeferredValue(filters.search)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return bookings
      .filter((b) => {
        if (filters.status === 'open' && !isOpen(b)) return false
        if (filters.status !== 'open' && filters.status !== 'all' && b.bookingStatus !== filters.status) return false
        if (filters.camera !== 'all' && b.cameraId !== filters.camera) return false
        if (filters.from || filters.to) {
          const day = bangkokDay(String(b.pickupDatetime))
          if (filters.from && day < filters.from) return false
          if (filters.to && day > filters.to) return false
        }
        if (q) {
          return (
            b.bookingId.toLowerCase().includes(q) ||
            String(b.customerName).toLowerCase().includes(q) ||
            String(b.customerPhone).replace(/\D/g, '').includes(q.replace(/^0/, '')) ||
            String(b.customerIG).toLowerCase().includes(q) ||
            b.contactChannel === q ||
            String(b.adminNotes).toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => {
        if (filters.sort === 'createdDesc') return ms(b.createdAt) - ms(a.createdAt)
        if (filters.sort === 'pickupDesc') return ms(b.pickupDatetime) - ms(a.pickupDatetime)
        return ms(a.pickupDatetime) - ms(b.pickupDatetime)
      })
  }, [bookings, search, filters.status, filters.camera, filters.from, filters.to, filters.sort])

  const chipCounts = useMemo(() => {
    const c: Record<string, number> = { all: bookings.length, open: 0 }
    for (const b of bookings) {
      c[b.bookingStatus] = (c[b.bookingStatus] ?? 0) + 1
      if (isOpen(b)) c.open++
    }
    return c
  }, [bookings])

  const extraFilters = Number(filters.camera !== 'all') + Number(Boolean(filters.from)) + Number(Boolean(filters.to)) + Number(filters.sort !== 'pickupAsc')
  const isFiltered = filters.search !== '' || filters.status !== DEFAULT_FILTERS.status || extraFilters > 0
  const shown = filtered.slice(0, limit)

  return (
    <div className="space-y-3">
      <div className="glass rounded-xl p-3 space-y-2.5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="search"
              enterKeyHint="search"
              value={filters.search}
              onChange={(e) => { set({ search: e.target.value }); setLimit(PAGE) }}
              placeholder="ค้นหา เลขจอง ชื่อ เบอร์ IG โน้ต"
              aria-label="ค้นหา"
              className="w-full min-h-11 bg-cream/60 rounded-lg pl-9 pr-10 text-base sm:text-sm outline-none placeholder:text-gray-500 [&::-webkit-search-cancel-button]:hidden"
            />
            {filters.search && (
              <button onClick={() => set({ search: '' })} className="absolute right-0 top-0 w-11 h-11 flex items-center justify-center text-gray-500" aria-label="ล้างคำค้น">
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className={`min-h-11 px-3 rounded-lg border text-sm flex items-center gap-1.5 ${extraFilters ? 'border-pink text-pink' : 'border-pink-200 text-gray-600'}`}
          >
            <SlidersHorizontal size={16} /> {extraFilters > 0 && <span className="tabular-nums">{extraFilters}</span>}
            <span className="sr-only">ตัวกรองเพิ่มเติม</span>
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1" role="group" aria-label="กรองสถานะ">
          {STATUS_CHIPS.map((c) => {
            const active = filters.status === c.value
            return (
              <button
                key={c.value}
                onClick={() => { set({ status: c.value }); setLimit(PAGE) }}
                aria-pressed={active}
                className={`shrink-0 min-h-10 rounded-full px-3.5 text-sm font-medium border transition-colors ${
                  active ? 'bg-pink text-white border-pink' : 'border-pink-200 text-gray-700'
                }`}
              >
                {c.label} <span className={`tabular-nums ${active ? 'opacity-80' : 'text-gray-500'}`}>{chipCounts[c.value] ?? 0}</span>
              </button>
            )
          })}
        </div>

        {showMore && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
            <label className="text-xs text-gray-600">
              รุ่น
              <select
                value={filters.camera}
                onChange={(e) => set({ camera: e.target.value as CameraId | 'all' })}
                className="mt-1 w-full min-h-11 glass rounded-lg px-2 text-base sm:text-sm text-ink outline-none bg-transparent"
              >
                <option value="all">ทุกรุ่น</option>
                {CAMERAS.map((c) => <option key={c.id} value={c.id}>{c.shortName}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-600">
              เรียง
              <select
                value={filters.sort}
                onChange={(e) => set({ sort: e.target.value as SortKey })}
                className="mt-1 w-full min-h-11 glass rounded-lg px-2 text-base sm:text-sm text-ink outline-none bg-transparent"
              >
                <option value="pickupAsc">วันรับ ใกล้ → ไกล</option>
                <option value="pickupDesc">วันรับ ล่าสุดก่อน</option>
                <option value="createdDesc">จองล่าสุดก่อน</option>
              </select>
            </label>
            <label className="text-xs text-gray-600">
              วันรับ ตั้งแต่
              <input
                type="date"
                value={filters.from}
                onChange={(e) => set({ from: e.target.value })}
                className="mt-1 w-full min-h-11 glass rounded-lg px-2 text-base sm:text-sm text-ink outline-none bg-transparent"
              />
            </label>
            <label className="text-xs text-gray-600">
              ถึง
              <input
                type="date"
                value={filters.to}
                onChange={(e) => set({ to: e.target.value })}
                className="mt-1 w-full min-h-11 glass rounded-lg px-2 text-base sm:text-sm text-ink outline-none bg-transparent"
              />
            </label>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-gray-600">
          <span className="tabular-nums">{filtered.length} รายการ</span>
          {isFiltered && (
            <button onClick={() => { setFilters(DEFAULT_FILTERS); setLimit(PAGE) }} className="min-h-9 flex items-center gap-1 text-pink font-medium">
              <X size={13} /> ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-600 text-sm space-y-2">
          <p>ไม่มีรายการ{isFiltered ? 'ที่ตรงกับตัวกรอง' : ''}</p>
          {isFiltered && (
            <button onClick={() => setFilters(DEFAULT_FILTERS)} className="min-h-11 px-4 rounded-xl border border-pink-200 text-pink font-medium">
              ล้างตัวกรอง
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((b) => (
            <BookingCard
              key={b.bookingId}
              b={b}
              expanded={expanded === b.bookingId}
              onToggle={onToggle}
              actions={actions}
              customer={customerOf(b)}
            />
          ))}
          {filtered.length > shown.length && (
            <button onClick={() => setLimit((n) => n + PAGE)} className="w-full min-h-11 rounded-xl glass text-sm text-pink font-medium">
              แสดงเพิ่ม ({filtered.length - shown.length} รายการ)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
