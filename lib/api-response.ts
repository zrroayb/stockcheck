import { NextResponse } from 'next/server'

/**
 * Central 500 response: logs full error server-side; in development returns
 * `err.message` in JSON so UI / Network tab debugging is painless. Production
 * always returns generic "Internal error" to avoid leaking internals.
 */
export function internalApiError(routeLabel: string, err: unknown): NextResponse {
  console.error(routeLabel, err)
  const expose = process.env.NODE_ENV === 'development' && err instanceof Error
  return NextResponse.json({ error: expose ? err.message : 'Internal error' }, { status: 500 })
}
