import { NextRequest, NextResponse } from 'next/server'

const SCRIPT_URL = process.env.SCRIPT_URL ?? ''

const isConfigured = Boolean(SCRIPT_URL && !SCRIPT_URL.includes('PLACEHOLDER'))

export async function GET(request: NextRequest) {
  if (!isConfigured) return NextResponse.json({ slots: [], cameras: {}, booking: null })
  try {
    const { searchParams } = new URL(request.url)
    const url = new URL(SCRIPT_URL)
    searchParams.forEach((v, k) => url.searchParams.set(k, v))
    const res = await fetch(url.toString(), { cache: 'no-store' })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ slots: [], cameras: {}, booking: null })
  }
}

export async function POST(request: NextRequest) {
  if (!isConfigured) return NextResponse.json({ error: 'SCRIPT_URL not configured' })
  try {
    const body = await request.json()

    // Images are compressed client-side to ~200KB before sending
    // Apps Script: POST /exec runs the script, then 302 → GET result URL
    // Default fetch follows redirect (POST→GET), which is correct here
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    try {
      return NextResponse.json(JSON.parse(text))
    } catch {
      return NextResponse.json({ error: 'Bad response', raw: text.slice(0, 300) })
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error'
    return NextResponse.json({ error: msg })
  }
}
