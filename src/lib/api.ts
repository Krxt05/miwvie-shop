import { BookedSlot, BookingFormData, Booking, CameraId, DeliveryType, PaymentStatus, BookingStatus, RentalArea } from '@/types'
import { calcPrice, calcDeliveryFee, getCameraById, PROVINCIAL_SHIPPING_FEE } from './cameras'

// Apps Script ส่งมาเป็น snake_case → แปลงเป็น camelCase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBooking(r: Record<string, any>): Booking {
  return {
    bookingId:      String(r.booking_id ?? ''),
    createdAt:      String(r.created_at ?? ''),
    cameraId:       (r.camera_id as CameraId),
    rentalArea:     (r.rental_area as RentalArea) || 'local',
    pickupDatetime: r.pickup_datetime as unknown as Date,
    returnDatetime: r.return_datetime as unknown as Date,
    durationHours:  Number(r.duration_hours) || 0,
    price:          Number(r.price) || 0,
    deliveryFee:    Number(r.delivery_fee) || 0,
    totalAmount:    Number(r.total_amount) || 0,
    pickupType:     (r.pickup_type as DeliveryType) || 'self',
    pickupAddress:  String(r.pickup_address ?? ''),
    returnType:     (r.return_type as DeliveryType) || 'self',
    returnAddress:  String(r.return_address ?? ''),
    shippingAddress:    String(r.shipping_address ?? ''),
    shippingSubdistrict: String(r.shipping_subdistrict ?? ''),
    shippingDistrict:   String(r.shipping_district ?? ''),
    shippingProvince:   String(r.shipping_province ?? ''),
    shippingPostalCode: String(r.shipping_postal_code ?? ''),
    customerName:   String(r.customer_name ?? ''),
    customerPhone:  String(r.customer_phone ?? ''),
    customerIG:     String(r.customer_ig ?? ''),
    idCardImage:    String(r.id_card_url ?? ''),
    igProfileImage: String(r.ig_profile_url ?? ''),
    paymentStatus:  (r.payment_status as PaymentStatus) || 'pending',
    bookingStatus:  (r.booking_status as BookingStatus) || 'pending',
    adminNotes:     String(r.admin_notes ?? ''),
    discountCode:   String(r.discount_code ?? ''),
    discountAmount: Number(r.discount_amount) || 0,
    returnedAt:     r.returned_at ? String(r.returned_at) : undefined,
  }
}

const BASE = '/api/sheets'

/**
 * A call that did not succeed. The distinction that matters is `retryable`:
 * an outage is not the same answer as "there are no bookings", and the old
 * helpers collapsed both into an empty object — which is how a failed read
 * ended up drawing a fully-booked camera as free.
 */
export class ApiError extends Error {
  code: string
  retryable: boolean
  status: number
  constructor(code: string, message: string, retryable: boolean, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.retryable = retryable
    this.status = status
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFailure(status: number, payload: any): ApiError {
  const err = payload?.error
  if (err && typeof err === 'object') {
    return new ApiError(err.code ?? 'UNKNOWN', err.message ?? 'เกิดข้อผิดพลาด', Boolean(err.retryable), status)
  }
  return new ApiError('UNKNOWN', 'เกิดข้อผิดพลาด กรุณาลองใหม่', status >= 500, status)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function send(input: RequestInfo, init?: RequestInit): Promise<any> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch {
    throw new ApiError('NETWORK', 'เชื่อมต่อไม่ได้ กรุณาตรวจสัญญาณแล้วลองใหม่', true, 0)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any
  try {
    payload = await res.json()
  } catch {
    throw new ApiError('BAD_RESPONSE', 'ระบบตอบกลับไม่ถูกต้อง กรุณาลองใหม่', true, res.status)
  }
  if (!res.ok) throw parseFailure(res.status, payload)
  return payload
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function get(params: Record<string, string>): Promise<any> {
  const url = new URL(BASE, location.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return send(url.toString(), { cache: 'no-store' })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(body: Record<string, unknown>): Promise<any> {
  return send(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Reads are safe to repeat, and Apps Script latency swings wildly enough
 * (measured 4s to 34s on identical calls) that a single failure means little.
 * Writes are deliberately excluded — they retry only where an idempotency key
 * makes a repeat provably harmless.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readWithRetry(params: Record<string, string>, attempts = 3): Promise<any> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1200 * i))
    try {
      return await get(params)
    } catch (e) {
      last = e
      if (e instanceof ApiError && !e.retryable) throw e
    }
  }
  throw last
}

function newRequestKey() {
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (c && 'randomUUID' in c) return c.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

export async function getAvailability(
  cameraId: CameraId,
  year: number,
  month: number,
): Promise<BookedSlot[]> {
  const data = await readWithRetry({
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
  const data = await readWithRetry({
    action: 'getAllAvailability',
    month: `${year}-${String(month).padStart(2, '0')}`,
  })
  return data.cameras ?? {}
}

export interface CreatedBooking { bookingId: string; accessToken: string; replayed?: boolean }

export async function createBooking(form: BookingFormData): Promise<CreatedBooking> {
  // Money is no longer sent. The server recomputes price, delivery fee and the
  // review discount from the camera, the dates and the coupon it validated
  // itself — a browser that posted its own total could otherwise store any
  // number, including a negative one.
  //
  // The two photos are deliberately not sent either. Uploading them to Drive
  // took ~8s of a ~12s request, and a phone that lost signal anywhere in that
  // window showed "Network error" for a booking that had already been written.
  // What secures the slot is the capacity check and the row write, so send only
  // that (~4s), then hand the photos over separately via attachImages.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { idCardImage, igProfileImage, discountAmount, ...booking } = form

  // One key for this submission, reused by every retry below. Replaying it
  // returns the original booking instead of making a second one, which is what
  // makes it safe to retry a request whose reply we never saw.
  const requestKey = newRequestKey()

  const payload = {
    action: 'createBooking',
    ...booking,
    pickupDatetime: form.pickupDatetime.toISOString(),
    returnDatetime: form.returnDatetime.toISOString(),
    requestKey,
  }

  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt))
    try {
      const data = await post(payload)
      if (!data.bookingId) throw new Error(data.error || 'จองไม่สำเร็จ กรุณาลองใหม่')
      return data as CreatedBooking
    } catch (e) {
      lastError = e
      // A transport failure is not proof the booking failed — Apps Script may
      // have written the row and lost the reply. Only retry the cases where the
      // request key makes a repeat harmless; a real refusal (camera full, bad
      // input) comes back as a plain Error and must surface immediately.
      if (!(e instanceof ApiError) || !e.retryable) throw e
    }
  }
  throw lastError
}

/**
 * Uploads the ID card and IG profile shots onto a booking that already exists.
 * Runs after the customer has their receipt, so it can afford to be patient:
 * Apps Script latency swings wildly (measured 4s–34s on identical calls) and
 * occasionally answers with an HTML error page, so retry a few times with a
 * growing gap. Filling an already-filled cell is a no-op server-side, which is
 * what makes retrying safe even when a "failed" attempt actually succeeded.
 */
export async function attachImages(
  bookingId: string,
  accessToken: string,
  idCardImage: string,
  igProfileImage: string,
  attempts = 3,
): Promise<{ success: boolean; error?: string }> {
  let lastError = ''
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2000 * i))
    try {
      const data = await post({
        action: 'attachImages', bookingId, token: accessToken, idCardImage, igProfileImage,
      })
      if (data.success && !data.partial) return { success: true }
      lastError = data.error || 'อัปโหลดรูปไม่สำเร็จ'
      if (data.error) break   // a refusal (wrong token, expired) will not change on retry
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'อัปโหลดรูปไม่สำเร็จ'
      if (e instanceof ApiError && !e.retryable) break
    }
  }
  return { success: false, error: lastError }
}

export async function getBooking(
  bookingId: string,
  accessToken?: string,
): Promise<{ booking: Booking; limited: boolean } | null> {
  // Sent as POST so the token stays out of URLs, referrers and access logs.
  const data = await post({ action: 'getBooking', id: bookingId, token: accessToken ?? '' })
  if (!data.booking || !data.booking.booking_id) return null
  return { booking: mapBooking(data.booking), limited: Boolean(data.limited) }
}

export async function getAdminBookings(pin: string): Promise<Booking[] | null> {
  const data = await post({ action: 'getAdminBookings', pin })
  if (data.error) return null
  return (data.bookings ?? []).map(mapBooking)
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
): Promise<{ success?: boolean; error?: string; booking?: Booking }> {
  const data = await post({ action: 'updateBookingStatus', bookingId, status, pin })
  return { ...data, booking: data.booking ? mapBooking(data.booking) : undefined }
}

export interface BlockedSlot {
  id: string
  cameraId: CameraId | 'ALL'
  startDatetime: string
  endDatetime: string
  reason: string
  createdAt: string
  quantity: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBlockedSlot(r: Record<string, any>): BlockedSlot {
  return {
    id: String(r.id ?? ''),
    cameraId: (r.camera_id as CameraId | 'ALL') ?? 'ALL',
    startDatetime: String(r.start_datetime ?? ''),
    endDatetime: String(r.end_datetime ?? ''),
    reason: String(r.reason ?? ''),
    createdAt: String(r.created_at ?? ''),
    quantity: Number(r.quantity) || 1,
  }
}

export async function blockDates(
  cameraId: CameraId | 'ALL',
  start: Date,
  end: Date,
  reason: string,
  pin: string,
  quantity?: number,
): Promise<{ success?: boolean; id?: string; error?: string }> {
  return post({
    action: 'blockDates',
    cameraId,
    start: start.toISOString(),
    end: end.toISOString(),
    reason,
    pin,
    quantity,
  })
}

export async function listBlockedSlots(pin: string): Promise<BlockedSlot[] | null> {
  const data = await post({ action: 'listBlockedSlots', pin })
  if (data.error) return null
  return (data.slots ?? []).map(mapBlockedSlot)
}

export async function deleteBlockedSlot(id: string, pin: string): Promise<{ success?: boolean; error?: string }> {
  return post({ action: 'deleteBlockedSlot', id, pin })
}
