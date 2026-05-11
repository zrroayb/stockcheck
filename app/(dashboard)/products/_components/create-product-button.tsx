'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackagePlus, X } from 'lucide-react'

export function CreateProductButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const fd = new FormData(e.currentTarget)
    const payload = {
      masterSku: String(fd.get('masterSku') ?? '').trim(),
      name: String(fd.get('name') ?? '').trim(),
      barcode: String(fd.get('barcode') ?? '').trim() || undefined,
      stockCount: Number(fd.get('stockCount') ?? 0),
      reservedStock: Number(fd.get('reservedStock') ?? 0),
    }
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `Failed (${res.status})`)
      }
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary">
        <PackagePlus className="h-4 w-4" />
        SKU ekle
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-white/10 bg-bg-card p-6 shadow-2xl shadow-black/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">Operasyona SKU ekle</h2>
              <button type="button" className="btn-icon" onClick={() => setOpen(false)} title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input name="name" required className="input" placeholder="Black Hoodie L" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Master SKU</label>
                  <input name="masterSku" required className="input" placeholder="HOODIE-BLACK-L" />
                </div>
                <div>
                  <label className="label">Barcode</label>
                  <input name="barcode" className="input" placeholder="EAN/GTIN (optional)" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Initial stock</label>
                  <input name="stockCount" type="number" min={0} defaultValue={0} className="input" />
                </div>
                <div>
                  <label className="label">Reserved</label>
                  <input name="reservedStock" type="number" min={0} defaultValue={0} className="input" />
                </div>
              </div>

              {error ? <div className="text-sm text-red-400">{error}</div> : null}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Ekleniyor...' : 'SKU olustur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
