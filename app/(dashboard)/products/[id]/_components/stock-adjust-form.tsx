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
      setMessage({ kind: 'err', text: 'Degisim 0 olamaz' })
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
      setMessage({ kind: 'ok', text: `Yeni ana stok: ${body.stockCount}` })
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
        Ana stok: <span className="font-medium text-gray-100">{currentStock}</span>. Pozitif
        deger stok ekler, negatif deger stok dusurur.
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="btn-secondary" onClick={() => setDelta((d) => d - 1)}>
          -1
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
        <label className="label">Not (opsiyonel)</label>
        <input
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="or. sayim sonrasi duzeltme"
        />
      </div>
      {message ? (
        <div className={`text-sm ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-400'}`}>
          {message.text}
        </div>
      ) : null}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={submitting || delta === 0}>
          {submitting ? 'Uygulaniyor...' : delta >= 0 ? `${delta} ekle` : `${Math.abs(delta)} dus`}
        </button>
      </div>
    </form>
  )
}
