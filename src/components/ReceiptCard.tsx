'use client'
import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Download, Copy, ExternalLink, Check } from 'lucide-react'
import { BookingFormData } from '@/types'
import { CAMERAS, PRICE_TABLES, calcPrice, calcDeliveryFee } from '@/lib/cameras'
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
        width: 200,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
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
👤 ${form.customerName} / @${form.customerIG}`

  async function handleCopy() {
    await navigator.clipboard.writeText(summaryText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDownload() {
    if (!receiptRef.current) return
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(receiptRef.current, {
      background: '#1a0020',
      scale: 2,
    } as Parameters<typeof html2canvas>[1])
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
      {/* Receipt card (screenshot target) */}
      <div
        ref={receiptRef}
        className="glass-pink rounded-2xl p-6 space-y-4"
      >
        {/* Header */}
        <div className="text-center">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-1">MIWVIE SHOP</p>
          <h2 className="text-gradient font-display text-2xl font-bold">ใบจองกล้อง</h2>
          <p className="text-xs text-white/40 mt-1">{bookingId}</p>
        </div>

        <div className="border-t border-dashed border-white/10 pt-4 space-y-2 text-sm">
          <Row label="กล้อง" value={camera.name} />
          <Row
            label="รับ"
            value={format(form.pickupDatetime, 'd MMM yyyy HH:mm', { locale: th }) + ' น.'}
          />
          <Row
            label="คืน"
            value={format(form.returnDatetime, 'd MMM yyyy HH:mm', { locale: th }) + ' น.'}
          />
          <Row
            label="รับเครื่อง"
            value={form.pickupType === 'self' ? 'รับเอง (ฟรี)' : `Delivery +15฿ → ${form.pickupAddress}`}
          />
          <Row
            label="คืนเครื่อง"
            value={form.returnType === 'self' ? 'คืนเอง (ฟรี)' : `Delivery +15฿`}
          />
        </div>

        <div className="border-t border-dashed border-white/10 pt-4 space-y-1 text-sm">
          <Row label="ค่าเช่า" value={`${price.toLocaleString()} ฿`} />
          {deliveryFee > 0 && <Row label="ค่าจัดส่ง" value={`+${deliveryFee} ฿`} />}
          <div className="flex justify-between font-bold text-base text-pink pt-1 border-t border-white/10">
            <span>ยอดชำระ</span>
            <span>{total.toLocaleString()} ฿</span>
          </div>
        </div>

        {/* QR Code */}
        {qrDataUrl && (
          <div className="flex flex-col items-center gap-2 pt-2">
            <p className="text-xs text-white/50">สแกนจ่ายผ่าน PromptPay</p>
            <div className="bg-white rounded-xl p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="PromptPay QR" className="w-36 h-36" />
            </div>
            <p className="text-xs text-white/40">☎ {PROMPTPAY}</p>
          </div>
        )}

        <div className="border-t border-dashed border-white/10 pt-3 text-center text-xs text-white/30">
          ส่งสลิปมาที่ @miwvie_shop เพื่อยืนยันการจอง
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-white/50 shrink-0">{label}</span>
      <span className="text-right text-white/90">{value}</span>
    </div>
  )
}
