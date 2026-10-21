'use client'
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { addDays, format } from 'date-fns'
import { th } from 'date-fns/locale'
import { ExternalLink, Camera } from 'lucide-react'
import Image from 'next/image'
import { BookingFormData } from '@/types'
import { CAMERAS, calcPrice, calcDeliveryFee, PROMPTPAY_NUMBER, PROVINCIAL_SHIPPING_FEE, PROVINCIAL_SHIP_LEAD_DAYS, SHOP_MAP_URL } from '@/lib/cameras'
import { generatePromptPayPayload } from '@/lib/promptpay'
import Button from './ui/Button'

interface Props {
  bookingId: string
  form: BookingFormData
  // The saved booking's amount, when re-showing the slip from the status page.
  // The server priced it, so it wins over recalculating from today's table.
  totalAmount?: number
  // Hide the screenshot / IG buttons when the host page has its own.
  showActions?: boolean
}

export default function ReceiptCard({ bookingId, form, totalAmount, showActions = true }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const receiptRef = useRef<HTMLDivElement>(null)

  const isProvincial = form.rentalArea === 'provincial'
  const camera = CAMERAS.find((c) => c.id === form.cameraId)
  const basePrice = camera ? calcPrice(camera.priceGroup, form.durationHours) : 0
  const discountAmount = form.discountAmount ?? 0
  const price = basePrice - discountAmount
  const deliveryFee = isProvincial ? PROVINCIAL_SHIPPING_FEE : calcDeliveryFee(form.pickupType, form.returnType)
  const total = totalAmount ?? price + deliveryFee
  const dateFmt = isProvincial ? 'd MMM yy' : 'd MMM yy HH:mm'

  // qrcode is imported statically: the lazy chunk it used to come from could
  // fail to load (a tab left open across a deploy), and the slip then showed
  // no QR and no account number at all.
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(generatePromptPayPayload(PROMPTPAY_NUMBER, total), {
      width: 160,
      margin: 1,
      color: { dark: '#1a0818', light: '#ffffff' },
    })
      .then((url) => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => { /* the number below still lets them pay */ })
    return () => { cancelled = true }
  }, [total])

  function openIGDM() {
    window.open('https://www.instagram.com/miwvie_shop/', '_blank')
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Receipt card */}
      <div
        ref={receiptRef}
        className="rounded-2xl overflow-hidden bg-white shadow-xl shadow-pink-100 border border-pink-100"
      >
        {/* Header — logo + title */}
        <div className="flex flex-col items-center pt-5 pb-4 px-6 border-b border-dashed border-pink-200">
          <div className="p-[3px] rounded-full mb-2 drop-shadow-lg" style={{ background: 'linear-gradient(135deg, #8C2B3F, #A8475A, #D9B3B7, #8C2B3F)' }}>
            <Image
              src="/logo.png"
              alt="MIWVIE SHOP"
              width={72}
              height={72}
              className="rounded-full block"
            />
          </div>
          <p className="text-pink-400 text-[10px] uppercase tracking-[0.2em]">MIWVIE SHOP</p>
          <h2 className="text-gradient font-display text-xl font-bold leading-tight">ใบจองกล้อง</h2>
          <p className="text-gray-400 text-xs mt-0.5">{bookingId}</p>
        </div>

        {/* Booking details */}
        <div className="px-6 py-4 space-y-2 text-sm border-b border-dashed border-pink-200">
          <Row label="พื้นที่" value={isProvincial ? 'ต่างจังหวัด (ส่งพัสดุ)' : 'ในพื้นที่ มมส.'} />
          <Row label="กล้อง" value={camera?.name ?? String(form.cameraId)} highlight />
          {isProvincial && (
            <Row
              label="ร้านส่งพัสดุ"
              value={format(addDays(form.pickupDatetime, -PROVINCIAL_SHIP_LEAD_DAYS), dateFmt, { locale: th })}
            />
          )}
          <Row
            label={isProvincial ? 'พัสดุถึงมือ' : 'รับ'}
            value={format(form.pickupDatetime, dateFmt, { locale: th }) + (isProvincial ? '' : ' น.')}
          />
          <Row
            label={isProvincial ? 'ส่งคืน (ไปรษณีย์/ขนส่งเอกชน)' : 'คืน'}
            value={format(form.returnDatetime, dateFmt, { locale: th }) + (isProvincial ? ' ก่อน 12:00 น.' : ' น.')}
          />
          {isProvincial ? (
            <>
              <Row
                label="ที่อยู่จัดส่ง"
                value={`${form.shippingAddress} ต.${form.shippingSubdistrict} อ./เขต ${form.shippingDistrict} จ.${form.shippingProvince} ${form.shippingPostalCode}`}
              />
              <Row
                label="แจ้งเลขพัสดุภายใน"
                value={`เที่ยงวันที่ ${format(addDays(form.returnDatetime, 1), 'd MMM yy', { locale: th })}`}
              />
            </>
          ) : (
            (() => {
              const pu = form.pickupType === 'delivery' ? form.pickupAddress : ''
              const ru = form.returnType === 'delivery' ? form.returnAddress : ''
              if (pu && ru && pu === ru) return <AddressRow label="ที่อยู่จัดส่ง" value={pu} />
              return (
                <>
                  {pu && <AddressRow label="ที่อยู่รับ" value={pu} />}
                  {ru && <AddressRow label="ที่อยู่คืน" value={ru} />}
                </>
              )
            })()
          )}
          {form.customerName && <Row label="ชื่อ" value={form.customerName} />}
          {!isProvincial && (form.pickupType === 'self' || form.returnType === 'self') && (
            <a
              href={SHOP_MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-right text-xs text-pink font-semibold hover:underline pt-1"
            >
              📍 แผนที่จุดรับ-คืน หอพักเมธาเรสสิเดนท์ 3 →
            </a>
          )}
        </div>

        {/* Amount */}
        <div className="px-6 py-3 border-b border-dashed border-pink-200">
          {(deliveryFee > 0 || discountAmount > 0) && (
            <Row label="ค่าเช่า" value={`${basePrice.toLocaleString()} ฿`} />
          )}
          {discountAmount > 0 && (
            <Row label={form.discountCode ? `ส่วนลด 10% (${form.discountCode})` : 'ส่วนลด 10%'} value={`-${discountAmount.toLocaleString()} ฿`} highlight accent="emerald" />
          )}
          {deliveryFee > 0 && (
            <Row label={isProvincial ? 'ค่าส่ง (ขาไป)' : 'ค่าจัดส่ง'} value={`+${deliveryFee} ฿`} />
          )}
          <div className="flex justify-between items-baseline mt-1">
            <span className="text-gray-800 font-bold text-sm">ยอดชำระ</span>
            <span className="text-gold font-bold text-2xl">{total.toLocaleString()} ฿</span>
          </div>
        </div>

        {/* QR Code — compact horizontal layout; the number shows even before the QR */}
        <div className="px-6 py-4 flex items-center gap-4 border-b border-dashed border-pink-200">
          <div className="bg-white rounded-xl p-2 shrink-0 border border-pink-100">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="PromptPay QR" className="w-24 h-24" />
            ) : (
              <div className="w-24 h-24" />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-gray-500 text-[11px]">สแกนจ่ายผ่าน</p>
            <p className="text-gray-800 font-bold text-sm">PromptPay</p>
            <p className="text-pink text-sm font-semibold">{PROMPTPAY_NUMBER}</p>
            <p className="text-gray-400 text-[10px]">ยอด {total.toLocaleString()} บาท</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 text-center">
          <p className="text-gray-500 text-xs">ส่งสลิปมาที่</p>
          <p className="text-pink text-sm font-semibold">@miwvie_shop</p>
          <p className="text-gray-400 text-[10px] mt-0.5">เพื่อยืนยันการจอง</p>
        </div>
      </div>

      {/* Action buttons */}
      {showActions && (
      <div className="flex flex-col gap-3 mt-4">
        {/* Screenshot instruction */}
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(140,43,63,0.06)', border: '1px solid rgba(140,43,63,0.2)' }}>
          <Camera size={20} className="text-gold shrink-0 mt-0.5" />
          <div>
            <p className="text-gold font-semibold text-sm mb-0.5">แคปหน้าจอใบจองนี้</p>
            <p className="text-gray-500 text-xs leading-relaxed">ส่งรูปพร้อมสลิปการโอนเงินมาที่ IG เพื่อยืนยันการจอง</p>
          </div>
        </div>
        <Button onClick={openIGDM} variant="primary" fullWidth>
          <ExternalLink size={16} />
          ส่งสลิปทาง IG @miwvie_shop
        </Button>
      </div>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  highlight,
  accent,
}: {
  label: string
  value: string
  highlight?: boolean
  accent?: 'emerald'
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className={`shrink-0 text-sm ${accent === 'emerald' ? 'text-emerald-500' : 'text-gray-500'}`}>{label}</span>
      <span className={`text-right text-sm ${accent === 'emerald' ? 'text-emerald-500 font-semibold' : highlight ? 'text-gray-800 font-semibold' : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  )
}

function AddressRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-700 whitespace-pre-wrap break-words">{value}</span>
    </div>
  )
}
