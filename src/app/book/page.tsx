'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { addDays, addHours, format, differenceInHours } from 'date-fns'
import { th } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Upload, X, Tag, Check as CheckIcon, Loader } from 'lucide-react'
import {
  CAMERAS, PRICE_TABLES, calcPrice, calcDeliveryFee, hasCapacityConflict, EXTRA_DAY_RATE,
  PROVINCIAL_SHIPPING_FEE, MIN_PROVINCIAL_DURATION_HOURS, PROVINCIAL_SHIP_LEAD_DAYS,
} from '@/lib/cameras'
import { getAvailability, createBooking, attachImages, validateDiscountCode } from '@/lib/api'
import HourlyTimeline from '@/components/HourlyTimeline'
import DayRangePicker from '@/components/DayRangePicker'
import ReceiptCard from '@/components/ReceiptCard'
import Button from '@/components/ui/Button'
import { BookedSlot, BookingFormData, CameraId, DeliveryType, RentalArea } from '@/types'

const DURATION_OPTIONS = [
  { hours: 6, label: '6 ชั่วโมง' },
  { hours: 24, label: '1 วัน' },
  { hours: 48, label: '2 วัน' },
  { hours: 72, label: '3 วัน' },
  { hours: 96, label: '4 วัน' },
  { hours: 120, label: '5 วัน' },
  { hours: 144, label: '6 วัน' },
  { hours: 168, label: '7 วัน' },
]

function formatBookingDate(date: Date, area: RentalArea): string {
  return area === 'provincial'
    ? format(date, 'd MMM yyyy', { locale: th })
    : format(date, 'd MMM yyyy HH:mm', { locale: th }) + ' น.'
}

// Provincial (ต่างจังหวัด) rental is built but can be paused — flip this to false
// to re-hide it, no other changes needed. Step indices are derived per-flow
// inside the component (see stepMap): the local flow keeps its own "รับ-คืน"
// step, while the provincial flow folds the shipping address into the
// personal-info step, so it runs one step shorter.
const PROVINCIAL_ENABLED = true

function BookPage() {
  const params = useSearchParams()
  const router = useRouter()

  const [step, setStep] = useState(0)
  const [cameraId, setCameraId] = useState<CameraId | null>(
    (params.get('camera') as CameraId) ?? null,
  )
  // Never pre-pick an area when the choice is live — the customer has to make it
  // themselves, even when they deep-linked in with a camera already chosen.
  const [rentalArea, setRentalArea] = useState<RentalArea | null>(
    PROVINCIAL_ENABLED ? null : 'local',
  )
  const [durationHours, setDurationHours] = useState(24)
  const [pickupDatetime, setPickupDatetime] = useState<Date | null>(null)
  const [returnDatetime, setReturnDatetime] = useState<Date | null>(null)
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([])
  const [pickupType, setPickupType] = useState<DeliveryType>('self')
  const [pickupAddress, setPickupAddress] = useState('')
  const [returnType, setReturnType] = useState<DeliveryType>('self')
  const [returnSameAsPickup, setReturnSameAsPickup] = useState(true)
  const [returnAddress, setReturnAddress] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')
  const [shippingSubdistrict, setShippingSubdistrict] = useState('')
  const [shippingDistrict, setShippingDistrict] = useState('')
  const [shippingProvince, setShippingProvince] = useState('')
  const [shippingPostalCode, setShippingPostalCode] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerIG, setCustomerIG] = useState('')
  const [idCardImage, setIdCardImage] = useState('')
  const [igProfileImage, setIgProfileImage] = useState('')
  const [discountCode, setDiscountCode] = useState('')
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountStatus, setDiscountStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [discountError, setDiscountError] = useState('')
  const [bookingId, setBookingId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [imageUploadFailed, setImageUploadFailed] = useState(false)
  const [slotsLoading, setSlotsLoading] = useState(0)
  const [slotsError, setSlotsError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [customDays, setCustomDays] = useState(8)

  const camera = cameraId ? CAMERAS.find((c) => c.id === cameraId) : null
  const isProvincial = rentalArea === 'provincial'

  // Step indices per flow. -1 = the step doesn't exist in this flow.
  // Provincial has no standalone address step — the shipping fields live in INFO.
  const stepMap = !PROVINCIAL_ENABLED
    ? { AREA: -1, CAMERA: 0, DATE: 1, ADDRESS: 2, INFO: 3, CONFIRM: 4, RECEIPT: 5 }
    : isProvincial
    ? { AREA: 0, CAMERA: 1, DATE: 2, ADDRESS: -1, INFO: 3, CONFIRM: 4, RECEIPT: 5 }
    : { AREA: 0, CAMERA: 1, DATE: 2, ADDRESS: 3, INFO: 4, CONFIRM: 5, RECEIPT: 6 }
  const STEP_AREA = stepMap.AREA
  const STEP_CAMERA = stepMap.CAMERA
  const STEP_DATE = stepMap.DATE
  const STEP_ADDRESS = stepMap.ADDRESS
  const STEP_INFO = stepMap.INFO
  const STEP_CONFIRM = stepMap.CONFIRM
  const STEP_RECEIPT = stepMap.RECEIPT

  const STEPS = !PROVINCIAL_ENABLED
    ? ['เลือกกล้อง', 'เลือกวัน-เวลา', 'รับ-คืน', 'ข้อมูลส่วนตัว', 'ยืนยัน']
    : isProvincial
    ? ['พื้นที่เช่า', 'เลือกกล้อง', 'เลือกวัน', 'ข้อมูลผู้เช่า', 'ยืนยัน']
    : ['พื้นที่เช่า', 'เลือกกล้อง', 'เลือกวัน-เวลา', 'รับ-คืน', 'ข้อมูลส่วนตัว', 'ยืนยัน']

  const durationOptions = isProvincial
    ? DURATION_OPTIONS.filter((o) => o.hours >= MIN_PROVINCIAL_DURATION_HOURS)
    : DURATION_OPTIONS

  const fetchedMonthsRef = useRef<Set<string>>(new Set())

  // An empty calendar means one of two very different things: nothing is booked,
  // or we could not find out. Until a month has actually loaded, the picker must
  // not present it as free — hence the explicit loading/error state rather than
  // an optimistic empty list.
  function fetchMonth(year: number, month: number) {
    if (!cameraId) return
    const key = `${cameraId}-${year}-${month}`
    if (fetchedMonthsRef.current.has(key)) return
    // NOTE: marked only after the request succeeds. Marking it up front meant a
    // single failed read left the month permanently "already loaded" — and thus
    // permanently blank — for the rest of the session.
    setSlotsLoading((n) => n + 1)
    setSlotsError('')
    getAvailability(cameraId, year, month)
      .then((slots) => {
        fetchedMonthsRef.current.add(key)
        setBookedSlots((prev) => {
          const ids = new Set(prev.map((s) => s.bookingId))
          return [...prev, ...slots.filter((s) => !ids.has(s.bookingId))]
        })
      })
      .catch((e) => {
        setSlotsError(e instanceof Error ? e.message : 'โหลดคิวไม่สำเร็จ')
      })
      .finally(() => setSlotsLoading((n) => n - 1))
  }

  // A rental may run past the month the customer is looking at (31 Oct → 4 Nov),
  // and the conflict check can only see months that were fetched. Pull the
  // neighbouring months too, plus the buffer the backend pads each side with.
  function fetchRangeAround(year: number, month: number) {
    for (let delta = -1; delta <= 1; delta++) {
      const d = new Date(year, month - 1 + delta, 1)
      fetchMonth(d.getFullYear(), d.getMonth() + 1)
    }
  }

  useEffect(() => {
    if (!cameraId) return
    const now = new Date()
    fetchRangeAround(now.getFullYear(), now.getMonth() + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId])

  // A booking spanning many days can reach beyond the months loaded so far.
  useEffect(() => {
    if (!cameraId || !pickupDatetime) return
    const end = returnDatetime ?? pickupDatetime
    fetchRangeAround(pickupDatetime.getFullYear(), pickupDatetime.getMonth() + 1)
    fetchRangeAround(end.getFullYear(), end.getMonth() + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, pickupDatetime, returnDatetime])

  // Deep link from the home page (/book?camera=X) preselects the camera. With
  // the provincial option live we must NOT skip past the area step, or everyone
  // arriving from a camera card would silently be locked into a local rental —
  // so only jump ahead when there is no area to choose.
  useEffect(() => {
    if (cameraId && params.get('camera') && !PROVINCIAL_ENABLED) setStep(STEP_DATE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleAreaSelect(area: RentalArea) {
    setRentalArea(area)
    setPickupDatetime(null)
    setReturnDatetime(null)
    if (area === 'provincial' && durationHours < MIN_PROVINCIAL_DURATION_HOURS) {
      setDurationHours(MIN_PROVINCIAL_DURATION_HOURS)
    }
  }

  // A date picked for one camera is meaningless for another (different stock,
  // different bookings) — clear it so the calendar always starts fresh and the
  // picker remounts (via key={cameraId} below) instead of showing a stale month.
  function handleCameraSelect(id: CameraId) {
    setCameraId(id)
    setPickupDatetime(null)
    setReturnDatetime(null)
    recalcDiscount(id, durationHours)
  }

  function handlePickupSelect(dt: Date) {
    setPickupDatetime(dt)
    setReturnDatetime(addHours(dt, durationHours))
  }

  // The review discount is 10% of the CURRENT price, so it has to be recomputed
  // whenever the price moves. Leaving the figure from the moment the code was
  // validated meant a customer who extended 3 days → 7 days still got 3 days'
  // worth off, and paid more than the promotion promised (and the reverse when
  // shortening, which cost the shop).
  function recalcDiscount(nextCamera: CameraId | null, nextHours: number) {
    if (discountStatus !== 'valid') return
    const cam = nextCamera ? CAMERAS.find((c) => c.id === nextCamera) : null
    if (!cam) { setDiscountAmount(0); return }
    setDiscountAmount(Math.floor(calcPrice(cam.priceGroup, nextHours) * 0.1))
  }

  function handleDurationChange(hours: number) {
    setDurationHours(hours)
    recalcDiscount(cameraId, hours)
    if (pickupDatetime) setReturnDatetime(addHours(pickupDatetime, hours))
  }

  function handleCustomDaysChange(days: number) {
    const clamped = Math.max(8, days)
    setCustomDays(clamped)
    handleDurationChange(clamped * 24)
  }

  async function compressImage(file: File, maxPx = 1200, quality = 0.75): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = url
    })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, field: 'id' | 'ig') {
    const file = e.target.files?.[0]
    if (!file) return
    const b64 = await compressImage(file)
    if (field === 'id') setIdCardImage(b64)
    else setIgProfileImage(b64)
  }

  function validateStep(): boolean {
    const errs: Record<string, string> = {}
    if (step === STEP_AREA && !rentalArea) errs.area = 'กรุณาเลือกพื้นที่เช่า'
    if (step === STEP_CAMERA && !cameraId) errs.camera = 'กรุณาเลือกกล้อง'
    if (step === STEP_DATE) {
      // Moving on while the queue failed to load would mean confirming a slot
      // against data we never actually received.
      if (slotsError) errs.pickup = 'ยังโหลดคิวไม่สำเร็จ กรุณากดลองใหม่ก่อน'
      else if (slotsLoading > 0) errs.pickup = 'กำลังโหลดคิว รอสักครู่'
      else if (!pickupDatetime) errs.pickup = isProvincial ? 'กรุณาเลือกวันเริ่มเช่า' : 'กรุณาเลือกวันและเวลารับ'
      else if (selectionConflict) errs.pickup = 'ช่วงเวลาที่เลือกซ้อนทับกับการจองอื่น กรุณาเลือกเวลาใหม่'
    }
    if (step === STEP_ADDRESS && !isProvincial) {
      if (pickupType === 'delivery' && !pickupAddress) errs.pickupAddr = 'กรุณาระบุที่อยู่รับ'
      if (returnType === 'delivery' && !effectiveReturnAddress) errs.returnAddr = 'กรุณาระบุที่อยู่คืน'
    }
    if (step === STEP_INFO) {
      if (isProvincial) {
        if (!shippingAddress.trim()) errs.shippingAddress = 'กรุณาระบุที่อยู่'
        if (!shippingSubdistrict.trim()) errs.shippingSubdistrict = 'กรุณาระบุตำบล/แขวง'
        if (!shippingDistrict.trim()) errs.shippingDistrict = 'กรุณาระบุอำเภอ/เขต'
        if (!shippingProvince.trim()) errs.shippingProvince = 'กรุณาระบุจังหวัด'
        if (!/^\d{5}$/.test(shippingPostalCode.trim())) errs.shippingPostalCode = 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก'
      }
      if (customerName.trim().length < 2) errs.name = 'กรุณาระบุชื่อ-นามสกุล'
      if (!/^0\d{8,9}$/.test(customerPhone.replace(/[^0-9]/g, ''))) {
        errs.phone = 'เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0'
      }
      if (!idCardImage) errs.idCard = 'กรุณาอัปโหลดบัตรประชาชน'
      if (!igProfileImage) errs.igProfile = 'กรุณาอัปโหลดแคปหน้าโปรไฟล์ IG หรือ Facebook'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function next() {
    if (!validateStep()) return
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit() {
    if (!camera || !cameraId || !rentalArea || !pickupDatetime || !returnDatetime) return
    if (!validateStep()) return
    setSubmitting(true)
    try {
      const form: BookingFormData = {
        cameraId,
        rentalArea,
        pickupDatetime,
        returnDatetime,
        durationHours,
        pickupType: isProvincial ? 'delivery' : pickupType,
        pickupAddress: isProvincial ? '' : pickupAddress,
        returnType: isProvincial ? 'delivery' : returnType,
        returnAddress: isProvincial ? '' : effectiveReturnAddress,
        shippingAddress: isProvincial ? shippingAddress : '',
        shippingSubdistrict: isProvincial ? shippingSubdistrict : '',
        shippingDistrict: isProvincial ? shippingDistrict : '',
        shippingProvince: isProvincial ? shippingProvince : '',
        shippingPostalCode: isProvincial ? shippingPostalCode : '',
        customerName,
        customerPhone,
        customerIG,
        idCardImage,
        igProfileImage,
        discountCode: discountStatus === 'valid' ? discountCode.trim().toUpperCase() : '',
        discountAmount: discountStatus === 'valid' ? discountAmount : 0,
      }
      const { bookingId: id, accessToken: token } = await createBooking(form)
      setBookingId(id)
      setAccessToken(token)
      setStep(STEP_RECEIPT)

      // The slot is secured; the photos can land while the customer reads the
      // receipt and scans the QR. Deliberately not awaited — nothing on screen
      // waits for Drive. If every retry fails, say so on the receipt so the
      // customer can send them over IG instead; the booking itself still stands.
      setImageUploadFailed(false)
      attachImages(id, token, idCardImage, igProfileImage).then((res) => {
        if (!res.success) setImageUploadFailed(true)
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSubmitting(false)
    }
  }

  async function checkDiscountCode(code: string) {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) { setDiscountStatus('idle'); setDiscountAmount(0); setDiscountError(''); return }
    setDiscountStatus('checking')
    const res = await validateDiscountCode(trimmed)
    if (res.valid) {
      const price = camera ? calcPrice(camera.priceGroup, durationHours) : 0
      const amt = Math.floor(price * 0.1)
      setDiscountAmount(amt)
      setDiscountStatus('valid')
      setDiscountError('')
    } else {
      setDiscountAmount(0)
      setDiscountStatus('invalid')
      setDiscountError(res.error ?? 'โค้ดไม่ถูกต้อง')
    }
  }

  const canReusePickupAddr = pickupType === 'delivery'
  const returnUsesSame = returnType === 'delivery' && canReusePickupAddr && returnSameAsPickup
  const effectiveReturnAddress =
    returnType !== 'delivery' ? '' : returnUsesSame ? pickupAddress : returnAddress

  const price = camera ? calcPrice(camera.priceGroup, durationHours) : 0
  const deliveryFee = isProvincial ? PROVINCIAL_SHIPPING_FEE : calcDeliveryFee(pickupType, returnType)
  const total = price - discountAmount + deliveryFee

  const selectionConflict = !!(pickupDatetime && returnDatetime && camera) &&
    hasCapacityConflict(
      bookedSlots.filter((slot) => slot.cameraId === cameraId),
      camera!.quantity,
      isProvincial ? addDays(pickupDatetime!, -PROVINCIAL_SHIP_LEAD_DAYS) : pickupDatetime!,
      isProvincial ? addDays(returnDatetime!, PROVINCIAL_SHIP_LEAD_DAYS) : returnDatetime!,
    )

  return (
    <main className="min-h-screen bg-gradient-dark">
      {/* Lightbox */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoomedImage(null)}
        >
          <button
            className="absolute top-6 right-6 text-white bg-white/20 p-2 rounded-full hover:bg-white/40 transition-colors"
            onClick={() => setZoomedImage(null)}
          >
            <X size={24} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomedImage} className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" alt="ตัวอย่างภาพ" />
        </div>
      )}

      {/* Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-pink/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
        {/* Back to home */}
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-gray-400 hover:text-pink-600 text-sm mb-6 transition-colors"
        >
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full opacity-70" />
          หน้าหลัก
        </button>

        {/* Step indicator */}
        {step < STEPS.length && (
          <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1 shrink-0">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    i < step
                      ? 'bg-pink text-white'
                      : i === step
                      ? 'bg-pink text-white shadow-pink-glow-sm'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {i + 1}
                </div>
                <span
                  className={`text-xs whitespace-nowrap ${
                    i === step ? 'text-gray-800' : 'text-gray-400'
                  }`}
                >
                  {s}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`h-px w-4 ${i < step ? 'bg-pink' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            {/* Step 0: Rental area */}
            {step === STEP_AREA && (
              <div>
                <h1 className="text-2xl font-bold mb-2">เลือกพื้นที่เช่า</h1>
                <p className="text-gray-400 text-sm mb-6">เลือกก่อนว่าอยู่ในพื้นที่ มมส. หรือให้จัดส่งไปต่างจังหวัด</p>
                <div className="space-y-3">
                  <OptionCard
                    selected={rentalArea === 'local'}
                    onClick={() => handleAreaSelect('local')}
                    title="ในพื้นที่ มมส."
                    sub="รับ-คืนเองหรือ Delivery ในมมส. ม.ใหม่ เลือกวัน-เวลาได้อิสระ"
                  />
                  <OptionCard
                    selected={rentalArea === 'provincial'}
                    onClick={() => handleAreaSelect('provincial')}
                    title="ส่งต่างจังหวัด (ทั่วประเทศ)"
                    sub={`เช่าขั้นต่ำ ${MIN_PROVINCIAL_DURATION_HOURS / 24} วัน · ค่าส่งขาไป ${PROVINCIAL_SHIPPING_FEE}฿ (ขากลับลูกค้าส่งเอง) · ต้องจองล่วงหน้า ${PROVINCIAL_SHIP_LEAD_DAYS} วัน`}
                  />
                </div>
                {errors.area && <p className="text-pink text-sm mt-2">{errors.area}</p>}
              </div>
            )}

            {/* Step 1: Camera selection */}
            {step === STEP_CAMERA && (
              <div>
                <h1 className="text-2xl font-bold mb-6">เลือกกล้อง</h1>
                <div className="grid grid-cols-1 gap-3">
                  {CAMERAS.map((cam) => (
                    <button
                      key={cam.id}
                      onClick={() => handleCameraSelect(cam.id)}
                      className={`glass rounded-xl p-4 flex items-center gap-4 text-left transition-all ${
                        cameraId === cam.id
                          ? 'border-pink shadow-pink-glow-sm'
                          : 'hover:border-pink-200'
                      }`}
                    >
                      <div className="w-16 h-12 shrink-0 flex items-center justify-center" style={{ background: `${cam.color}18`, borderRadius: 8 }}>
                        <Image src={cam.image} alt={cam.name} width={60} height={44} className="object-contain h-10 w-auto" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">
                          {cam.name}
                          {cam.quantity > 1 && (
                            <span className="ml-1.5 inline-flex items-center justify-center text-[10px] font-bold text-white bg-pink rounded-full px-1.5 py-0.5 align-middle">
                              x{cam.quantity}
                            </span>
                          )}
                        </p>
                        <p className="text-gray-400 text-sm">
                          เริ่ม {PRICE_TABLES[cam.priceGroup]?.day1 ?? 0} ฿/วัน
                        </p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 transition-all ${
                          cameraId === cam.id
                            ? 'border-pink bg-pink'
                            : 'border-pink-200'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {errors.camera && <p className="text-pink text-sm mt-2">{errors.camera}</p>}
              </div>
            )}

            {/* Step 2: Date & time */}
            {step === STEP_DATE && camera && (
              <div>
                {slotsError && (
                  <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-3">
                    <span>
                      <strong className="block mb-0.5">โหลดคิวไม่สำเร็จ</strong>
                      ยังไม่ทราบว่าช่วงไหนว่าง กรุณาลองใหม่ก่อนเลือกวัน
                    </span>
                    <button
                      type="button"
                      className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-white text-xs font-semibold"
                      onClick={() => {
                        const d = pickupDatetime ?? new Date()
                        setSlotsError('')
                        fetchRangeAround(d.getFullYear(), d.getMonth() + 1)
                      }}
                    >
                      ลองใหม่
                    </button>
                  </div>
                )}
                {!slotsError && slotsLoading > 0 && (
                  <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500">
                    กำลังโหลดคิว…
                  </div>
                )}
                {/* Camera preview header */}
                <div className="glass rounded-xl p-4 flex items-center gap-4 mb-5">
                  <div className="w-20 h-14 shrink-0 flex items-center justify-center rounded-lg" style={{ background: `${camera.color}18` }}>
                    <Image src={camera.image} alt={camera.name} width={72} height={52} className="object-contain h-12 w-auto" />
                  </div>
                  <div>
                    <p className="font-bold">{camera.name}</p>
                    <p className="text-gray-400 text-sm">เริ่ม {PRICE_TABLES[camera.priceGroup].day1} ฿/วัน</p>
                  </div>
                </div>

                {/* Mood board */}
                {camera.moodImages.length > 0 && (
                  <div className="mb-5">
                    <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-widest mb-2">
                      ตัวอย่างภาพจากกล้องนี้
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {camera.moodImages.map((img, idx) => (
                        <button
                          key={img + idx}
                          onClick={() => setZoomedImage(img)}
                          className="aspect-square rounded-xl overflow-hidden border border-pink-100 bg-pink-50 cursor-zoom-in transition-transform hover:scale-[1.03] active:scale-95"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img} alt={`${camera.name} ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <h1 className="text-2xl font-bold mb-2">{isProvincial ? 'เลือกวันเริ่มเช่า' : 'เลือกวันและเวลา'}</h1>
                <p className="text-gray-400 text-sm mb-6">
                  {isProvincial
                    ? 'เลือกวันจากปฏิทิน คิดค่าเช่าเป็นรายวัน ไม่ต้องเลือกชั่วโมง'
                    : 'เลือกวันที่จากปฏิทิน แล้วเลือกเวลาจากรายการด้านล่าง'}
                </p>

                {/* Duration */}
                <div className="glass rounded-xl p-4 mb-5">
                  <p className="text-sm text-gray-500 mb-3">ระยะเวลาเช่า</p>
                  <div className="flex flex-wrap gap-2">
                    {durationOptions.map((opt) => (
                      <button
                        key={opt.hours}
                        onClick={() => handleDurationChange(opt.hours)}
                        className={`px-3 py-2 rounded-lg text-sm transition-all text-center ${
                          durationHours === opt.hours
                            ? 'bg-pink text-white'
                            : 'glass hover:border-pink-200 text-gray-500'
                        }`}
                      >
                        <span className="block">{opt.label}</span>
                        <span className={`block text-[11px] ${durationHours === opt.hours ? 'text-white/80' : 'text-gray-400'}`}>
                          {calcPrice(camera.priceGroup, opt.hours).toLocaleString()}฿
                        </span>
                      </button>
                    ))}

                    {/* Extended rental beyond 7 days */}
                    <div
                      className={`flex items-center gap-1.5 rounded-lg pl-1.5 pr-1.5 py-1.5 transition-all ${
                        durationHours > 168 ? 'bg-pink text-white' : 'glass hover:border-pink-200 text-gray-500'
                      }`}
                    >
                      <button
                        onClick={() => handleCustomDaysChange(customDays - 1)}
                        disabled={customDays <= 8}
                        className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-sm shrink-0 disabled:opacity-30 disabled:cursor-not-allowed transition-all ${
                          durationHours > 168 ? 'bg-white/20 hover:bg-white/30' : 'bg-white border border-pink-200 text-pink hover:bg-pink-50'
                        }`}
                      >
                        −
                      </button>
                      <button
                        onClick={() => handleCustomDaysChange(customDays)}
                        className="text-center leading-tight px-1"
                      >
                        <span className="block">{customDays} วัน</span>
                        <span className={`block text-[11px] ${durationHours > 168 ? 'text-white/80' : 'text-gray-400'}`}>
                          {calcPrice(camera.priceGroup, customDays * 24).toLocaleString()}฿
                        </span>
                      </button>
                      <button
                        onClick={() => handleCustomDaysChange(customDays + 1)}
                        className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-sm shrink-0 transition-all ${
                          durationHours > 168 ? 'bg-white/20 hover:bg-white/30' : 'bg-pink text-white hover:bg-pink-light'
                        }`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    {isProvincial
                      ? `เช่าขั้นต่ำ ${MIN_PROVINCIAL_DURATION_HOURS / 24} วัน · เกิน 7 วัน +${EXTRA_DAY_RATE[camera.priceGroup]}฿/วัน`
                      : `นับ 24 ชม. จากเวลารับจริง · เกิน 7 วัน +${EXTRA_DAY_RATE[camera.priceGroup]}฿/วัน`}
                  </p>
                </div>

                {/* Calendar */}
                {isProvincial ? (
                  <>
                    <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                      📦 วันที่เลือก = <span className="text-gray-500 font-medium">วันที่พัสดุถึงมือคุณ</span> ทางร้านจะส่งพัสดุล่วงหน้า {PROVINCIAL_SHIP_LEAD_DAYS} วัน
                    </p>
                    <DayRangePicker
                      key={cameraId}
                      cameraId={cameraId!}
                      quantity={camera.quantity}
                      bookedSlots={bookedSlots}
                      durationHours={durationHours}
                      onSelectPickup={handlePickupSelect}
                      selectedPickup={pickupDatetime}
                      onMonthChange={fetchRangeAround}
                    />
                  </>
                ) : (
                  <HourlyTimeline
                    key={cameraId}
                    cameraId={cameraId!}
                    quantity={camera.quantity}
                    bookedSlots={bookedSlots}
                    onSelectPickup={handlePickupSelect}
                    selectedPickup={pickupDatetime}
                    durationHours={durationHours}
                    onMonthChange={fetchRangeAround}
                  />
                )}

                {pickupDatetime && returnDatetime && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl p-4 mt-4 space-y-2 text-sm"
                    style={selectionConflict
                      ? { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }
                      : { background: 'rgba(214,51,132,0.06)', border: '1px solid rgba(214,51,132,0.18)' }
                    }
                  >
                    {selectionConflict && (
                      <p className="text-pink font-semibold text-sm flex items-center gap-2">
                        <span>⚠️</span> ช่วงเวลาซ้อนทับกับการจองอื่น กรุณาเลือกใหม่
                      </p>
                    )}
                    {isProvincial ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-500">ร้านส่งพัสดุ</span>
                          <span>{format(addDays(pickupDatetime, -PROVINCIAL_SHIP_LEAD_DAYS), 'd MMM yyyy', { locale: th })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">พัสดุถึงมือ</span>
                          <span>{format(pickupDatetime, 'd MMM yyyy', { locale: th })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">ส่งคืน (ไปรษณีย์/ขนส่งเอกชน)</span>
                          <span>{format(returnDatetime, 'd MMM yyyy', { locale: th })} ก่อน 12:00 น.</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-500">รับ</span>
                          <span>{formatBookingDate(pickupDatetime, rentalArea ?? 'local')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">คืน</span>
                          <span>{formatBookingDate(returnDatetime, rentalArea ?? 'local')}</span>
                        </div>
                      </>
                    )}
                    {!selectionConflict && (
                      <div className="flex justify-between font-semibold text-gold border-t border-pink-100 pt-2">
                        <span>ค่าเช่า</span>
                        <span>{calcPrice(camera!.priceGroup, durationHours).toLocaleString()} ฿</span>
                      </div>
                    )}
                  </motion.div>
                )}

                {errors.pickup && !selectionConflict && (
                  <p className="text-pink text-sm mt-2">{errors.pickup}</p>
                )}
              </div>
            )}

            {/* Step 3: Pickup/return method (local) or shipping address (provincial) */}
            {step === STEP_ADDRESS && !isProvincial && (
              <div>
                <h1 className="text-2xl font-bold mb-6">รูปแบบรับ-คืน</h1>

                <Section title="รับเครื่อง">
                  <OptionCard
                    selected={pickupType === 'self'}
                    onClick={() => setPickupType('self')}
                    title="รับเอง (ฟรี)"
                    sub="รับได้ที่หอพักเมธาเรสสิเดนท์ 3 ซอยวุ่นวาย"
                  />
                  <OptionCard
                    selected={pickupType === 'delivery'}
                    onClick={() => setPickupType('delivery')}
                    title="Delivery +20฿"
                    sub="เฉพาะมมส ม.ใหม่"
                  />
                  {pickupType === 'delivery' && (
                    <input
                      className="w-full glass rounded-xl px-4 py-3 text-sm outline-none focus:border-pink placeholder:text-gray-400 mt-2"
                      placeholder="ระบุที่อยู่ (หอ/อาคาร/ห้อง)"
                      value={pickupAddress}
                      onChange={(e) => setPickupAddress(e.target.value)}
                    />
                  )}
                  {errors.pickupAddr && <p className="text-pink text-xs mt-1">{errors.pickupAddr}</p>}
                </Section>

                <Section title="คืนเครื่อง" className="mt-5">
                  <OptionCard
                    selected={returnType === 'self'}
                    onClick={() => setReturnType('self')}
                    title="คืนเอง (ฟรี)"
                    sub="หอพักเมธาเรสสิเดนท์ 3"
                  />
                  <OptionCard
                    selected={returnType === 'delivery'}
                    onClick={() => setReturnType('delivery')}
                    title="ให้ร้านรับ +20฿"
                    sub="เฉพาะมมส. ม.ใหม่"
                  />
                  {returnType === 'delivery' && (
                    <div className="ml-4 pl-3 border-l-2 border-pink-100 space-y-1.5">
                      {canReusePickupAddr && (
                        <>
                          <SubOption
                            selected={returnSameAsPickup}
                            onClick={() => setReturnSameAsPickup(true)}
                            title="ใช้ที่อยู่เดิม"
                            sub={pickupAddress || undefined}
                          />
                          <SubOption
                            selected={!returnSameAsPickup}
                            onClick={() => setReturnSameAsPickup(false)}
                            title="ที่อยู่อื่น (ระบุ)"
                          />
                        </>
                      )}
                      {(!canReusePickupAddr || !returnSameAsPickup) && (
                        <input
                          className="w-full glass rounded-xl px-4 py-2.5 text-sm outline-none focus:border-pink placeholder:text-gray-400"
                          placeholder="ระบุที่อยู่คืน (หอ/อาคาร/ห้อง)"
                          value={returnAddress}
                          onChange={(e) => setReturnAddress(e.target.value)}
                        />
                      )}
                      {errors.returnAddr && <p className="text-pink text-xs mt-1">{errors.returnAddr}</p>}
                    </div>
                  )}
                </Section>

                <div className="glass rounded-xl p-4 mt-5 text-sm space-y-1">
                  <div className="flex justify-between text-gray-500">
                    <span>ค่าเช่า</span><span>{price.toLocaleString()} ฿</span>
                  </div>
                  {deliveryFee > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>ค่าจัดส่ง</span><span>+{deliveryFee} ฿</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-pink border-t border-pink-100 pt-2">
                    <span>รวม</span><span>{total.toLocaleString()} ฿</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Customer info (+ shipping address for provincial) */}
            {step === STEP_INFO && (
              <div>
                <h1 className="text-2xl font-bold mb-6">{isProvincial ? 'ข้อมูลผู้เช่าและที่อยู่จัดส่ง' : 'ข้อมูลส่วนตัว'}</h1>

                <div className="space-y-4">
                  {isProvincial && <p className="text-sm font-semibold text-gray-600">ข้อมูลผู้เช่า</p>}
                  <Field
                    label="ชื่อ-นามสกุล *"
                    value={customerName}
                    onChange={setCustomerName}
                    placeholder="ชื่อที่ตรงกับบัตรประชาชน"
                    error={errors.name}
                  />
                  <Field
                    label="เบอร์โทรศัพท์ *"
                    value={customerPhone}
                    onChange={setCustomerPhone}
                    placeholder="08X-XXX-XXXX"
                    type="tel"
                    error={errors.phone}
                  />
                  <Field
                    label="ชื่อ IG หรือ Line ที่ใช้ทักเข้ามา"
                    value={customerIG}
                    onChange={setCustomerIG}
                    placeholder="@username"
                  />
                </div>

                {isProvincial && (
                  <div className="space-y-4 my-6">
                    <p className="text-sm font-semibold text-gray-600">ที่อยู่จัดส่ง</p>
                    <div>
                      <label className="text-sm text-gray-500 block mb-1">ที่อยู่ (บ้านเลขที่ / หมู่ / ซอย / ถนน) *</label>
                      <textarea
                        value={shippingAddress}
                        onChange={(e) => setShippingAddress(e.target.value)}
                        placeholder="เช่น 123 หมู่ 4 ซอยสุขใจ ถ.มิตรภาพ"
                        rows={3}
                        className={`w-full glass rounded-xl px-4 py-3 text-sm outline-none transition-colors placeholder:text-gray-300 resize-none ${
                          errors.shippingAddress ? 'border-pink/60' : 'focus:border-pink/50'
                        }`}
                      />
                      {errors.shippingAddress && <p className="text-pink text-xs mt-1">{errors.shippingAddress}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        label="ตำบล/แขวง *"
                        value={shippingSubdistrict}
                        onChange={setShippingSubdistrict}
                        placeholder="ตำบล/แขวง"
                        error={errors.shippingSubdistrict}
                      />
                      <Field
                        label="อำเภอ/เขต *"
                        value={shippingDistrict}
                        onChange={setShippingDistrict}
                        placeholder="อำเภอ/เขต"
                        error={errors.shippingDistrict}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        label="จังหวัด *"
                        value={shippingProvince}
                        onChange={setShippingProvince}
                        placeholder="จังหวัด"
                        error={errors.shippingProvince}
                      />
                      <Field
                        label="รหัสไปรษณีย์ *"
                        value={shippingPostalCode}
                        onChange={(v) => setShippingPostalCode(v.replace(/\D/g, '').slice(0, 5))}
                        placeholder="XXXXX"
                        type="tel"
                        error={errors.shippingPostalCode}
                      />
                    </div>

                    <div className="glass rounded-xl p-4 text-sm space-y-1.5">
                      <p className="text-gray-500 font-semibold">การคืนเครื่อง</p>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        ลูกค้านำพัสดุไปส่งคืนทางไปรษณีย์หรือขนส่งเอกชนเอง โดยรับผิดชอบค่าส่งขากลับเอง
                        {returnDatetime && ` ก่อน 12:00 น. ของวันที่ ${format(returnDatetime, 'd MMM yyyy', { locale: th })}`}
                      </p>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        แล้วแจ้งเลขพัสดุในแชท
                        {returnDatetime && ` ก่อนเที่ยงวันที่ ${format(addDays(returnDatetime, 1), 'd MMM yyyy', { locale: th })}`}
                      </p>
                    </div>

                    <div className="glass rounded-xl p-4 text-sm space-y-1">
                      <div className="flex justify-between text-gray-500">
                        <span>ค่าเช่า</span><span>{price.toLocaleString()} ฿</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>ค่าส่ง (ขาไป)</span><span>+{deliveryFee} ฿</span>
                      </div>
                      <div className="flex justify-between font-bold text-pink border-t border-pink-100 pt-2">
                        <span>รวม</span><span>{total.toLocaleString()} ฿</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {isProvincial && <p className="text-sm font-semibold text-gray-600">หลักฐานยืนยันตัวตน</p>}
                  <div>
                    <p className="text-sm text-gray-500 mb-2">บัตรประชาชน * <span className="text-gray-400">(สามารถปิดเลขบัตรได้)</span></p>
                    <label className={`flex flex-col items-center justify-center h-40 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                      idCardImage ? 'border-pink/50 bg-pink/5' : 'border-pink-300 bg-pink-50/60 hover:border-pink hover:bg-pink-50 hover:shadow-pink-glow-sm'
                    }`}>
                      {idCardImage ? (
                        <div className="relative w-full h-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={idCardImage} alt="ID" className="w-full h-full object-cover rounded-2xl" />
                          <button
                            onClick={(e) => { e.preventDefault(); setIdCardImage('') }}
                            className="absolute top-2 right-2 bg-black/60 rounded-full p-1"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="bg-white rounded-full p-3 shadow-pink-glow-sm mb-2">
                            <Upload size={24} className="text-pink" />
                          </div>
                          <span className="text-pink-600 text-sm font-semibold">อัปโหลดรูปบัตรประชาชน</span>
                          <span className="text-gray-400 text-xs mt-0.5">แตะเพื่อเลือกรูป</span>
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'id')} />
                        </>
                      )}
                    </label>
                    {errors.idCard && <p className="text-pink text-xs mt-1">{errors.idCard}</p>}
                  </div>

                  <div>
                    <p className="text-sm text-gray-500 mb-2">แคปหน้าโปรไฟล์ IG หรือ Facebook ที่ระบุได้ว่าเป็นบุคคลเดียวกันบนบัตรประชาชน *</p>
                    <label className={`flex flex-col items-center justify-center h-40 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                      igProfileImage ? 'border-pink/50 bg-pink/5' : 'border-pink-300 bg-pink-50/60 hover:border-pink hover:bg-pink-50 hover:shadow-pink-glow-sm'
                    }`}>
                      {igProfileImage ? (
                        <div className="relative w-full h-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={igProfileImage} alt="IG Profile" className="w-full h-full object-cover rounded-2xl" />
                          <button
                            onClick={(e) => { e.preventDefault(); setIgProfileImage('') }}
                            className="absolute top-2 right-2 bg-black/60 rounded-full p-1"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="bg-white rounded-full p-3 shadow-pink-glow-sm mb-2">
                            <Upload size={24} className="text-pink" />
                          </div>
                          <span className="text-pink-600 text-sm font-semibold">อัปโหลดหน้าโปรไฟล์</span>
                          <span className="text-gray-400 text-xs mt-0.5">แตะเพื่อเลือกรูป</span>
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'ig')} />
                        </>
                      )}
                    </label>
                    {errors.igProfile && <p className="text-pink text-xs mt-1">{errors.igProfile}</p>}
                  </div>

                  {/* Discount code */}
                  <div>
                    <p className="text-sm text-gray-500 mb-2 flex items-center gap-1">
                      <Tag size={13} /> โค้ดส่วนลด <span className="text-gray-400">(ถ้ามี)</span>
                    </p>
                    <div className="relative">
                      <input
                        type="text"
                        value={discountCode}
                        onChange={(e) => {
                          const v = e.target.value.toUpperCase()
                          setDiscountCode(v)
                          setDiscountStatus('idle')
                          setDiscountAmount(0)
                          setDiscountError('')
                        }}
                        onBlur={() => checkDiscountCode(discountCode)}
                        placeholder="MIW-XXXXXX"
                        className={`w-full glass rounded-xl px-4 py-3 text-sm outline-none transition-colors font-mono tracking-widest placeholder:text-gray-300 placeholder:font-sans placeholder:tracking-normal ${
                          discountStatus === 'valid' ? 'border-emerald-500/50' :
                          discountStatus === 'invalid' ? 'border-pink/50' : 'focus:border-gold/40'
                        }`}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {discountStatus === 'checking' && <Loader size={16} className="text-gray-400 animate-spin" />}
                        {discountStatus === 'valid' && <CheckIcon size={16} className="text-emerald-500" />}
                        {discountStatus === 'invalid' && <X size={16} className="text-pink" />}
                      </div>
                    </div>
                    {discountStatus === 'valid' && (
                      <p className="text-emerald-500 text-xs mt-1">✓ ส่วนลด 10% ({discountAmount.toLocaleString()} ฿) ถูกนำไปใช้แล้ว</p>
                    )}
                    {discountStatus === 'invalid' && (
                      <p className="text-pink text-xs mt-1">{discountError}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Summary & confirm */}
            {step === STEP_CONFIRM && camera && rentalArea && pickupDatetime && returnDatetime && (
              <div>
                <h1 className="text-2xl font-bold mb-6">ยืนยันการจอง</h1>
                <div className="glass-pink rounded-2xl p-5 space-y-3 text-sm mb-6">
                  <SummaryRow label="พื้นที่" value={isProvincial ? 'ต่างจังหวัด (ส่งพัสดุ)' : 'ในพื้นที่ มมส.'} />
                  <SummaryRow label="กล้อง" value={camera.name} />
                  {isProvincial ? (
                    <>
                      <SummaryRow label="ร้านส่งพัสดุ" value={format(addDays(pickupDatetime, -PROVINCIAL_SHIP_LEAD_DAYS), 'd MMM yyyy', { locale: th })} />
                      <SummaryRow label="พัสดุถึงมือ" value={format(pickupDatetime, 'd MMM yyyy', { locale: th })} />
                      <SummaryRow label="ส่งคืน (ไปรษณีย์/ขนส่งเอกชน)" value={`${format(returnDatetime, 'd MMM yyyy', { locale: th })} ก่อน 12:00 น.`} />
                      <SummaryRow
                        label="ที่อยู่จัดส่ง"
                        value={`${shippingAddress} ต.${shippingSubdistrict} อ./เขต ${shippingDistrict} จ.${shippingProvince} ${shippingPostalCode}`}
                      />
                      <SummaryRow
                        label="แจ้งเลขพัสดุภายใน"
                        value={`เที่ยงวันที่ ${format(addDays(returnDatetime, 1), 'd MMM yyyy', { locale: th })}`}
                      />
                    </>
                  ) : (
                    <>
                      <SummaryRow label="รับ" value={formatBookingDate(pickupDatetime, rentalArea)} />
                      <SummaryRow label="คืน" value={formatBookingDate(returnDatetime, rentalArea)} />
                    </>
                  )}
                  {!isProvincial && (
                    <>
                      <SummaryRow
                        label="รับเครื่อง"
                        value={pickupType === 'self' ? 'รับเองที่ร้าน (ฟรี)' : `Delivery → ${pickupAddress}`}
                      />
                      <SummaryRow
                        label="คืนเครื่อง"
                        value={returnType === 'self' ? 'คืนเองที่ร้าน (ฟรี)' : `Delivery → ${effectiveReturnAddress}`}
                      />
                    </>
                  )}
                  <SummaryRow label="ชื่อ" value={customerName} />
                  <SummaryRow label="โทร" value={customerPhone} />
                  <div className="border-t border-pink-100 pt-3 space-y-1">
                    <div className="flex justify-between text-gray-500">
                      <span>ค่าเช่า</span><span>{calcPrice(camera!.priceGroup, durationHours).toLocaleString()} ฿</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-500">
                        <span>ส่วนลด 10% ({discountCode})</span><span>-{discountAmount.toLocaleString()} ฿</span>
                      </div>
                    )}
                    {deliveryFee > 0 && (
                      <div className="flex justify-between text-gray-500">
                        <span>{isProvincial ? 'ค่าส่ง (ขาไป)' : 'ค่าจัดส่ง'}</span><span>+{deliveryFee} ฿</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg text-gold">
                      <span>ยอดชำระ</span><span>{total.toLocaleString()} ฿</span>
                    </div>
                  </div>
                </div>
                <p className="text-gray-400 text-xs text-center mb-4">
                  กดยืนยันเพื่อรับใบจองพร้อม QR PromptPay
                </p>
              </div>
            )}

            {/* Step 6: Receipt */}
            {step === STEP_RECEIPT && bookingId && camera && rentalArea && pickupDatetime && returnDatetime && (
              <div>
                <div className="text-center mb-6">
                  <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-emerald-500 text-2xl">✓</span>
                  </div>
                  <h1 className="text-2xl font-bold mb-1">จองสำเร็จ!</h1>
                  <p className="text-gray-400 text-sm">ชำระเงินและส่งสลิปมาที่ IG เพื่อยืนยัน</p>
                </div>
                {imageUploadFailed && (
                  <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <strong className="block mb-0.5">การจองของคุณสำเร็จแล้ว</strong>
                    แต่ส่งรูปบัตรประชาชน/โปรไฟล์ IG ไม่สำเร็จ รบกวนส่งรูปมาที่ IG{' '}
                    <span className="font-semibold">@miwvie_shop</span> พร้อมสลิปได้เลยค่ะ
                  </div>
                )}
                <ReceiptCard
                  bookingId={bookingId}
                  form={{
                    cameraId: cameraId!,
                    rentalArea,
                    pickupDatetime,
                    returnDatetime,
                    durationHours,
                    pickupType: isProvincial ? 'delivery' : pickupType,
                    pickupAddress: isProvincial ? '' : pickupAddress,
                    returnType: isProvincial ? 'delivery' : returnType,
                    returnAddress: isProvincial ? '' : effectiveReturnAddress,
                    shippingAddress: isProvincial ? shippingAddress : '',
                    shippingSubdistrict: isProvincial ? shippingSubdistrict : '',
                    shippingDistrict: isProvincial ? shippingDistrict : '',
                    shippingProvince: isProvincial ? shippingProvince : '',
                    shippingPostalCode: isProvincial ? shippingPostalCode : '',
                    customerName,
                    customerPhone,
                    customerIG,
                    idCardImage,
                    igProfileImage,
                    discountCode: discountStatus === 'valid' ? discountCode.trim().toUpperCase() : '',
                    discountAmount: discountStatus === 'valid' ? discountAmount : 0,
                  }}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation buttons */}
        {step < STEPS.length && (
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <Button onClick={back} variant="ghost" className="flex-1">
                <ChevronLeft size={16} /> ย้อนกลับ
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button
                onClick={next}
                variant="primary"
                fullWidth={step === 0}
                className="flex-1"
                disabled={step === STEP_DATE && selectionConflict}
              >
                ถัดไป <ChevronRight size={16} />
              </Button>
            ) : (
              <Button onClick={handleSubmit} variant="primary" loading={submitting} className="flex-1">
                ยืนยันและรับใบจอง
              </Button>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-sm text-gray-500 mb-3">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function OptionCard({ selected, onClick, title, sub }: { selected: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full glass rounded-xl p-4 flex items-center justify-between text-left transition-all ${
        selected ? 'border-pink shadow-pink-glow-sm' : 'hover:border-pink-200'
      }`}
    >
      <div>
        <p className="font-medium text-sm">{title}</p>
        {sub && <p className="text-gray-400 text-xs mt-0.5">{sub}</p>}
      </div>
      <div className={`w-5 h-5 rounded-full border-2 transition-all shrink-0 ${selected ? 'border-pink bg-pink' : 'border-pink-200'}`} />
    </button>
  )
}

function SubOption({ selected, onClick, title, sub }: { selected: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full bg-white rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-left border transition-all ${
        selected ? 'border-pink shadow-pink-glow-sm' : 'border-pink-100 hover:border-pink-200'
      }`}
    >
      <div className="min-w-0">
        <p className={`text-sm ${selected ? 'text-pink font-medium' : 'text-gray-600'}`}>{title}</p>
        {sub && <p className="text-gray-400 text-xs mt-0.5 truncate">{sub}</p>}
      </div>
      <div className={`w-4 h-4 rounded-full border-2 transition-all shrink-0 ${selected ? 'border-pink bg-pink' : 'border-pink-200'}`} />
    </button>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', error }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; type?: string; error?: string
}) {
  return (
    <div>
      <label className="text-sm text-gray-500 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full glass rounded-xl px-4 py-3 text-sm outline-none transition-colors placeholder:text-gray-300 ${
          error ? 'border-pink/60' : 'focus:border-pink/50'
        }`}
      />
      {error && <p className="text-pink text-xs mt-1">{error}</p>}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  )
}

export default function BookPageWrapper() {
  return (
    <Suspense>
      <BookPage />
    </Suspense>
  )
}
