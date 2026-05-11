'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, PlugZap, RadioTower, Trash2, X } from 'lucide-react'

type Field = { name: string; label: string; type: 'text' | 'password'; required?: boolean; placeholder?: string }

export function IntegrationCard(props: {
  platform: 'trendyol' | 'shopify' | 'hepsiburada'
  name: string
  colorGradient: string
  fields: Field[]
  connected: boolean
  connectedAt: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const fd = new FormData(e.currentTarget)
    const data: Record<string, string> = {}
    for (const f of props.fields) {
      const v = String(fd.get(f.name) ?? '').trim()
      if (v) data[f.name] = v
    }
    try {
      const res = await fetch('/api/platform-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: props.platform, data }),
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

  async function onDisconnect() {
    if (!confirm(`${props.name} baglantisi silinsin mi? Kayitli kimlik bilgileri silinir.`)) return
    setSubmitting(true)
    try {
      await fetch('/api/platform-credentials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: props.platform }),
      })
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="card flex min-h-64 flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div className={`flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br ${props.colorGradient}`}>
            <RadioTower className="h-5 w-5 text-white" />
          </div>
          {props.connected ? (
            <span className="badge-ok gap-1.5">
              <CheckCircle2 className="h-3 w-3" />
              bagli
            </span>
          ) : (
            <span className="badge-muted">bagli degil</span>
          )}
        </div>
        <div className="mb-1 flex items-center justify-between">
          <div className="text-lg font-semibold">{props.name}</div>
        </div>
        {props.connected && props.connectedAt ? (
          <div className="text-xs text-gray-500">Guncellendi {props.connectedAt}</div>
        ) : (
          <div className="text-xs text-gray-500">Stok sync ve siparis akisi.</div>
        )}
        <div className="mt-4">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: props.connected ? '100%' : '34%' }} />
          </div>
        </div>
        <div className="mt-auto flex gap-2 pt-5">
          <button onClick={() => setOpen(true)} className="btn-primary flex-1">
            <PlugZap className="h-4 w-4" />
            {props.connected ? 'Bilgileri guncelle' : 'Kanali bagla'}
          </button>
          {props.connected ? (
            <button onClick={onDisconnect} className="btn-danger" disabled={submitting} title="Disconnect">
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-white/10 bg-bg-card p-6 shadow-2xl shadow-black/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold">{props.name} kanalini bagla</h2>
              <button type="button" className="btn-icon" onClick={() => setOpen(false)} title="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-xs text-gray-500">
              Test için <strong>tek bir alana</strong> <code className="rounded bg-bg-subtle px-1">MOCK</code> yaz.
              gerçek API yerine 30 sahte ürünle çalışır.
            </p>
            <form onSubmit={onSave} className="space-y-4">
              {props.fields.map((f, idx) => (
                <div key={f.name}>
                  <label className="label">{f.label}</label>
                  <input
                    name={f.name}
                    type={f.type}
                    required={f.required}
                    placeholder={idx === 0 ? `${f.placeholder ?? ''} ya da MOCK` : f.placeholder}
                    className="input"
                  />
                </div>
              ))}

              {error ? <div className="text-sm text-red-400">{error}</div> : null}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="mr-auto text-xs text-gray-400 hover:text-gray-100"
                  onClick={(e) => {
                    e.preventDefault()
                    const form = (e.target as HTMLElement).closest('form')
                    if (!form) return
                    const first = form.querySelector('input') as HTMLInputElement | null
                    if (first) first.value = 'MOCK'
                  }}
                >
                  MOCK ile doldur
                </button>
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Iptal
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
