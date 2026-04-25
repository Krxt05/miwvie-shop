'use client'
import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Download, Copy, ExternalLink, Check } from 'lucide-react'
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
  const [copied, setCopied] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)

  const camera = CAMERAS.find((c) => c.id === form.cameraId)!
  const price = calcPrice(camera.priceGroup, form.durationHours)
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

  const summaryText = `📸 ใบจองกล้อง MIWVIE SHOP
🔖 Booking ID: ${bookingId}
📷 ${camera.name}
📅 รับ: ${format(form.pickupDatetime, 'd MMM yyyy HH:mm', { locale: th })} น.
📅 คืน: ${format(form.returnDatetime, 'd MMM yyyy HH:mm', { locale: th })} น.
💰 ยอดชำระ: ${total.toLocaleString()} บาท
👤 ${form.customerName}
📞 ${form.customerPhone}
💳 PromptPay: ${PROMPTPAY}`

  async function handleCopy() {
    await navigator.clipboard.writeText(summaryText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDownload() {
    if (!receiptRef.current) return
    const html2canvas = (await import('html2canvas')).default
    const el = receiptRef.current
    const prev = el.style.cssText
    el.style.cssText += ';background:#120818 !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;'
    const canvas = await html2canvas(el, {
      background: '#120818',
      scale: 2,
      useCORS: true,
      logging: false,
    } as Parameters<typeof html2canvas>[1])
    el.style.cssText = prev
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `miwvie-receipt-${bookingId}.png`
    a.click()
  }

  function openIGDM() {
    window.open('https://www.instagram.com/miwvie_shop/', '_blank')
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Receipt card */}
      <div
        ref={receiptRef}
        className="glass-pink rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(160deg,#1a0a20 0%,#0f0818 100%)' }}
      >
        {/* Header — logo + title */}
        <div className="flex flex-col items-center pt-5 pb-4 px-6 border-b border-dashed border-gold/20">
          <div className="p-[3px] rounded-full mb-2 drop-shadow-lg" style={{ background: 'linear-gradient(135deg, #d4a227, #f0d060, #c9a020, #d4a227)' }}>
            <Image
              src="/logo.png"
              alt="MIWVIE SHOP"
              width={72}
              height={72}
              className="rounded-full block"
            />
          </div>
          <p className="text-gold/70 text-[10px] uppercase tracking-[0.2em]">MIWVIE SHOP</p>
          <h2 className="text-gradient font-display text-xl font-bold leading-tight">ใบจองกล้อง</h2>
          <p className="text-white/40 text-xs mt-0.5">{bookingId}</p>
        </div>

        {/* Booking details */}
        <div className="px-6 py-4 space-y-2 text-sm border-b border-dashed border-gold/20">
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
        <div className="px-6 py-3 border-b border-dashed border-gold/20">
          {deliveryFee > 0 && (
            <Row label="ค่าเช่า" value={`${price.toLocaleString()} ฿`} />
          )}
          {deliveryFee > 0 && (
            <Row label="ค่าจัดส่ง" value={`+${deliveryFee} ฿`} />
          )}
          <div className="flex justify-between items-baseline mt-1">
            <span className="text-white font-bold text-sm">ยอดชำระ</span>
            <span className="text-pink font-bold text-2xl">{total.toLocaleString()} ฿</span>
          </div>
        </div>

        {/* QR Code — compact horizontal layout */}
        {qrDataUrl && (
          <div className="px-6 py-4 flex items-center gap-4 border-b border-dashed border-gold/20">
            <div className="bg-white rounded-xl p-2 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="PromptPay QR" className="w-24 h-24" />
            </div>
            <div className="space-y-1">
              <p className="text-white/50 text-[11px]">สแกนจ่ายผ่าน</p>
              <p className="text-white font-bold text-sm">PromptPay</p>
              <p className="text-pink text-sm font-semibold">{PROMPTPAY}</p>
              <p className="text-white/40 text-[10px]">ยอด {total.toLocaleString()} บาท</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 text-center">
          <p className="text-white/50 text-xs">ส่งสลิปมาที่</p>
          <p className="text-pink text-sm font-semibold">@miwvie_shop</p>
          <p className="text-white/30 text-[10px] mt-0.5">เพื่อยืนยันการจอง</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 mt-4">
        <Button onClick={handleDownload} variant="primary" fullWidth>
          <Download size={16} />
          บันทึกใบจอง
        </Button>
        <Button onClick={handleCopy} variant="outline" fullWidth>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'คัดลอกแล้ว!' : 'คัดลอกข้อความ'}
        </Button>
        <Button onClick={openIGDM} variant="ghost" fullWidth>
          <ExternalLink size={16} />
          ส่งสลิปทาง IG DM
        </Button>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-white/50 shrink-0 text-sm">{label}</span>
      <span className={`text-right text-sm ${highlight ? 'text-white font-semibold' : 'text-white/90'}`}>
        {value}
      </span>
    </div>
  )
}
