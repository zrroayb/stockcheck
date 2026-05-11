'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Product = { id: string; name: string; masterSku: string }

export function CreateAlertRule({ products }: { products: Product[] }) {
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
      productId: String(fd.get('productId')),
      ruleType: String(fd.get('ruleType')),
      threshold: Number(fd.get('threshold')),
      action: String(fd.get('action')),
      enabled: true,
    }
    try {
      const res = await fetch('/api/alert-rules', {
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
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary" disabled={products.length === 0}>
        + Otomasyon kur
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold">Yeni stok otomasyonu</h2>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="label">Urun</label>
                <select name="productId" required className="input">
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {p.masterSku}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Kural</label>
                  <select name="ruleType" required className="input" defaultValue="low_stock">
                    <option value="low_stock">Dusuk stok</option>
                    <option value="out_of_stock">Stok bitti</option>
                    <option value="overstock">Fazla stok</option>
                  </select>
                </div>
                <div>
                  <label className="label">Esik</label>
                  <input name="threshold" type="number" min={0} defaultValue={5} className="input" />
                </div>
              </div>
              <div>
                <label className="label">Aksiyon</label>
                <select name="action" required className="input" defaultValue="notify_email">
                  <option value="notify_email">E-posta ile uyar</option>
                  <option value="pause_listings">Kanallarda 0 stok push et</option>
                </select>
              </div>

              {error ? <div className="text-sm text-red-400">{error}</div> : null}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Iptal
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Kuruluyor...' : 'Kural olustur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
