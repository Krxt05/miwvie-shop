import { Camera, CameraId, PriceGroup, PriceTable } from '@/types'
export type { PriceTable }

export const PRICE_TABLES: Record<PriceGroup, PriceTable> = {
  A: { hourly6: 149, day1: 249, day2: 449, day3: 649, day5: 849, day7: 999 },
  B: { hourly6: 129, day1: 199, day2: 349, day3: 499, day5: 699, day7: 899 },
}

export const CAMERAS: Camera[] = [
  {
    id: 'IXY10s',
    name: 'Canon IXY 10s',
    shortName: 'IXY 10s',
    image: '/cameras/ixy10s.jpg',
    moodImages: ['/mood/ixy10s-1.jpg', '/mood/ixy10s-2.jpg', '/mood/ixy10s-3.jpg'],
    priceGroup: 'A',
    color: '#374151',
  },
  {
    id: 'IXY30s',
    name: 'Canon IXY 30s',
    shortName: 'IXY 30s',
    image: '/cameras/ixy30s.jpg',
    moodImages: ['/mood/ixy30s-1.jpg', '/mood/ixy30s-2.jpg', '/mood/ixy30s-3.jpg'],
    priceGroup: 'A',
    color: '#6b7280',
  },
  {
    id: 'IXY930IS',
    name: 'Canon IXY 930 IS',
    shortName: 'IXY 930 IS',
    image: '/cameras/ixy930is.jpg',
    moodImages: ['/mood/ixy930is-1.jpg', '/mood/ixy930is-2.jpg', '/mood/ixy930is-3.jpg'],
    priceGroup: 'A',
    color: '#b45309',
  },
  {
    id: 'IXY910IS',
    name: 'Canon IXY 910 IS',
    shortName: 'IXY 910 IS',
    image: '/cameras/ixy910is.jpg',
    moodImages: ['/mood/ixy910is-1.jpg', '/mood/ixy910is-2.jpg', '/mood/ixy910is-3.jpg'],
    priceGroup: 'B',
    color: '#d1d5db',
  },
  {
    id: 'IXY200',
    name: 'Canon IXY 200 (IXUS 185)',
    shortName: 'IXY 200',
    image: '/cameras/ixy200.jpg',
    moodImages: ['/mood/ixy200-1.jpg', '/mood/ixy200-2.jpg', '/mood/ixy200-3.jpg'],
    priceGroup: 'B',
    color: '#dc2626',
  },
]

export function getCameraById(id: CameraId): Camera | undefined {
  return CAMERAS.find((c) => c.id === id)
}

export function calcPrice(priceGroup: PriceGroup, durationHours: number): number {
  const t = PRICE_TABLES[priceGroup]
  if (durationHours <= 6) return t.hourly6
  const days = Math.ceil(durationHours / 24)
  if (days === 1) return t.day1
  if (days === 2) return t.day2
  if (days === 3) return t.day3
  if (days <= 5) return t.day5
  return t.day7
}

export function calcDeliveryFee(pickupType: string, returnType: string): number {
  const pickup = pickupType === 'delivery' ? 15 : 0
  const ret = returnType === 'delivery' ? 15 : 0
  return pickup + ret
}

export const DELIVERY_LOCATION = 'หอพักเมธาเรสสิเดนท์ 3'
export const PROMPTPAY_NUMBER = '0820409263'
