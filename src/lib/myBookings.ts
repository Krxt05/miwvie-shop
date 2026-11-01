// The customer's own bookings, remembered only in their browser — the same idea
// as the saved name/phone on the booking form. Each entry keeps the access
// token, so "ประวัติการจอง" can open the full booking page without any login.
// Nothing here is ever looked up on the server by phone or name.

const KEY = 'miwvie_bookings_v1'
const MAX_ENTRIES = 30

export interface SavedBooking {
  id: string
  token: string
  cameraId: string
  pickup: string // ISO
  savedAt: string // ISO
}

export function readMyBookings(): SavedBooking[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((b) => b && b.id && b.token) : []
  } catch {
    return []
  }
}

function write(list: SavedBooking[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)))
  } catch { /* storage blocked — the booking link still works on its own */ }
}

// Newest first; re-saving the same booking just refreshes its details.
export function rememberBooking(b: Omit<SavedBooking, 'savedAt'>) {
  if (!b.id || !b.token) return
  const rest = readMyBookings().filter((x) => x.id !== b.id)
  write([{ ...b, savedAt: new Date().toISOString() }, ...rest])
}

export function forgetBooking(id: string) {
  write(readMyBookings().filter((x) => x.id !== id))
}

export function bookingPath(id: string, token: string): string {
  return `/booking/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`
}
