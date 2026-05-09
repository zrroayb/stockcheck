'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function StockAdjustForm({
  productId,
  currentStock,
}: {
  productId: string
  currentStock: number
}) {
  const router = useRouter()
  const [delta, setDelta] = useState<number>(0)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (delta === 0) {
      setMessage({ kind: 'err', text: 'Delta must be non-zero' })
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/stock/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, delta, note: note || undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const text = body?.error
          ? body.error +
            (body.available !== undefined ? ` (available: ${body.available})` : '')
          : `Failed (${res.status})`
        throw new Error(text)
      }
      setMessage({ kind: 'ok', text: `Stock is now ${body.stockCount}` })
      setDelta(0)
      setNote('')
      router.refresh()
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <div className="text-sm text-gray-400">
        Current stock: <span className="font-medium text-gray-100">{currentStock}</span>. Use a
        positive number to add, negative to remove.
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="btn-secondary" onClick={() => setDelta((d) => d - 1)}>
          −1
        </button>
        <input
          className="input text-center tabular-nums"
          type="number"
          value={delta}
          onChange={(e) => setDelta(Number(e.target.value))}
        />
        <button type="button" className="btn-secondary" onClick={() => setDelta((d) => d + 1)}>
          +1
        </button>
      </div>
      <div>
        <label className="label">Note (optional)</label>
        <input
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. recount after stocktake"
        />
      </div>
      {message ? (
        <div className={`text-sm ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-400'}`}>
          {message.text}
        </div>
      ) : null}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={submitting || delta === 0}>
          {submitting ? 'Applying…' : delta >= 0 ? `Add ${delta}` : `Remove ${Math.abs(delta)}`}
        </button>
      </div>
    </form>
  )
}
