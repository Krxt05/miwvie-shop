'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { getBooking } from '@/lib/api'
import { CAMERAS } from '@/lib/cameras'
import { SavedBooking, bookingPath, forgetBooking, readMyBookings } from '@/lib/myBookings'
import { Booking } from '@/types'
import Badge from '@/components/ui/Badge'

const STATUS_LABEL: Record<string, string> = {
  pending: 'รอชำระเงิน',
  confirmed: 'ยืนยันแล้ว',
  active: 'กำลังเช่า',
  returned: 'คืนแล้ว',
  cancelled: 'ยกเลิกแล้ว',
}

type Row = SavedBooking & { booking?: Booking; state?: 'loaded' | 'missing' | 'error' }

// Each status read is a full Apps Script run; a repeat customer can have up to
// 30 saved, so read a few at a time instead of all at once (Apps Script caps
// simultaneous runs, and the overflow would hit people booking right now).
const CONCURRENCY = 3

export default function MyBookingsPage() {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    const saved = readMyBookings()
    setRows(saved)
    let cancelled = false
    const update = (id: string, patch: Partial<Row>) => {
      if (!cancelled) setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? prev)
    }
    const queue = [...saved]
    const worker = async () => {
      for (let s = queue.shift(); s && !cancelled; s = queue.shift()) {
        try {
          const res = await getBooking(s.id, s.token)
          update(s.id, res ? { booking: res.booking, state: 'loaded' } : { state: 'missing' })
        } catch {
          update(s.id, { state: 'error' })
        }
      }
    }
    for (let i = 0; i < CONCURRENCY; i++) worker()
    return () => { cancelled = true }
  }, [])

  function remove(id: string) {
    forgetBooking(id)
    setRows((prev) => prev?.filter((r) => r.id !== id) ?? prev)
  }

  // Latest pickup first
  const sorted = rows
    ? [...rows].sort((a, b) => {
        const pa = new Date(a.booking?.pickupDatetime ?? a.pickup).getTime()
        const pb = new Date(b.booking?.pickupDatetime ?? b.pickup).getTime()
        return pb - pa
      })
    : null

  return (
    <main className="min-h-screen bg-gradient-dark">
      <div className="relative z-10 max-w-lg mx-auto px-4 py-8">
        <Link href="/" className="flex items-center gap-1 text-gray-400 hover:text-pink-600 text-sm mb-8 transition-colors w-fit">
          <ChevronLeft size={16} /> หน้าหลัก
        </Link>

        <h1 className="text-2xl font-bold mb-1">ประวัติการจอง</h1>
        <p className="text-gray-400 text-sm mb-6">
          แสดงการจองที่ทำจากเครื่องและเบราว์เซอร์นี้
        </p>

        {sorted && sorted.length === 0 && (
          <div className="glass rounded-2xl p-6 text-center">
            <p className="text-gray-500 text-sm mb-4">ยังไม่มีการจองในเครื่องนี้</p>
            <Link href="/book" className="inline-block bg-pink-700 text-cream text-sm font-medium rounded-full px-5 py-2.5">
              จองกล้อง
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {sorted?.map((r) => {
            const b = r.booking
            const cam = CAMERAS.find((c) => c.id === (b?.cameraId ?? r.cameraId))
            const isProv = b?.rentalArea === 'provincial'
            const pickup = new Date(String(b?.pickupDatetime ?? r.pickup))
            const ret = b ? new Date(String(b.returnDatetime)) : null
            const fmt = isProv ? 'EEE d MMM' : 'EEE d MMM HH:mm'
            return (
              <div key={r.id} className="glass rounded-2xl p-4">
                <Link href={bookingPath(r.id, r.token)} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold truncate">{cam?.shortName ?? r.cameraId}</p>
                      {b ? (
                        <Badge label={STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus} variant={b.bookingStatus} />
                      ) : r.state === 'missing' ? (
                        <span className="text-xs text-red-500">ไม่พบใบจองนี้แล้ว</span>
                      ) : r.state === 'error' ? (
                        <span className="text-xs text-gray-400">โหลดสถานะไม่ได้ ลองรีเฟรช</span>
                      ) : (
                        <span className="text-xs text-gray-400">กำลังโหลด…</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {isNaN(pickup.getTime()) ? '-' : format(pickup, fmt, { locale: th })}
                      {ret && !isNaN(ret.getTime()) && ` → ${format(ret, fmt, { locale: th })}`}
                      {isProv && ' · ส่งพัสดุ'}
                    </p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{r.id}</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300 shrink-0" />
                </Link>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  className="mt-2 flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={11} /> ลบออกจากเครื่องนี้
                </button>
              </div>
            )
          })}
        </div>

        <p className="text-xs text-gray-400 mt-8 leading-relaxed">
          ไม่เห็นการจองที่ต้องการ? อาจจองจากเครื่องหรือแอปอื่น (เช่น เปิดเว็บใน IG แล้วมาเปิดใน Safari)
          ทักมาที่ IG @miwvie_shop หรือ LINE ร้าน เพื่อขอลิงก์ใบจองได้เลยค่ะ
        </p>
      </div>
    </main>
  )
}
