import { NextRequest, NextResponse } from 'next/server'

const SCRIPT_URL = process.env.SCRIPT_URL ?? ''

const isConfigured = SCRIPT_URL && !SCRIPT_URL.includes('PLACEHOLDER')

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
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ error: 'Network error' })
  }
}
