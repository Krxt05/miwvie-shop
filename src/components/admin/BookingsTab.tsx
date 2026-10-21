'use client'
import { Search, X } from 'lucide-react'
import { Booking, BookingStatus, CameraId } from '@/types'
import { CAMERAS } from '@/lib/cameras'
import { STATUS_LABEL, bangkokDay, isOpen } from '@/lib/admin'
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
  setExpanded: (id: string | null) => void
  actions: AdminActions
}

export default function BookingsTab({ bookings, filters, setFilters, expanded, setExpanded, actions }: Props) {
  const set = (patch: Partial<BookingFilters>) => setFilters({ ...filters, ...patch })
  const q = filters.search.trim().toLowerCase()

  const filtered = bookings
    .filter((b) => {
      if (filters.status === 'open' && !isOpen(b)) return false
      if (filters.status !== 'open' && filters.status !== 'all' && b.bookingStatus !== filters.status) return false
      if (filters.camera !== 'all' && b.cameraId !== filters.camera) return false
      const day = bangkokDay(String(b.pickupDatetime))
      if (filters.from && day < filters.from) return false
      if (filters.to && day > filters.to) return false
      if (q) {
        return (
          b.bookingId.toLowerCase().includes(q) ||
          String(b.customerName).toLowerCase().includes(q) ||
          String(b.customerPhone).includes(q) ||
          String(b.customerIG).toLowerCase().includes(q) ||
          String(b.adminNotes).toLowerCase().includes(q)
        )
      }
      return true
    })
    .sort((a, b) => {
      const t = (v: unknown) => new Date(String(v)).getTime() || 0
      if (filters.sort === 'createdDesc') return t(b.createdAt) - t(a.createdAt)
      if (filters.sort === 'pickupDesc') return t(b.pickupDatetime) - t(a.pickupDatetime)
      return t(a.pickupDatetime) - t(b.pickupDatetime)
    })

  const isFiltered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS)

  return (
    <div className="space-y-3">
      <div className="glass rounded-xl p-3 space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="ค้นหา เลขจอง, ชื่อ, เบอร์, IG, โน้ต..."
            aria-label="ค้นหา"
            className="w-full bg-cream/60 rounded-lg pl-8 pr-3 py-2 text-sm outline-none placeholder:text-gray-400"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1" role="group" aria-label="กรองสถานะ">
          {STATUS_CHIPS.map((c) => {
            const n = c.value === 'all'
              ? bookings.length
              : c.value === 'open'
                ? bookings.filter(isOpen).length
                : bookings.filter((b) => b.bookingStatus === c.value).length
            const active = filters.status === c.value
            return (
              <button
                key={c.value}
                onClick={() => set({ status: c.value })}
                aria-pressed={active}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  active ? 'bg-pink text-white border-pink' : 'border-pink-200 text-gray-600 hover:border-pink'
                }`}
              >
                {c.label} <span className={active ? 'opacity-80' : 'text-gray-400'}>{n}</span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <label className="text-xs text-gray-500">
            รุ่น
            <select
              value={filters.camera}
              onChange={(e) => set({ camera: e.target.value as CameraId | 'all' })}
              className="mt-1 w-full glass rounded-lg px-2 py-1.5 text-sm text-ink outline-none bg-transparent"
            >
              <option value="all">ทุกรุ่น</option>
              {CAMERAS.map((c) => <option key={c.id} value={c.id}>{c.shortName}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            เรียง
            <select
              value={filters.sort}
              onChange={(e) => set({ sort: e.target.value as SortKey })}
              className="mt-1 w-full glass rounded-lg px-2 py-1.5 text-sm text-ink outline-none bg-transparent"
            >
              <option value="pickupAsc">วันรับ ใกล้ → ไกล</option>
              <option value="pickupDesc">วันรับ ล่าสุดก่อน</option>
              <option value="createdDesc">จองล่าสุดก่อน</option>
            </select>
          </label>
          <label className="text-xs text-gray-500">
            วันรับ ตั้งแต่
            <input
              type="date"
              value={filters.from}
              onChange={(e) => set({ from: e.target.value })}
              className="mt-1 w-full glass rounded-lg px-2 py-1.5 text-sm text-ink outline-none bg-transparent"
            />
          </label>
          <label className="text-xs text-gray-500">
            ถึง
            <input
              type="date"
              value={filters.to}
              onChange={(e) => set({ to: e.target.value })}
              className="mt-1 w-full glass rounded-lg px-2 py-1.5 text-sm text-ink outline-none bg-transparent"
            />
          </label>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{filtered.length} รายการ</span>
          {isFiltered && (
            <button onClick={() => setFilters(DEFAULT_FILTERS)} className="flex items-center gap-1 text-pink hover:text-pink-light font-medium">
              <X size={12} /> ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">ไม่มีรายการ</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => (
            <BookingCard
              key={b.bookingId}
              b={b}
              expanded={expanded === b.bookingId}
              onToggle={() => setExpanded(expanded === b.bookingId ? null : b.bookingId)}
              actions={actions}
            />
          ))}
        </div>
      )}
    </div>
  )
}
