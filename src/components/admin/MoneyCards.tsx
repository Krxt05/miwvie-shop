'use client'
// Expenses, profit, ROI and the daily chart for the admin "รายได้" tab.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { Booking, CameraId } from '@/types'
import { Expense, ExpenseCategory, addExpense, deleteExpense, listExpenses } from '@/lib/api'
import { CAMERAS, MARKET_VALUE_AS_OF } from '@/lib/cameras'
import { bangkokDay, dayLabel } from '@/lib/admin'
import { EXPENSE_LABEL, Period, RoiRow, assetReturn, baht, dailyNet, periodLabel, profit, roi } from '@/lib/revenue'

// ---------- data ----------

// Kept across tab switches so coming back to รายได้ doesn't refetch every time
let cache: Expense[] | null = null

export function useExpenses(pin: string) {
  const [expenses, setExpenses] = useState<Expense[] | null>(cache)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const list = await listExpenses(pin)
      cache = list
      setExpenses(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดรายจ่ายไม่สำเร็จ')
    }
  }, [pin])

  useEffect(() => { reload() }, [reload])

  const add = useCallback(async (e: Omit<Expense, 'id'>, requestKey: string) => {
    const res = await addExpense(pin, e, requestKey)
    if (res.error || !res.id) throw new Error(res.error || 'บันทึกไม่สำเร็จ')
    const next = [...(cache ?? []), { ...e, id: res.id }]
    cache = next
    setExpenses(next)
  }, [pin])

  const remove = useCallback(async (id: string) => {
    const res = await deleteExpense(id, pin)
    if (res.error && res.error !== 'Not found') throw new Error(res.error)
    const next = (cache ?? []).filter((x) => x.id !== id)
    cache = next
    setExpenses(next)
  }, [pin])

  return { expenses, error, reload, add, remove }
}

// ---------- daily chart ----------

export function DailyChart({ bookings, month }: { bookings: Booking[]; month: string }) {
  const days = useMemo(() => dailyNet(bookings, month), [bookings, month])
  const today = bangkokDay(Date.now())
  const [picked, setPicked] = useState<string | null>(null)
  const max = Math.max(1, ...days.map((d) => d.net))
  const total = days.reduce((s, d) => s + d.net, 0)
  const active = days.filter((d) => d.day <= today && d.net > 0).length
  const shown = days.find((d) => d.day === picked) ?? days.find((d) => d.day === today) ?? null
  const tick = (i: number) => i === 0 || (i + 1) % 5 === 0 || i === days.length - 1

  if (total === 0) return null
  return (
    <section className="glass rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3 gap-2">
        <h3 className="font-bold text-sm">ค่าเช่ารายวัน</h3>
        <p className="text-xs text-gray-600 whitespace-nowrap">
          {shown ? (
            <>{dayLabel(`${shown.day}T12:00:00+07:00`)}: <b className="text-ink">{baht(shown.net)}</b> · {shown.count} ครั้ง</>
          ) : (
            <>มีรายได้ {active} วัน</>
          )}
        </p>
      </div>
      <ul className="flex items-end gap-[2px] h-28 border-b border-gray-300" aria-label="ค่าเช่าสุทธิรายวัน ตามวันรับกล้อง">
        {days.map((d) => {
          const future = d.day > today
          const isShown = shown?.day === d.day
          return (
            <li key={d.day} className="flex-1 h-full">
              <button
                onClick={() => setPicked(d.day)}
                aria-label={`${dayLabel(`${d.day}T12:00:00+07:00`)} ${baht(d.net)} ${d.count} ครั้ง${future ? ' (จองล่วงหน้า)' : ''}`}
                aria-pressed={isShown}
                className="w-full h-full flex items-end"
              >
                <span
                  className={`w-full rounded-t-sm ${isShown ? 'bg-pink-700' : future ? 'bg-pink-200' : 'bg-pink-400'}`}
                  style={{ height: `${(d.net / max) * 100}%`, minHeight: d.net > 0 ? 2 : 0 }}
                />
              </button>
            </li>
          )
        })}
      </ul>
      <div className="flex gap-[2px] mt-1" aria-hidden>
        {days.map((d, i) => (
          <span key={d.day} className={`flex-1 text-center text-[10px] ${d.day === today ? 'text-ink font-semibold' : 'text-gray-600'}`}>
            {tick(i) ? Number(d.day.slice(8)) : ''}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-gray-600 mt-2 flex items-center gap-3">
        <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm bg-pink-400" />รับกล้องแล้ว</span>
        <span className="flex items-center gap-1"><i className="inline-block w-2.5 h-2.5 rounded-sm bg-pink-200" />จ่ายแล้ว รอรับ</span>
        <span className="ml-auto">เฉลี่ย {baht(total / days.length)}/วัน</span>
      </p>
    </section>
  )
}

// ---------- profit + expenses ----------

const CATEGORIES = Object.keys(EXPENSE_LABEL) as ExpenseCategory[]
const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

interface ProfitProps {
  bookings: Booking[]
  period: Period
  data: ReturnType<typeof useExpenses>
}

export function ProfitCard({ bookings, period, data }: ProfitProps) {
  const { expenses, error, add, remove } = data
  const p = useMemo(() => profit(bookings, expenses ?? [], period), [bookings, expenses, period])
  const [form, setForm] = useState(false)
  const [showList, setShowList] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const del = async (id: string) => {
    if (confirmId !== id) { setConfirmId(id); return }
    setBusyId(id)
    setMsg(null)
    try { await remove(id) } catch (e) { setMsg(e instanceof Error ? e.message : 'ลบไม่สำเร็จ') }
    setBusyId(null)
    setConfirmId(null)
  }

  return (
    <section className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="font-bold text-sm">กำไร · {periodLabel(period, 'short')}</h3>
        <button
          onClick={() => setForm(!form)}
          className="flex items-center gap-1 rounded-lg bg-pink text-white text-xs font-medium px-3 py-2 min-h-[36px]"
        >
          {form ? <X size={14} /> : <Plus size={14} />} {form ? 'ปิด' : 'เพิ่มรายจ่าย'}
        </button>
      </div>

      {form && <ExpenseForm period={period} onSave={add} onDone={() => { setForm(false); setShowList(true) }} />}

      {expenses === null && !error ? (
        <p className="text-sm text-gray-600 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> กำลังโหลดรายจ่าย…</p>
      ) : (
        <>
          <dl className="text-sm space-y-1.5">
            <Row label="รายได้ร้าน (ค่าเช่าสุทธิ + ค่าส่งในพื้นที่)" value={baht(p.income)} />
            <Row label="หัก ค่าใช้จ่าย" value={baht(-p.opex)} muted />
            <Row
              label={`กำไรจากการดำเนินงาน${p.margin !== null ? ` · ${p.margin}%` : ''}`}
              value={baht(p.operating)}
              strong
              rule
              tone={p.operating < 0 ? 'neg' : undefined}
            />
            {p.capex > 0 && (
              <>
                <Row label="หัก ซื้อกล้อง (เงินลงทุน)" value={baht(-p.capex)} muted />
                <Row label="เงินเหลือหลังซื้อกล้อง" value={baht(p.afterCapex)} strong rule tone={p.afterCapex < 0 ? 'neg' : undefined} />
              </>
            )}
          </dl>

          {p.items.length > 0 && (
            <div className="mt-3 pt-3 border-t border-pink-100">
              <button onClick={() => setShowList(!showList)} aria-expanded={showList} className="w-full text-left text-xs">
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-gray-600">
                  {p.byCat.map((c) => (
                    <span key={c.cat}>{EXPENSE_LABEL[c.cat].split(' (')[0]} <b className="text-ink">{baht(c.amount)}</b></span>
                  ))}
                </span>
                <span className="block text-pink font-medium mt-1">
                  {showList ? 'ซ่อนรายการ' : `ดูรายการ (${p.items.length})`}
                </span>
              </button>
              {showList && (
                <ul className="mt-2 divide-y divide-pink-100 rounded-lg border border-pink-100 bg-white/60 text-xs">
                  {p.items.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="flex-1 min-w-0">
                        <span className="text-ink">{EXPENSE_LABEL[e.category].split(' (')[0]}</span>
                        {e.cameraId && <span className="text-gray-600"> · {CAMERAS.find((c) => c.id === e.cameraId)?.shortName ?? e.cameraId}</span>}
                        <span className="block text-gray-600 truncate">
                          {dayLabel(`${e.date}T12:00:00+07:00`)}{e.note && ` · ${e.note}`}
                        </span>
                      </span>
                      <b className="text-ink whitespace-nowrap">{baht(e.amount)}</b>
                      <button
                        onClick={() => del(e.id)}
                        disabled={busyId === e.id}
                        aria-label={confirmId === e.id ? 'กดอีกครั้งเพื่อยืนยันลบ' : 'ลบรายจ่าย'}
                        className={`rounded-md min-w-[36px] min-h-[36px] flex items-center justify-center ${
                          confirmId === e.id ? 'bg-red-600 text-white px-2' : 'text-gray-500 hover:text-red-600'
                        }`}
                      >
                        {busyId === e.id ? <Loader2 size={14} className="animate-spin" /> : confirmId === e.id ? 'ลบ?' : <Trash2 size={14} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {p.items.length === 0 && !form && (
            <p className="text-xs text-gray-600 mt-3">ยังไม่มีรายจ่ายใน{periodLabel(period, 'short')} — กด &quot;เพิ่มรายจ่าย&quot; เมื่อซื้อของ/ซ่อม/ซื้อกล้อง</p>
          )}
        </>
      )}
      {(error || msg) && <p className="text-xs text-red-700 mt-2">{msg || error}</p>}
    </section>
  )
}

function ExpenseForm({ period, onSave, onDone }: {
  period: Period
  onSave: (e: Omit<Expense, 'id'>, key: string) => Promise<void>
  onDone: () => void
}) {
  const today = bangkokDay(Date.now())
  // Default to today when viewing this month, otherwise the 1st of the viewed month
  const inView = today.startsWith(period.key)
  const [date, setDate] = useState(inView ? today : period.kind === 'month' ? `${period.key}-01` : `${period.key}-01-01`)
  const [category, setCategory] = useState<ExpenseCategory>('gear')
  const [amount, setAmount] = useState('')
  const [cameraId, setCameraId] = useState<CameraId | ''>('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Same key for retries of the same entry, so a timeout + retry can't add it twice
  const key = useRef(newKey())
  const needsCamera = category === 'camera'

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const n = Number(amount)
    if (!(n > 0)) { setErr('ใส่จำนวนเงิน'); return }
    if (needsCamera && !cameraId) { setErr('เลือกรุ่นกล้องที่ซื้อ'); return }
    setSaving(true)
    setErr(null)
    try {
      await onSave({ date, category, amount: n, cameraId, note: note.trim() }, key.current)
      key.current = newKey()
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
    setSaving(false)
  }

  const field = 'w-full rounded-lg border border-pink-100 bg-white px-3 py-2 text-base md:text-sm'
  return (
    <form onSubmit={submit} className="mb-4 space-y-2 rounded-lg border border-pink-100 bg-pink-50/50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600 space-y-1">
          <span>วันที่จ่าย</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={field} required />
        </label>
        <label className="text-xs text-gray-600 space-y-1">
          <span>จำนวนเงิน (บาท)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={field}
            placeholder="0"
            required
          />
        </label>
      </div>
      <label className="block text-xs text-gray-600 space-y-1">
        <span>หมวด</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={field}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{EXPENSE_LABEL[c]}</option>)}
        </select>
      </label>
      {(needsCamera || category === 'repair') && (
        <label className="block text-xs text-gray-600 space-y-1">
          <span>รุ่นกล้อง{needsCamera ? '' : ' (ถ้าซ่อมเครื่องไหน ใช้คิด ROI)'}</span>
          <select value={cameraId} onChange={(e) => setCameraId(e.target.value as CameraId | '')} className={field}>
            <option value="">{needsCamera ? 'เลือกรุ่น' : 'ไม่ระบุ'}</option>
            {CAMERAS.map((c) => <option key={c.id} value={c.id}>{c.shortName}</option>)}
          </select>
        </label>
      )}
      <label className="block text-xs text-gray-600 space-y-1">
        <span>โน้ต (ไม่บังคับ)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={field} placeholder="เช่น เมม 32GB 2 อัน" />
      </label>
      {needsCamera && <p className="text-[11px] text-gray-600">ซื้อกล้องนับเป็นเงินลงทุน ไม่หักจากกำไรรายเดือน แต่ใช้คิดคืนทุน (ROI) — ซื้อหลายตัวรุ่นเดียวกันใส่ยอดรวมได้</p>}
      {err && <p className="text-xs text-red-700">{err}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg bg-pink text-white text-sm font-medium py-2.5 disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {saving && <Loader2 size={14} className="animate-spin" />} บันทึกรายจ่าย
      </button>
    </form>
  )
}

// ---------- ROI ----------

// How far below market a quick second-hand sale usually lands
const HAIRCUTS = [0, 10, 20, 30]
const HAIRCUT_KEY = 'miwvie_asset_haircut'

export function RoiCard({ bookings, data }: { bookings: Booking[]; data: ReturnType<typeof useExpenses> }) {
  const { expenses } = data
  const r = useMemo(() => roi(bookings, expenses ?? []), [bookings, expenses])
  const [haircut, setHaircut] = useState(20)
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(HAIRCUT_KEY))
      if (HAIRCUTS.includes(v)) setHaircut(v)
    } catch { /* private mode: keep default */ }
  }, [])
  const pickHaircut = (v: number) => {
    setHaircut(v)
    try { localStorage.setItem(HAIRCUT_KEY, String(v)) } catch { /* ignore */ }
  }
  const shopAsset = assetReturn(r.shop, haircut / 100)
  if (expenses === null) return null
  const withCost = r.rows.filter((x) => x.cost > 0)
  const missing = r.rows.filter((x) => x.cost === 0)

  return (
    <section className="glass rounded-xl p-4">
      <h3 className="font-bold text-sm mb-1">คืนทุน (ROI) · ตั้งแต่เปิดร้าน</h3>
      <p className="text-[11px] text-gray-600 mb-3">นับเฉพาะเงินที่ได้แล้ว (ลูกค้ารับกล้องไปแล้ว) เทียบกับค่าซื้อ + ค่าซ่อม</p>
      {withCost.length === 0 ? (
        <p className="text-sm text-gray-600">
          ยังไม่มีราคาซื้อกล้อง — กด &quot;เพิ่มรายจ่าย&quot; แล้วเลือกหมวด &quot;ซื้อกล้อง&quot; ใส่ราคาที่ซื้อแต่ละรุ่น (ใส่วันที่ซื้อจริง)
        </p>
      ) : (
        <>
          <RoiLine row={r.shop} bold />

          {r.shop.market > 0 && (
            <div className="mt-3 rounded-lg border border-pink-100 bg-white/60 p-3 text-sm space-y-1.5">
              <p className="font-semibold text-ink text-xs">มูลค่ากล้อง (asset)</p>
              <Row label={`ราคาตลาด ${MARKET_VALUE_AS_OF} · กล้องที่ใช้งานได้`} value={baht(r.shop.market)} />
              <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
                <span>เผื่อขายต่ำกว่าตลาด</span>
                <span className="flex gap-1" role="group" aria-label="เผื่อขายต่ำกว่าราคาตลาด">
                  {HAIRCUTS.map((v) => (
                    <button
                      key={v}
                      onClick={() => pickHaircut(v)}
                      aria-pressed={haircut === v}
                      className={`rounded-md px-2 min-h-[32px] min-w-[40px] font-medium ${
                        haircut === v ? 'bg-pink text-white' : 'bg-pink-50 text-ink'
                      }`}
                    >
                      {v === 0 ? '0' : `−${v}`}%
                    </button>
                  ))}
                </span>
              </div>
              <Row label="ถ้าขายได้จริงประมาณ" value={baht(shopAsset.sale)} strong />
              <Row
                label={`ผลตอบแทนรวม (รายได้ + มูลค่าขาย − ทุน)${shopAsset.pct !== null ? ` · ${shopAsset.pct > 0 ? '+' : ''}${shopAsset.pct}%` : ''}`}
                value={baht(shopAsset.total)}
                strong
                rule
                tone={shopAsset.total < 0 ? 'neg' : undefined}
              />
              <p className="text-[11px] text-gray-600">
                {shopAsset.total >= 0
                  ? 'ถ้าเลิกกิจการวันนี้แล้วขายกล้องทั้งหมด จะได้เงินคืนมากกว่าที่ลงไป'
                  : `ถ้าขายกล้องทั้งหมดวันนี้ ยังขาดทุนอีก ${baht(-shopAsset.total)}`}
                {' '}· กล้องเสีย 2 ตัวนับมูลค่าเป็น 0 · ราคาตลาดแก้ได้ใน src/lib/cameras.ts
              </p>
            </div>
          )}

          <ul className="space-y-3 mt-3 pt-3 border-t border-pink-100">
            {withCost.map((x) => <li key={x.id}><RoiLine row={x} haircut={haircut} /></li>)}
          </ul>
          {missing.length > 0 && (
            <p className="text-[11px] text-gray-600 mt-3">
              ยังไม่ใส่ราคาซื้อ: {missing.map((x) => x.name).join(', ')} — ROI ทั้งร้านจะดูดีเกินจริงจนกว่าจะใส่ครบ
            </p>
          )}
        </>
      )}
    </section>
  )
}

function RoiLine({ row, bold, haircut }: { row: RoiRow; bold?: boolean; haircut?: number }) {
  const asset = haircut !== undefined && row.market > 0 ? assetReturn(row, haircut / 100) : null
  const pct = Math.min(100, row.paybackPct ?? 0)
  const done = (row.paybackPct ?? 0) >= 100
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
        <span className={`text-ink truncate min-w-0 ${bold ? 'font-bold text-sm' : 'font-medium'}`}>{row.name}</span>
        <span className={`whitespace-nowrap font-semibold ${(row.roiPct ?? 0) >= 0 ? 'text-emerald-700' : 'text-ink'}`}>
          ROI {row.roiPct === null ? '-' : `${row.roiPct > 0 ? '+' : ''}${row.roiPct}%`}
        </span>
      </div>
      <div
        className="h-2.5 rounded-full bg-pink-50 overflow-hidden"
        role="img"
        aria-label={`${row.name} คืนทุนแล้ว ${row.paybackPct ?? 0}%`}
      >
        <div className={`h-full rounded-full ${done ? 'bg-emerald-600' : 'bg-pink'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="flex justify-between gap-2 mt-1 text-[11px] text-gray-600">
        <span>ได้คืน {baht(row.earned)} / ลงทุน {baht(row.cost)} ({row.paybackPct ?? 0}%)</span>
        <span className="whitespace-nowrap">
          {done ? 'คืนทุนแล้ว ✓' : row.monthsLeft !== null ? `อีก ~${row.monthsLeft} เดือน` : 'ยังประเมินเวลาไม่ได้'}
        </span>
      </p>
      {asset && (
        <p className="flex justify-between gap-2 text-[11px] text-gray-600">
          <span>มูลค่าขาย ~{baht(asset.sale)} (ตลาด {baht(row.market)})</span>
          <span className={`whitespace-nowrap ${asset.total < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
            รวมมูลค่า {asset.total > 0 ? '+' : ''}{baht(asset.total)}
          </span>
        </p>
      )}
    </div>
  )
}

function Row({ label, value, strong, muted, rule, tone }: {
  label: string; value: string; strong?: boolean; muted?: boolean; rule?: boolean; tone?: 'neg'
}) {
  return (
    <div className={`flex justify-between gap-3 ${rule ? 'border-t border-pink-100 pt-1.5' : ''}`}>
      <dt className={muted ? 'text-gray-600' : strong ? 'text-ink font-semibold' : 'text-ink'}>{label}</dt>
      <dd className={`text-right whitespace-nowrap ${tone === 'neg' ? 'text-red-700 font-bold' : strong ? 'font-bold text-ink' : muted ? 'text-gray-600' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  )
}
