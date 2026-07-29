import { Camera, CameraId, PriceGroup, PriceTable } from '@/types'
export type { PriceTable }

export const PRICE_TABLES: Record<PriceGroup, PriceTable> = {
  A: { hourly6: 110, day1: 190, day2: 340, day3: 490, day4: 560, day5: 640, day6: 700, day7: 750 },
  B: { hourly6: 100, day1: 150, day2: 260, day3: 370, day4: 440, day5: 520, day6: 600, day7: 670 },
}

export const ORIGINAL_PRICE_TABLES: Record<PriceGroup, PriceTable> = {
  A: { hourly6: 149, day1: 249, day2: 449, day3: 649, day4: 750, day5: 849, day6: 930, day7: 999 },
  B: { hourly6: 129, day1: 199, day2: 349, day3: 499, day4: 600, day5: 699, day6: 799, day7: 899 },
}

// Beyond 7 days, each extra day is charged flat on top of the 7-day price
export const EXTRA_DAY_RATE: Record<PriceGroup, number> = { A: 100, B: 90 }

export const CAMERAS: Camera[] = [
  {
    id: 'IXY10s',
    name: 'Canon IXY 10s',
    shortName: 'IXY 10s',
    image: '/cameras/ixy10s.png',
    moodImages: ['/mood/ixy10s-1.jpg', '/mood/ixy10s-2.jpg', '/mood/ixy10s-3.jpg'],
    priceGroup: 'A',
    color: '#374151',
    quantity: 1,
  },
  {
    id: 'IXY30s',
    name: 'Canon IXY 30s',
    shortName: 'IXY 30s',
    image: '/cameras/ixy30s.png',
    moodImages: ['/mood/ixy30s-1.jpg', '/mood/ixy30s-2.jpg', '/mood/ixy30s-3.jpg'],
    priceGroup: 'A',
    color: '#6b7280',
    quantity: 1,
  },
  {
    id: 'IXY930IS',
    name: 'Canon IXY 930 IS',
    shortName: 'IXY 930 IS',
    image: '/cameras/ixy930is.png',
    moodImages: ['/mood/ixy930is-1.jpg', '/mood/ixy930is-2.jpg', '/mood/ixy930is-3.jpg'],
    priceGroup: 'A',
    color: '#b45309',
    quantity: 2,
  },
  {
    id: 'IXY510IS',
    name: 'Canon IXY 510 IS',
    shortName: 'IXY 510 IS',
    image: '/cameras/ixy510is.png',
    moodImages: ['/cameras/ixy510is.png', '/cameras/ixy510is.png', '/cameras/ixy510is.png'],
    priceGroup: 'A',
    color: '#a8a29e',
    quantity: 1,
  },
  {
    id: 'IXY910IS',
    name: 'Canon IXY 910 IS',
    shortName: 'IXY 910 IS',
    image: '/cameras/ixy910is.png',
    moodImages: ['/mood/ixy910is-1.jpg', '/mood/ixy910is-2.jpg', '/mood/ixy910is-3.jpg'],
    priceGroup: 'B',
    color: '#d1d5db',
    quantity: 1,
  },
  {
    id: 'IXY200',
    name: 'Canon IXY 200 (IXUS 185)',
    shortName: 'IXY 200',
    image: '/cameras/ixy200.png',
    moodImages: ['/mood/ixy200-1.jpg', '/mood/ixy200-2.jpg', '/mood/ixy200-3.jpg'],
    priceGroup: 'B',
    color: '#dc2626',
    quantity: 1,
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
  if (days === 4) return t.day4
  if (days === 5) return t.day5
  if (days === 6) return t.day6
  if (days === 7) return t.day7
  return t.day7 + (days - 7) * EXTRA_DAY_RATE[priceGroup]
}

export function calcDeliveryFee(pickupType: string, returnType: string): number {
  const pickup = pickupType === 'delivery' ? 20 : 0
  const ret = returnType === 'delivery' ? 20 : 0
  return pickup + ret
}

// Sweep-line: true if the number of slots overlapping at any point within
// [rangeStart, rangeEnd) reaches quantity (all units taken at once).
export function hasCapacityConflict(
  slots: { pickupDatetime: string; returnDatetime: string }[],
  quantity: number,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  const rangeStartMs = rangeStart.getTime()
  const rangeEndMs = rangeEnd.getTime()
  const events: { t: number; delta: number }[] = []

  for (const s of slots) {
    const start = new Date(s.pickupDatetime).getTime()
    const end = new Date(s.returnDatetime).getTime()
    if (start < rangeEndMs && end > rangeStartMs) {
      events.push({ t: Math.max(start, rangeStartMs), delta: 1 })
      events.push({ t: Math.min(end, rangeEndMs), delta: -1 })
    }
  }

  events.sort((a, b) => a.t - b.t || a.delta - b.delta)

  let count = 0
  for (const e of events) {
    count += e.delta
    if (count >= quantity) return true
  }
  return false
}

export const DELIVERY_LOCATION = 'หอพักเมธาเรสสิเดนท์ 3'
export const PROMPTPAY_NUMBER = '0981016683'
