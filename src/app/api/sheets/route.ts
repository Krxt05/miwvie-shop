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

    // Strip large base64 images to avoid Vercel 4.5MB body limit
    // Images are requested separately via IG DM
    const { idCardImage: _id, igProfileImage: _ig, ...safeBody } = body

    const bodyStr = JSON.stringify(safeBody)

    // Google Apps Script redirects POST → follow redirect manually
    // (default fetch changes POST to GET on 302, losing the body)
    let res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyStr,
      redirect: 'manual',
    })

    if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
      const location = res.headers.get('location')
      if (location) {
        res = await fetch(location, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr,
        })
      }
    }

    const text = await res.text()
    try {
      return NextResponse.json(JSON.parse(text))
    } catch {
      return NextResponse.json({ error: 'Bad response', raw: text.slice(0, 200) })
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Network error'
    return NextResponse.json({ error: msg })
  }
}
