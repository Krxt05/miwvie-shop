'use client'
import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { ExternalLink, Camera } from 'lucide-react'
import Image from 'next/image'
import { BookingFormData } from '@/types'
import { CAMERAS, calcPrice, calcDeliveryFee } from '@/lib/cameras'
import { generatePromptPayPayload } from '@/lib/promptpay'
import Button from './ui/Button'

interface Props {
  bookingId: string
  form: BookingFormData
}

const PROMPTPAY = '0820409263'

export default function ReceiptCard({ bookingId, form }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const receiptRef = useRef<HTMLDivElement>(null)

  const camera = CAMERAS.find((c) => c.id === form.cameraId)!
  const basePrice = calcPrice(camera.priceGroup, form.durationHours)
  const discountAmount = form.discountAmount ?? 0
  const price = basePrice - discountAmount
  const deliveryFee = calcDeliveryFee(form.pickupType, form.returnType)
  const total = price + deliveryFee

  useEffect(() => {
    async function genQR() {
      const QRCode = (await import('qrcode')).default
      const payload = generatePromptPayPayload(PROMPTPAY, total)
      const url = await QRCode.toDataURL(payload, {
        width: 160,
        margin: 1,
        color: { dark: '#1a0818', light: '#ffffff' },
      })
      setQrDataUrl(url)
    }
    genQR()
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
          <div className="p-[3px] rounded-full mb-2 drop-shadow-lg" style={{ background: 'linear-gradient(135deg, #D63384, #FF69B4, #FFB6C1, #D63384)' }}>
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
          <Row label="กล้อง" value={camera.name} highlight />
          <Row
            label="รับ"
            value={format(form.pickupDatetime, 'd MMM yy HH:mm', { locale: th }) + ' น.'}
          />
          <Row
            label="คืน"
            value={format(form.returnDatetime, 'd MMM yy HH:mm', { locale: th }) + ' น.'}
          />
          <Row
            label="รับ/คืน"
            value={`${form.pickupType === 'self' ? 'รับเอง' : 'Delivery'} / ${form.returnType === 'self' ? 'คืนเอง' : 'Delivery'}`}
          />
          <Row label="ชื่อ" value={form.customerName} />
        </div>

        {/* Amount */}
        <div className="px-6 py-3 border-b border-dashed border-pink-200">
          {(deliveryFee > 0 || discountAmount > 0) && (
            <Row label="ค่าเช่า" value={`${basePrice.toLocaleString()} ฿`} />
          )}
          {discountAmount > 0 && (
            <Row label={`ส่วนลด 10% (${form.discountCode})`} value={`-${discountAmount.toLocaleString()} ฿`} highlight accent="emerald" />
          )}
          {deliveryFee > 0 && (
            <Row label="ค่าจัดส่ง" value={`+${deliveryFee} ฿`} />
          )}
          <div className="flex justify-between items-baseline mt-1">
            <span className="text-gray-800 font-bold text-sm">ยอดชำระ</span>
            <span className="text-gold font-bold text-2xl">{total.toLocaleString()} ฿</span>
          </div>
        </div>

        {/* QR Code — compact horizontal layout */}
        {qrDataUrl && (
          <div className="px-6 py-4 flex items-center gap-4 border-b border-dashed border-pink-200">
            <div className="bg-white rounded-xl p-2 shrink-0 border border-pink-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="PromptPay QR" className="w-24 h-24" />
            </div>
            <div className="space-y-1">
              <p className="text-gray-500 text-[11px]">สแกนจ่ายผ่าน</p>
              <p className="text-gray-800 font-bold text-sm">PromptPay</p>
              <p className="text-pink text-sm font-semibold">{PROMPTPAY}</p>
              <p className="text-gray-400 text-[10px]">ยอด {total.toLocaleString()} บาท</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 text-center">
          <p className="text-gray-500 text-xs">ส่งสลิปมาที่</p>
          <p className="text-pink text-sm font-semibold">@miwvie_shop</p>
          <p className="text-gray-400 text-[10px] mt-0.5">เพื่อยืนยันการจอง</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 mt-4">
        {/* Screenshot instruction */}
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'rgba(214,51,132,0.06)', border: '1px solid rgba(214,51,132,0.2)' }}>
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
