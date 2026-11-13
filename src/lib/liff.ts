'use client'
// LINE LIFF for the booking page (adapted from HAICHAO). The SDK loads only when
// the page was opened from LINE; ordinary browser visitors never see it.
// Kept in the browser: the LINE display name, to prefill the contact field.
// The LINE userId is never trusted from here — /api/line/link asks LINE itself.
import { useEffect, useSyncExternalStore } from 'react'

interface LiffSdk {
  init: (c: { liffId: string; withLoginOnExternalBrowser?: boolean }) => Promise<void>
  isLoggedIn: () => boolean
  getAccessToken: () => string | null
  getIDToken: () => string | null
  getDecodedIDToken: () => { exp?: number } | null
  getProfile: () => Promise<{ displayName: string }>
}
declare global {
  interface Window { liff?: LiffSdk }
}

export const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? ''
// Basic ID of the shop OA, for the add-friend link
export const LINE_OA_ID = process.env.NEXT_PUBLIC_LINE_OA_ID || '@005vsebr'
export const addFriendUrl = `https://line.me/R/ti/p/${encodeURIComponent(LINE_OA_ID)}`

const SDK = 'https://static.line-scdn.net/liff/edge/2/sdk.js'
const EVENT = 'miwvie:liff'
const PROFILE_KEY = 'miwvie:liff'
const CONTEXT_KEY = 'miwvie:liff-context'

/** Opened inside LINE, or redirected by a LIFF URL, or LIFF already ran in this tab. */
export function inLineContext(): boolean {
  if (typeof window === 'undefined' || !LIFF_ID) return false
  try {
    if (sessionStorage.getItem(CONTEXT_KEY) || sessionStorage.getItem(PROFILE_KEY)) return true
  } catch { /* private mode */ }
  return /\bLine\//i.test(navigator.userAgent) || /[?&]liff\.(state|referrer)=/.test(location.search)
}

let sdk: Promise<LiffSdk | null> | null = null
function loadSdk(): Promise<LiffSdk | null> {
  if (window.liff) return Promise.resolve(window.liff)
  sdk ??= new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = SDK
    s.async = true
    s.onload = () => resolve(window.liff ?? null)
    s.onerror = () => { sdk = null; resolve(null) }
    document.head.appendChild(s)
  })
  return sdk
}

let ready: Promise<LiffSdk | null> | null = null
/** Inside LINE, login is required (LINE's own browser too, not only the LIFF view). */
export function initLiff(): Promise<LiffSdk | null> {
  ready ??= (async () => {
    if (!LIFF_ID) return null
    const liff = await loadSdk()
    if (!liff) return null
    try {
      // Survive the OAuth round trip, which drops the LINE user agent hints
      try { sessionStorage.setItem(CONTEXT_KEY, '1') } catch { /* private mode */ }
      await liff.init({ liffId: LIFF_ID, withLoginOnExternalBrowser: true })
      if (!liff.isLoggedIn()) return null
      const p = await liff.getProfile()
      try {
        sessionStorage.setItem(PROFILE_KEY, JSON.stringify({ name: String(p.displayName ?? '').slice(0, 100) }))
      } catch { /* not remembered */ }
      window.dispatchEvent(new Event(EVENT))
      return liff
    } catch {
      ready = null
      return null
    }
  })()
  return ready
}

/** LINE display name when the page runs from LINE, else null. */
export function useLiffProfile(): { name: string } | null {
  useEffect(() => {
    if (inLineContext()) void initLiff()
  }, [])
  const raw = useSyncExternalStore(
    (cb) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb) },
    () => { try { return sessionStorage.getItem(PROFILE_KEY) ?? '' } catch { return '' } },
    () => '',
  )
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as { name?: unknown }
    return { name: typeof p.name === 'string' ? p.name : '' }
  } catch {
    return null
  }
}

export type LinkResult = { ok: true; sent: boolean; friend: boolean } | { ok: false }

/** Tie a new booking to the customer's LINE. Never throws. */
export async function linkBookingToLine(bookingId: string, token: string): Promise<LinkResult> {
  try {
    if (!inLineContext()) return { ok: false }
    const liff = await initLiff()
    const accessToken = liff?.isLoggedIn() ? liff.getAccessToken() : null
    if (!liff || !accessToken) return { ok: false }
    const exp = liff.getDecodedIDToken()?.exp
    const idToken = exp && exp * 1000 > Date.now() + 30_000 ? liff.getIDToken() ?? '' : ''
    const res = await fetch('/api/line/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookingId, token, accessToken, idToken }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok) return { ok: false }
    const j = await res.json()
    return { ok: true, sent: j.sent === true, friend: j.friend === true }
  } catch {
    return { ok: false }
  }
}
