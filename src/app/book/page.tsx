'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { addHours, format, differenceInHours } from 'date-fns'
import { th } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Upload, X, Tag, Check as CheckIcon, Loader } from 'lucide-react'
import { CAMERAS, PRICE_TABLES, calcPrice, calcDeliveryFee } from '@/lib/cameras'
import { getAvailability, createBooking, validateDiscountCode } from '@/lib/api'
import HourlyTimeline from '@/components/HourlyTimeline'
import ReceiptCard from '@/components/ReceiptCard'
import Button from '@/components/ui/Button'
import { BookedSlot, BookingFormData, CameraId, DeliveryType } from '@/types'

const STEPS = ['เลือกกล้อง', 'เลือกวัน-เวลา', 'รับ-คืน', 'ข้อมูลส่วนตัว', 'ยืนยัน']

const DURATION_OPTIONS = [
  { hours: 6, label: '6 ชั่วโมง' },
  { hours: 24, label: '1 วัน' },
  { hours: 48, label: '2 วัน' },
  { hours: 72, label: '3 วัน' },
  { hours: 120, label: '5 วัน' },
  { hours: 168, label: '7 วัน' },
]

function BookPage() {
  const params = useSearchParams()
  const router = useRouter()

  const [step, setStep] = useState(0)
  const [cameraId, setCameraId] = useState<CameraId | null>(
    (params.get('camera') as CameraId) ?? null,
  )
  const [durationHours, setDurationHours] = useState(24)
  const [pickupDatetime, setPickupDatetime] = useState<Date | null>(null)
  const [returnDatetime, setReturnDatetime] = useState<Date | null>(null)
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([])
  const [pickupType, setPickupType] = useState<DeliveryType>('self')
  const [pickupAddress, setPickupAddress] = useState('')
  const [returnType, setReturnType] = useState<DeliveryType>('self')
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
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const camera = cameraId ? CAMERAS.find((c) => c.id === cameraId) : null

  useEffect(() => {
    if (!cameraId) return
    const now = new Date()
    getAvailability(cameraId, now.getFullYear(), now.getMonth() + 1).then(setBookedSlots)
  }, [cameraId])

  useEffect(() => {
    if (cameraId && params.get('camera')) setStep(1)
  }, [])

  function handlePickupSelect(dt: Date) {
    setPickupDatetime(dt)
    setReturnDatetime(addHours(dt, durationHours))
  }

  function handleDurationChange(hours: number) {
    setDurationHours(hours)
    if (pickupDatetime) setReturnDatetime(addHours(pickupDatetime, hours))
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
    if (step === 0 && !cameraId) errs.camera = 'กรุณาเลือกกล้อง'
    if (step === 1) {
      if (!pickupDatetime) errs.pickup = 'กรุณาเลือกวันและเวลารับ'
      else if (selectionConflict) errs.pickup = 'ช่วงเวลาที่เลือกซ้อนทับกับการจองอื่น กรุณาเลือกเวลาใหม่'
    }
    if (step === 2) {
      if (pickupType === 'delivery' && !pickupAddress) errs.pickupAddr = 'กรุณาระบุที่อยู่รับ'
    }
    if (step === 3) {
      if (!customerName) errs.name = 'กรุณาระบุชื่อ'
      if (!customerPhone) errs.phone = 'กรุณาระบุเบอร์โทร'
      if (!idCardImage) errs.idCard = 'กรุณาอัปโหลดบัตรประชาชน'
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
    if (!camera || !cameraId || !pickupDatetime || !returnDatetime) return
    if (!validateStep()) return
    setSubmitting(true)
    try {
      const form: BookingFormData = {
        cameraId,
        pickupDatetime,
        returnDatetime,
        durationHours,
        pickupType,
        pickupAddress,
        returnType,
        returnAddress: '',
        customerName,
        customerPhone,
        customerIG,
        idCardImage,
        igProfileImage,
        discountCode: discountStatus === 'valid' ? discountCode.trim().toUpperCase() : '',
        discountAmount: discountStatus === 'valid' ? discountAmount : 0,
      }
      const { bookingId: id } = await createBooking(form)
      setBookingId(id)
      setStep(5) // receipt step
    } catch (err) {
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่')
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

  const price = camera ? calcPrice(camera.priceGroup, durationHours) : 0
  const deliveryFee = calcDeliveryFee(pickupType, returnType)
  const total = price - discountAmount + deliveryFee

  const selectionConflict = !!(pickupDatetime && returnDatetime && cameraId) &&
    bookedSlots.some((slot) => {
      if (slot.cameraId !== cameraId) return false
      const s = new Date(slot.pickupDatetime)
      const e = new Date(slot.returnDatetime)
      return pickupDatetime < e && returnDatetime > s
    })

  return (
    <main className="min-h-screen bg-gradient-dark">
      {/* Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-pink/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
        {/* Back to home */}
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors"
        >
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-full opacity-70" />
          หน้าหลัก
        </button>

        {/* Step indicator */}
        {step < 5 && (
          <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1 shrink-0">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    i < step
                      ? 'bg-pink text-white'
                      : i === step
                      ? 'bg-pink text-white shadow-pink-glow-sm'
                      : 'bg-white/10 text-white/30'
                  }`}
                >
                  {i + 1}
                </div>
                <span
                  className={`text-xs whitespace-nowrap ${
                    i === step ? 'text-white' : 'text-white/30'
                  }`}
                >
                  {s}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`h-px w-4 ${i < step ? 'bg-pink' : 'bg-white/10'}`} />
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
            {/* Step 0: Camera selection */}
            {step === 0 && (
              <div>
                <h1 className="text-2xl font-bold mb-6">เลือกกล้อง</h1>
                <div className="grid grid-cols-1 gap-3">
                  {CAMERAS.map((cam) => (
                    <button
                      key={cam.id}
                      onClick={() => setCameraId(cam.id)}
                      className={`glass rounded-xl p-4 flex items-center gap-4 text-left transition-all ${
                        cameraId === cam.id
                          ? 'border-pink shadow-pink-glow-sm'
                          : 'hover:border-white/20'
                      }`}
                    >
                      <div className="w-16 h-12 shrink-0 flex items-center justify-center" style={{ background: `${cam.color}18`, borderRadius: 8 }}>
                        <Image src={cam.image} alt={cam.name} width={60} height={44} className="object-contain h-10 w-auto" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{cam.name}</p>
                        <p className="text-white/40 text-sm">
                          เริ่ม {PRICE_TABLES[cam.priceGroup]?.day1 ?? 0} ฿/วัน
                        </p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 transition-all ${
                          cameraId === cam.id
                            ? 'border-pink bg-pink'
                            : 'border-white/20'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                {errors.camera && <p className="text-pink text-sm mt-2">{errors.camera}</p>}
              </div>
            )}

            {/* Step 1: Date & time */}
            {step === 1 && camera && (
              <div>
                {/* Camera preview header */}
                <div className="glass rounded-xl p-4 flex items-center gap-4 mb-5">
                  <div className="w-20 h-14 shrink-0 flex items-center justify-center rounded-lg" style={{ background: `${camera.color}18` }}>
                    <Image src={camera.image} alt={camera.name} width={72} height={52} className="object-contain h-12 w-auto" />
                  </div>
                  <div>
                    <p className="font-bold">{camera.name}</p>
                    <p className="text-white/40 text-sm">เริ่ม {PRICE_TABLES[camera.priceGroup].day1} ฿/วัน</p>
                  </div>
                </div>
                <h1 className="text-2xl font-bold mb-2">เลือกวันและเวลา</h1>
                <p className="text-white/40 text-sm mb-6">คลิกช่องสีเขียวเพื่อเลือกเวลารับกล้อง</p>

                {/* Duration */}
                <div className="glass rounded-xl p-4 mb-5">
                  <p className="text-sm text-white/60 mb-3">ระยะเวลาเช่า</p>
                  <div className="flex flex-wrap gap-2">
                    {DURATION_OPTIONS.map((opt) => (
                      <button
                        key={opt.hours}
                        onClick={() => handleDurationChange(opt.hours)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                          durationHours === opt.hours
                            ? 'bg-pink text-white'
                            : 'glass hover:border-white/20 text-white/60'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-white/30 mt-3">
                    นับ 24 ชม. จากเวลารับจริง
                  </p>
                </div>

                {/* Timeline */}
                <HourlyTimeline
                  cameraId={cameraId!}
                  bookedSlots={bookedSlots}
                  onSelectPickup={handlePickupSelect}
                  selectedPickup={pickupDatetime}
                  durationHours={durationHours}
                />

                {pickupDatetime && returnDatetime && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl p-4 mt-4 space-y-2 text-sm"
                    style={selectionConflict
                      ? { background: 'rgba(220,50,80,0.12)', border: '1px solid rgba(220,50,80,0.35)' }
                      : { background: 'rgba(212,162,39,0.08)', border: '1px solid rgba(212,162,39,0.2)' }
                    }
                  >
                    {selectionConflict && (
                      <p className="text-pink font-semibold text-sm flex items-center gap-2">
                        <span>⚠️</span> ช่วงเวลาซ้อนทับกับการจองอื่น กรุณาเลือกใหม่
                      </p>
                    )}
                    <div className="flex justify-between">
                      <span className="text-white/50">รับ</span>
                      <span>{format(pickupDatetime, 'd MMM yyyy HH:mm', { locale: th })} น.</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">คืน</span>
                      <span>{format(returnDatetime, 'd MMM yyyy HH:mm', { locale: th })} น.</span>
                    </div>
                    {!selectionConflict && (
                      <div className="flex justify-between font-semibold text-gold border-t border-white/10 pt-2">
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

            {/* Step 2: Pickup/return method */}
            {step === 2 && (
              <div>
                <h1 className="text-2xl font-bold mb-6">รูปแบบรับ-คืน</h1>

                <Section title="รับเครื่อง">
                  <OptionCard
                    selected={pickupType === 'self'}
                    onClick={() => setPickupType('self')}
                    title="รับเอง (ฟรี)"
                    sub="หอพักเมธาเรสสิเดนท์ 3"
                  />
                  <OptionCard
                    selected={pickupType === 'delivery'}
                    onClick={() => setPickupType('delivery')}
                    title="Delivery +15฿"
                    sub="ส่งถึงที่ในมมส."
                  />
                  {pickupType === 'delivery' && (
                    <input
                      className="w-full glass rounded-xl px-4 py-3 text-sm outline-none focus:border-pink placeholder:text-white/30 mt-2"
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
                    title="ให้ร้านรับ +15฿"
                    sub="มารับถึงที่ในมมส."
                  />
                </Section>

                <div className="glass rounded-xl p-4 mt-5 text-sm space-y-1">
                  <div className="flex justify-between text-white/60">
                    <span>ค่าเช่า</span><span>{price.toLocaleString()} ฿</span>
                  </div>
                  {deliveryFee > 0 && (
                    <div className="flex justify-between text-white/60">
                      <span>ค่าจัดส่ง</span><span>+{deliveryFee} ฿</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-pink border-t border-white/10 pt-2">
                    <span>รวม</span><span>{total.toLocaleString()} ฿</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Customer info */}
            {step === 3 && (
              <div>
                <h1 className="text-2xl font-bold mb-6">ข้อมูลส่วนตัว</h1>
                <div className="space-y-4">
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
                    label="IG / Facebook"
                    value={customerIG}
                    onChange={setCustomerIG}
                    placeholder="@username"
                  />

                  <div>
                    <p className="text-sm text-white/60 mb-2">บัตรประชาชน * <span className="text-white/30">(สามารถปิดเลขบัตรได้)</span></p>
                    <label className={`flex flex-col items-center justify-center h-28 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                      idCardImage ? 'border-pink/50 bg-pink/5' : 'border-white/15 hover:border-white/30'
                    }`}>
                      {idCardImage ? (
                        <div className="relative w-full h-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={idCardImage} alt="ID" className="w-full h-full object-cover rounded-xl" />
                          <button
                            onClick={(e) => { e.preventDefault(); setIdCardImage('') }}
                            className="absolute top-2 right-2 bg-black/60 rounded-full p-1"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload size={20} className="text-white/30 mb-2" />
                          <span className="text-white/40 text-sm">อัปโหลดรูปบัตร</span>
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'id')} />
                        </>
                      )}
                    </label>
                    {errors.idCard && <p className="text-pink text-xs mt-1">{errors.idCard}</p>}
                  </div>

                  {/* Discount code */}
                  <div>
                    <p className="text-sm text-white/60 mb-2 flex items-center gap-1">
                      <Tag size={13} /> โค้ดส่วนลด <span className="text-white/30">(ถ้ามี)</span>
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
                        className={`w-full glass rounded-xl px-4 py-3 text-sm outline-none transition-colors font-mono tracking-widest placeholder:text-white/25 placeholder:font-sans placeholder:tracking-normal ${
                          discountStatus === 'valid' ? 'border-emerald-500/50' :
                          discountStatus === 'invalid' ? 'border-pink/50' : 'focus:border-gold/40'
                        }`}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {discountStatus === 'checking' && <Loader size={16} className="text-white/40 animate-spin" />}
                        {discountStatus === 'valid' && <CheckIcon size={16} className="text-emerald-400" />}
                        {discountStatus === 'invalid' && <X size={16} className="text-pink" />}
                      </div>
                    </div>
                    {discountStatus === 'valid' && (
                      <p className="text-emerald-400 text-xs mt-1">✓ ส่วนลด 10% ({discountAmount.toLocaleString()} ฿) ถูกนำไปใช้แล้ว</p>
                    )}
                    {discountStatus === 'invalid' && (
                      <p className="text-pink text-xs mt-1">{discountError}</p>
                    )}
                  </div>

                  <div>
                    <p className="text-sm text-white/60 mb-2">หน้าโปรไฟล์ IG / Facebook</p>
                    <label className={`flex flex-col items-center justify-center h-28 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                      igProfileImage ? 'border-pink/50 bg-pink/5' : 'border-white/15 hover:border-white/30'
                    }`}>
                      {igProfileImage ? (
                        <div className="relative w-full h-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={igProfileImage} alt="IG Profile" className="w-full h-full object-cover rounded-xl" />
                          <button
                            onClick={(e) => { e.preventDefault(); setIgProfileImage('') }}
                            className="absolute top-2 right-2 bg-black/60 rounded-full p-1"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload size={20} className="text-white/30 mb-2" />
                          <span className="text-white/40 text-sm">อัปโหลดหน้าโปรไฟล์</span>
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'ig')} />
                        </>
                      )}
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Summary & confirm */}
            {step === 4 && camera && pickupDatetime && returnDatetime && (
              <div>
                <h1 className="text-2xl font-bold mb-6">ยืนยันการจอง</h1>
                <div className="glass-pink rounded-2xl p-5 space-y-3 text-sm mb-6">
                  <SummaryRow label="กล้อง" value={camera.name} />
                  <SummaryRow label="รับ" value={format(pickupDatetime, 'd MMM yyyy HH:mm', { locale: th }) + ' น.'} />
                  <SummaryRow label="คืน" value={format(returnDatetime, 'd MMM yyyy HH:mm', { locale: th }) + ' น.'} />
                  <SummaryRow
                    label="รับเครื่อง"
                    value={pickupType === 'self' ? 'รับเองที่ร้าน (ฟรี)' : `Delivery → ${pickupAddress}`}
                  />
                  <SummaryRow
                    label="คืนเครื่อง"
                    value={returnType === 'self' ? 'คืนเองที่ร้าน (ฟรี)' : 'ให้ร้านรับ +15฿'}
                  />
                  <SummaryRow label="ชื่อ" value={customerName} />
                  <SummaryRow label="โทร" value={customerPhone} />
                  <div className="border-t border-white/10 pt-3 space-y-1">
                    <div className="flex justify-between text-white/60">
                      <span>ค่าเช่า</span><span>{calcPrice(camera!.priceGroup, durationHours).toLocaleString()} ฿</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>ส่วนลด 10% ({discountCode})</span><span>-{discountAmount.toLocaleString()} ฿</span>
                      </div>
                    )}
                    {deliveryFee > 0 && (
                      <div className="flex justify-between text-white/60">
                        <span>ค่าจัดส่ง</span><span>+{deliveryFee} ฿</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg text-gold">
                      <span>ยอดชำระ</span><span>{total.toLocaleString()} ฿</span>
                    </div>
                  </div>
                </div>
                <p className="text-white/40 text-xs text-center mb-4">
                  กดยืนยันเพื่อรับใบจองพร้อม QR PromptPay
                </p>
              </div>
            )}

            {/* Step 5: Receipt */}
            {step === 5 && bookingId && camera && pickupDatetime && returnDatetime && (
              <div>
                <div className="text-center mb-6">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="text-emerald-400 text-2xl">✓</span>
                  </div>
                  <h1 className="text-2xl font-bold mb-1">จองสำเร็จ!</h1>
                  <p className="text-white/40 text-sm">ชำระเงินและส่งสลิปมาที่ IG เพื่อยืนยัน</p>
                </div>
                <ReceiptCard
                  bookingId={bookingId}
                  form={{
                    cameraId: cameraId!,
                    pickupDatetime,
                    returnDatetime,
                    durationHours,
                    pickupType,
                    pickupAddress,
                    returnType,
                    returnAddress: '',
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
        {step < 5 && (
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <Button onClick={back} variant="ghost" className="flex-1">
                <ChevronLeft size={16} /> ย้อนกลับ
              </Button>
            )}
            {step < 4 ? (
              <Button
                onClick={next}
                variant="primary"
                fullWidth={step === 0}
                className="flex-1"
                disabled={step === 1 && selectionConflict}
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
      <p className="text-sm text-white/60 mb-3">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function OptionCard({ selected, onClick, title, sub }: { selected: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full glass rounded-xl p-4 flex items-center justify-between text-left transition-all ${
        selected ? 'border-pink shadow-pink-glow-sm' : 'hover:border-white/20'
      }`}
    >
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-white/40 text-xs mt-0.5">{sub}</p>
      </div>
      <div className={`w-5 h-5 rounded-full border-2 transition-all shrink-0 ${selected ? 'border-pink bg-pink' : 'border-white/20'}`} />
    </button>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', error }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; type?: string; error?: string
}) {
  return (
    <div>
      <label className="text-sm text-white/60 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full glass rounded-xl px-4 py-3 text-sm outline-none transition-colors placeholder:text-white/25 ${
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
      <span className="text-white/50 shrink-0">{label}</span>
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
