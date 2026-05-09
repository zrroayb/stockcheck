'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
    if (!confirm(`Disconnect ${props.name}? Stored credentials will be deleted.`)) return
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
      <div className="card flex flex-col">
        <div className={`mb-4 h-12 w-12 rounded-lg bg-gradient-to-br ${props.colorGradient}`} />
        <div className="mb-1 flex items-center justify-between">
          <div className="text-lg font-semibold">{props.name}</div>
          {props.connected ? (
            <span className="badge-ok">connected</span>
          ) : (
            <span className="badge-muted">not connected</span>
          )}
        </div>
        {props.connected && props.connectedAt ? (
          <div className="text-xs text-gray-500">Updated {props.connectedAt}</div>
        ) : (
          <div className="text-xs text-gray-500">Sync stock + receive orders.</div>
        )}
        <div className="mt-4 flex gap-2">
          <button onClick={() => setOpen(true)} className="btn-primary flex-1">
            {props.connected ? 'Update credentials' : 'Connect'}
          </button>
          {props.connected ? (
            <button onClick={onDisconnect} className="btn-danger" disabled={submitting}>
              Disconnect
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
            className="w-full max-w-md rounded-xl border border-border bg-bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold">Connect {props.name}</h2>
            <form onSubmit={onSave} className="space-y-4">
              {props.fields.map((f) => (
                <div key={f.name}>
                  <label className="label">{f.label}</label>
                  <input
                    name={f.name}
                    type={f.type}
                    required={f.required}
                    placeholder={f.placeholder}
                    className="input"
                  />
                </div>
              ))}

              {error ? <div className="text-sm text-red-400">{error}</div> : null}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
