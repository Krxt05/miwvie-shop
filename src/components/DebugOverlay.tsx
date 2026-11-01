'use client'
// Hidden performance probe. Open any page with ?debug=1 to turn it on for this
// tab (it stays on while navigating), ?debug=0 to turn it off. Customers never
// see it. It shows where the screen froze, so a phone that stutters can be
// screenshotted and compared.
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

const KEY = 'miwvie_debug'
const STALL_MS = 50

type Entry = { t: number; kind: string; ms: number; where: string; after: string }

export default function DebugOverlay() {
  const pathname = usePathname()
  const [on, setOn] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [stats, setStats] = useState({ stalls: 0, worst: 0, frames: 0 })
  const [entry, setEntry] = useState('')
  const [live, setLive] = useState('')
  const lastAction = useRef('-')
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('debug')
    try {
      if (q === '1') sessionStorage.setItem(KEY, '1')
      if (q === '0') sessionStorage.removeItem(KEY)
      setOn(sessionStorage.getItem(KEY) === '1')
    } catch { setOn(q === '1') }
  }, [])

  // Remember how /book was entered (with or without ?camera=)
  useEffect(() => {
    if (on) setEntry(window.location.pathname + window.location.search.replace(/[?&]debug=\d/, ''))
  }, [on, pathname])

  useEffect(() => {
    if (!on) return
    const t0 = performance.now()
    const add = (e: Omit<Entry, 't' | 'where' | 'after'>) =>
      setEntries((list) => [{ ...e, t: Math.round((performance.now() - t0) / 100) / 10, where: pathRef.current + (window.location.search.includes('camera') ? '?camera' : ''), after: lastAction.current }, ...list].slice(0, 12))

    // 1) frames the screen could not draw on time
    let last = 0, raf = 0, frames = 0
    const tick = (now: number) => {
      if (last) {
        frames++
        const gap = now - last
        if (gap > STALL_MS && document.visibilityState === 'visible') {
          add({ kind: 'จอค้าง', ms: Math.round(gap) })
          setStats((s) => ({ stalls: s.stalls + 1, worst: Math.max(s.worst, Math.round(gap)), frames }))
        }
      }
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    // 2) tap → next painted frame (how long a tap feels "stuck")
    const onDown = (ev: PointerEvent) => {
      const el = (ev.target as HTMLElement)?.closest('a,button,input,label') as HTMLElement | null
      const label = (el?.textContent || el?.getAttribute('aria-label') || el?.tagName || '?').trim().replace(/\s+/g, ' ').slice(0, 22)
      lastAction.current = 'แตะ ' + label
      const start = performance.now()
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const ms = Math.round(performance.now() - start)
        if (ms > 80) add({ kind: 'แตะแล้วค้าง', ms })
      }))
    }
    window.addEventListener('pointerdown', onDown, { capture: true, passive: true })

    // 3) long tasks / event timing where the browser supports them
    const observers: PerformanceObserver[] = []
    for (const type of ['longtask', 'event']) {
      try {
        const po = new PerformanceObserver((list) => list.getEntries().forEach((e) => {
          if (type === 'event' && e.duration < 100) return
          add({ kind: type === 'longtask' ? 'โค้ดทำงานนาน' : 'ตอบสนองช้า:' + e.name, ms: Math.round(e.duration) })
        }))
        po.observe({ type, buffered: false } as PerformanceObserverInit)
        observers.push(po)
      } catch { /* not supported in this browser */ }
    }

    // 4) every second: how many DOM changes happened, and which animations are
    // running right now — a page redrawing itself in a loop, or an animation
    // that never stops, shows up here even when nobody is touching the screen.
    let mutations = 0
    const mo = new MutationObserver((list) => {
      for (const m of list) if (!(m.target as Element).closest?.('[data-debug-overlay]')) mutations++
    })
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true })
    const iv = setInterval(() => {
      const anims = (document.getAnimations?.() ?? []).filter((a) => a.playState === 'running')
      const names = anims.slice(0, 4).map((a) => {
        const el = (a.effect as KeyframeEffect | null)?.target as Element | null
        const name = (a as CSSAnimation).animationName || (a as CSSTransition).transitionProperty || 'js'
        const cls = el && typeof el.className === 'string' ? el.className.split(' ').slice(0, 2).join('.') : el?.tagName
        return `${name}@${cls ?? '?'}`
      })
      setLive(`แก้หน้า ${mutations}/วิ · animation ${anims.length}${names.length ? ': ' + names.join(', ') : ''}`)
      mutations = 0
    }, 1000)

    return () => {
      clearInterval(iv)
      mo.disconnect()
      cancelAnimationFrame(raf)
      window.removeEventListener('pointerdown', onDown, { capture: true })
      observers.forEach((o) => o.disconnect())
    }
  }, [on])

  if (!on) return null
  return (
    <div
      data-debug-overlay
      style={{ position: 'fixed', left: 6, right: 6, bottom: 6, zIndex: 9999, pointerEvents: 'none' }}
      className="rounded-lg bg-black/80 text-[10px] leading-tight text-white font-mono p-2"
    >
      <div className="flex justify-between">
        <span>เข้ามาจาก: {entry || '-'}</span>
        <span>ค้าง {stats.stalls} ครั้ง · แย่สุด {stats.worst}ms</span>
      </div>
      <div className="text-cyan-200">{live}</div>
      {entries.map((e, i) => (
        <div key={i} className={e.ms > 150 ? 'text-red-300' : e.ms > 80 ? 'text-yellow-200' : ''}>
          {e.t}s {e.kind} {e.ms}ms · {e.where} · หลัง{e.after}
        </div>
      ))}
    </div>
  )
}
