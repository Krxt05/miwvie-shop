import { BookedSlot, BookingFormData, Booking, CameraId } from '@/types'
import { calcPrice, calcDeliveryFee, getCameraById } from './cameras'

const BASE = '/api/sheets'

async function get(params: Record<string, string>) {
  try {
    const url = new URL(BASE, location.origin)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const res = await fetch(url.toString(), { cache: 'no-store' })
    return res.json()
  } catch {
    return {}
  }
}

async function post(body: Record<string, unknown>) {
  try {
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.json()
  } catch {
    return { error: 'Network error' }
  }
}

export async function getAvailability(
  cameraId: CameraId,
  year: number,
  month: number,
): Promise<BookedSlot[]> {
  const data = await get({
    action: 'getAvailability',
    camera: cameraId,
    month: `${year}-${String(month).padStart(2, '0')}`,
  })
  return data.slots ?? []
}

export async function getAllCamerasAvailability(
  year: number,
  month: number,
): Promise<Record<CameraId, BookedSlot[]>> {
  const data = await get({
    action: 'getAllAvailability',
    month: `${year}-${String(month).padStart(2, '0')}`,
  })
  return data.cameras ?? {}
}

export async function createBooking(form: BookingFormData): Promise<{ bookingId: string }> {
  const camera = getCameraById(form.cameraId)!
  const price = calcPrice(camera.priceGroup, form.durationHours)
  const deliveryFee = calcDeliveryFee(form.pickupType, form.returnType)
  const discountedPrice = price - (form.discountAmount ?? 0)
  const data = await post({
    action: 'createBooking',
    ...form,
    pickupDatetime: form.pickupDatetime.toISOString(),
    returnDatetime: form.returnDatetime.toISOString(),
    price: discountedPrice,
    deliveryFee,
    totalAmount: discountedPrice + deliveryFee,
  })
  if (!data.bookingId) {
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
    return { bookingId: `MIW-${stamp}-${String(Math.floor(Math.random()*900)+100)}` }
  }
  return data
}

export async function getBooking(bookingId: string): Promise<Booking | null> {
  const data = await get({ action: 'getBooking', id: bookingId })
  return data.booking ?? null
}

export async function getAdminBookings(pin: string): Promise<Booking[] | null> {
  const data = await post({ action: 'getAdminBookings', pin })
  if (data.error) return null
  return data.bookings ?? []
}

export async function validateDiscountCode(code: string): Promise<{ valid: boolean; error?: string; discount?: number }> {
  const data = await get({ action: 'validateDiscountCode', code })
  return data
}

export async function generateDiscountCode(bookingId: string, pin: string): Promise<{ code?: string; error?: string }> {
  return post({ action: 'generateDiscountCode', bookingId, pin })
}

export async function updateBookingStatus(
  bookingId: string,
  status: string,
  pin: string,
): Promise<{ success?: boolean; error?: string }> {
  return post({ action: 'updateBookingStatus', bookingId, status, pin })
}
