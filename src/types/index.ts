// Where the customer chats with the shop — tells the admin which app to look in.
export type ContactChannel = 'ig' | 'line'

export type CameraId = 'IXY10s' | 'IXY30s' | 'IXY930IS' | 'IXY510IS' | 'IXY200'
export type PriceGroup = 'A' | 'B'

export interface PriceTable {
  hourly6: number
  day1: number
  day2: number
  day3: number
  day4: number
  day5: number
  day6: number
  day7: number
}
export type DeliveryType = 'self' | 'delivery'
export type RentalArea = 'local' | 'provincial'
export type PaymentStatus = 'pending' | 'confirmed'
export type BookingStatus = 'pending' | 'confirmed' | 'active' | 'returned' | 'cancelled'

export interface Camera {
  id: CameraId
  name: string
  shortName: string
  image: string
  moodImages: string[]
  priceGroup: PriceGroup
  color: string
  quantity: number
  colorways: { name: string; hex: string }[]
}

export interface BookedSlot {
  cameraId: CameraId
  pickupDatetime: string  // ISO
  returnDatetime: string  // ISO
  bookingId: string
  quantity?: number  // units this slot takes up; defaults to 1 (admin blocks can cover more)
}

// A shop closure as getAvailability sends it (`closed`). Holds no unit; it only
// forbids handovers — see src/lib/closures.ts. Absent from older servers.
export interface ClosedSlot {
  id: string
  cameraId: CameraId | 'ALL'
  start: string  // ISO
  end: string    // ISO, exclusive
  mode: 'closed' | 'nopickup'
}

export interface BookingFormData {
  cameraId: CameraId
  rentalArea: RentalArea
  pickupDatetime: Date
  returnDatetime: Date
  durationHours: number
  pickupType: DeliveryType
  pickupAddress: string
  returnType: DeliveryType
  returnAddress: string
  shippingAddress: string
  shippingSubdistrict: string
  shippingDistrict: string
  shippingProvince: string
  shippingPostalCode: string
  customerName: string
  customerPhone: string
  customerIG: string
  contactChannel: ContactChannel | ''  // '' = older bookings, before the IG/LINE choice existed
  idCardImage: string
  igProfileImage: string
  discountCode: string
  discountAmount: number
}

export interface Booking extends BookingFormData {
  bookingId: string
  createdAt: string
  price: number
  deliveryFee: number
  totalAmount: number
  paymentStatus: PaymentStatus
  bookingStatus: BookingStatus
  adminNotes: string
  returnedAt?: string  // ISO — set when admin marks the booking returned
  paidAt?: string      // ISO — first time admin confirmed payment; empty on rows before Nov 2026
  pickedUpAt?: string  // ISO — when admin pressed "ส่งกล้องแล้ว"; the 24h clock starts here
  accessToken?: string // unlocks the full booking page; admin-only, empty on very old rows
}
