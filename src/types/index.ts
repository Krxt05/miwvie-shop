export type CameraId = 'IXY10s' | 'IXY30s' | 'IXY930IS' | 'IXY510IS' | 'IXY910IS' | 'IXY200'
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
}

export interface BookedSlot {
  cameraId: CameraId
  pickupDatetime: string  // ISO
  returnDatetime: string  // ISO
  bookingId: string
  quantity?: number  // units this slot takes up; defaults to 1 (admin blocks can cover more)
}

export interface BookingFormData {
  cameraId: CameraId
  pickupDatetime: Date
  returnDatetime: Date
  durationHours: number
  pickupType: DeliveryType
  pickupAddress: string
  returnType: DeliveryType
  returnAddress: string
  customerName: string
  customerPhone: string
  customerIG: string
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
}
