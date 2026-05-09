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
        + New rule
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
            <h2 className="mb-4 text-lg font-semibold">New alert rule</h2>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="label">Product</label>
                <select name="productId" required className="input">
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.masterSku}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Type</label>
                  <select name="ruleType" required className="input" defaultValue="low_stock">
                    <option value="low_stock">Low stock</option>
                    <option value="out_of_stock">Out of stock</option>
                    <option value="overstock">Overstock</option>
                  </select>
                </div>
                <div>
                  <label className="label">Threshold</label>
                  <input name="threshold" type="number" min={0} defaultValue={5} className="input" />
                </div>
              </div>
              <div>
                <label className="label">Action</label>
                <select name="action" required className="input" defaultValue="notify_email">
                  <option value="notify_email">Notify by email</option>
                  <option value="pause_listings">Pause listings (push 0 stock)</option>
                  <option value="notify_slack">Notify Slack (coming soon)</option>
                </select>
              </div>

              {error ? <div className="text-sm text-red-400">{error}</div> : null}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
