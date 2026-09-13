'use client'
import { useEffect, useState, Suspense, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Copy, Check, RefreshCw, Download } from 'lucide-react'

interface PromoPayload {
  slot: 'morning' | 'evening'
  caption: string
  windowLabel: string
  groupHint: string
  availabilityKnown: boolean
  freeCameras: { id: string; name: string; image: string }[]
}

function PromoInner() {
  const params = useSearchParams()
  const slot = params.get('slot') === 'evening' ? 'evening' : 'morning'

  const [promo, setPromo] = useState<PromoPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/promo?slot=${slot}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('โหลดแคปชั่นไม่สำเร็จ')
      setPromo(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดแคปชั่นไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [slot])

  useEffect(() => { load() }, [load])

  async function copyCaption() {
    if (!promo) return
    try {
      await navigator.clipboard.writeText(promo.caption)
    } catch {
      // Safari refuses the async clipboard API outside a few contexts; fall back
      // to a hidden textarea so the button still works on the shop's phone.
      const ta = document.createElement('textarea')
      ta.value = promo.caption
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <main className="min-h-screen bg-gradient-dark">
      <div className="relative z-10 max-w-lg mx-auto px-4 py-8">
        <header className="mb-5">
          <p className="text-xs text-gray-400 mb-1">MIWVIE SHOP</p>
          <h1 className="text-2xl font-bold">
            แคปชั่นโปรโมต{slot === 'morning' ? 'รอบเช้า' : 'รอบเย็น'}
          </h1>
          {promo && <p className="text-gray-400 text-sm mt-1">{promo.groupHint}</p>}
        </header>

        {loading && (
          <div className="flex items-center gap-3 py-16 justify-center text-gray-400 text-sm">
            <div className="w-6 h-6 border-2 border-pink/30 border-t-pink rounded-full animate-spin" />
            กำลังสร้างแคปชั่น…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-4 text-sm text-red-800">
            <strong className="block mb-1">{error}</strong>
            <button onClick={load} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-white text-xs font-semibold">
              <RefreshCw size={13} /> ลองใหม่
            </button>
          </div>
        )}

        {promo && !loading && (
          <>
            <button
              onClick={copyCaption}
              className={`w-full mb-3 rounded-xl px-4 py-3.5 font-bold text-white flex items-center justify-center gap-2 transition-colors ${
                copied ? 'bg-emerald-500' : 'bg-pink'
              }`}
            >
              {copied ? <><Check size={18} /> คัดลอกแล้ว!</> : <><Copy size={18} /> คัดลอกแคปชั่น</>}
            </button>

            <div className="glass rounded-xl p-4 mb-5">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                {promo.caption}
              </pre>
            </div>

            {!promo.availabilityKnown && (
              <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                อ่านคิวจากระบบไม่ได้ตอนนี้ แคปชั่นเลยไม่ได้ระบุชื่อกล้อง
                (ดีกว่าโฆษณากล้องที่อาจถูกจองไปแล้ว) — กดลองใหม่ได้
              </div>
            )}

            {promo.freeCameras.length > 0 && (
              <section>
                <h2 className="font-bold mb-1">รูปกล้องที่ว่าง{promo.windowLabel}</h2>
                <p className="text-gray-400 text-xs mb-3 flex items-center gap-1">
                  <Download size={12} /> กดค้างที่รูป → บันทึกลงเครื่อง แล้วแนบตอนโพสต์
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {promo.freeCameras.map((c) => (
                    <div key={c.id} className="glass rounded-xl p-3 text-center">
                      <Image
                        src={c.image}
                        alt={c.name}
                        width={160}
                        height={120}
                        className="object-contain h-24 w-auto mx-auto mb-2"
                      />
                      <p className="text-xs font-semibold">{c.name}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <button
              onClick={load}
              className="mt-6 w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-500 flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={14} /> สร้างแคปชั่นใหม่
            </button>
          </>
        )}
      </div>
    </main>
  )
}

export default function PromoPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-gradient-dark" />}>
      <PromoInner />
    </Suspense>
  )
}
