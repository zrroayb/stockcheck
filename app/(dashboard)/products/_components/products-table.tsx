'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, PauseCircle, RadioTower } from 'lucide-react'
import { cn, formatNumber, relativeTime } from '@/lib/utils'

export type ProductRow = {
  id: string
  name: string
  masterSku: string
  barcode: string | null
  stockCount: number
  reservedStock: number
  status: string
  updatedAt: string
  platformListings: Array<{ platform: string; syncStatus: string }>
}

type BulkAction =
  | { kind: 'set_stock'; value: number }
  | { kind: 'adjust_stock'; delta: number }
  | { kind: 'set_reserved'; value: number }
  | { kind: 'pause' }
  | { kind: 'resume' }

export function ProductsTable({ rows }: { rows: ProductRow[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const allSelected = rows.length > 0 && selected.size === rows.length
  const someSelected = selected.size > 0 && !allSelected

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runBulk(action: BulkAction) {
    if (selected.size === 0) return
    setBusy(true)
    setMessage(null)
    try {
      const body = { ...action, productIds: Array.from(selected), action: action.kind }
      const res = await fetch('/api/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`)
      setMessage({
        kind: data.failed > 0 ? 'err' : 'ok',
        text:
          data.failed > 0
            ? `${data.ok} başarılı, ${data.failed} başarısız${
                data.errors?.length ? ` - ilki: ${data.errors[0].error}` : ''
              }`
            : `${data.ok} ürün güncellendi`,
      })
      setSelected(new Set())
      router.refresh()
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {selected.size > 0 ? (
        <BulkToolbar
          count={selected.size}
          busy={busy}
          onClear={() => setSelected(new Set())}
          onRun={runBulk}
        />
      ) : null}

      {message ? (
        <div className={cn('text-sm', message.kind === 'ok' ? 'text-emerald-300' : 'text-red-400')}>
          {message.text}
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-amber-400"
                />
              </th>
              <th>Urun</th>
              <th>SKU</th>
              <th>Satisa hazirlik</th>
              <th className="text-right">Rezerve</th>
              <th>Kanallar</th>
              <th>Guncel</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const available = Math.max(0, p.stockCount - p.reservedStock)
              const isSelected = selected.has(p.id)
              return (
                <tr key={p.id} className={cn(isSelected && 'bg-amber-400/5')}>
                  <td>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(p.id)}
                      className="h-4 w-4 accent-amber-400"
                    />
                  </td>
                  <td>
                    <Link href={`/products/${p.id}`} className="font-medium text-gray-100 hover:text-white">
                      {p.name}
                    </Link>
                    {p.barcode ? <div className="text-xs text-gray-500">{p.barcode}</div> : null}
                  </td>
                  <td>
                    <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs text-gray-300">
                      {p.masterSku}
                    </code>
                  </td>
                  <td>
                    <StockSignal stock={p.stockCount} reserved={p.reservedStock} available={available} />
                  </td>
                  <td className="text-right tabular-nums text-gray-400">
                    {formatNumber(p.reservedStock)}
                  </td>
                  <td>
                    <ListingChips listings={p.platformListings} />
                  </td>
                  <td className="text-gray-400">{relativeTime(p.updatedAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StockSignal({
  stock,
  reserved,
  available,
}: {
  stock: number
  reserved: number
  available: number
}) {
  const ratio = stock <= 0 ? 0 : Math.min(100, Math.max(0, (available / stock) * 100))
  const tone =
    available <= 0 ? 'text-red-300' : available < 5 ? 'text-amber-300' : 'text-emerald-300'
  return (
    <div className="min-w-44 max-w-64">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className={cn('font-medium tabular-nums', tone)}>{formatNumber(available)} satilabilir</span>
        <span className="text-xs tabular-nums text-gray-500">{formatNumber(stock)} toplam</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${ratio}%` }} />
      </div>
      {reserved > 0 ? (
        <div className="mt-1 text-[11px] text-gray-500">{formatNumber(reserved)} rezerve</div>
      ) : null}
    </div>
  )
}

function ListingChips({ listings }: { listings: ProductRow['platformListings'] }) {
  if (listings.length === 0) return <span className="text-xs text-gray-500">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {listings.map((l) => {
        const Icon =
          l.syncStatus === 'ok'
            ? CheckCircle2
            : l.syncStatus === 'error'
            ? AlertTriangle
            : l.syncStatus === 'paused' || l.syncStatus === 'disabled'
            ? PauseCircle
            : RadioTower
        const cls =
          l.syncStatus === 'ok'
            ? 'badge-ok'
            : l.syncStatus === 'error'
            ? 'badge-error'
            : l.syncStatus === 'paused' || l.syncStatus === 'disabled'
            ? 'badge-muted'
            : 'badge-warn'
        return (
          <span key={l.platform} className={cn(cls, 'gap-1.5')}>
            <Icon className="h-3 w-3" />
            {l.platform}
          </span>
        )
      })}
    </div>
  )
}

function BulkToolbar({
  count,
  busy,
  onClear,
  onRun,
}: {
  count: number
  busy: boolean
  onClear: () => void
  onRun: (a: BulkAction) => void | Promise<void>
}) {
  const [mode, setMode] = useState<'set_stock' | 'adjust_stock' | 'set_reserved' | null>(null)
  const [val, setVal] = useState<number>(0)

  return (
    <div className="card sticky top-2 z-10 flex flex-wrap items-center gap-3 border-amber-400/35 bg-amber-400/10 shadow-lg shadow-black/30">
      <div className="text-sm">
        <strong className="tabular-nums">{count}</strong> ürün seçili
      </div>

      <div className="ml-2 flex flex-wrap items-center gap-2">
        {mode === null ? (
          <>
            <button
              onClick={() => {
                setMode('set_stock')
                setVal(0)
              }}
              className="btn-secondary text-xs"
              disabled={busy}
            >
              Stoğu set et
            </button>
            <button
              onClick={() => {
                setMode('adjust_stock')
                setVal(0)
              }}
              className="btn-secondary text-xs"
              disabled={busy}
            >
              Stok ekle/çıkar
            </button>
            <button
              onClick={() => {
                setMode('set_reserved')
                setVal(0)
              }}
              className="btn-secondary text-xs"
              disabled={busy}
            >
              Rezerve set et
            </button>
            <span className="mx-1 h-5 w-px bg-border" />
            <button
              onClick={() => onRun({ kind: 'pause' })}
              className="btn-secondary text-xs"
              disabled={busy}
            >
              Duraklat
            </button>
            <button
              onClick={() => onRun({ kind: 'resume' })}
              className="btn-secondary text-xs"
              disabled={busy}
            >
              Aktifleştir
            </button>
          </>
        ) : (
          <>
            <input
              type="number"
              autoFocus
              min={mode === 'adjust_stock' ? undefined : 0}
              value={val}
              onChange={(e) => setVal(Number(e.target.value))}
              className="input w-28 tabular-nums"
              placeholder={
                mode === 'set_stock'
                  ? 'Yeni stok'
                  : mode === 'adjust_stock'
                  ? 'Δ (+5 / -3)'
                  : 'Rezerve'
              }
            />
            <button
              onClick={() => {
                const action: BulkAction =
                  mode === 'set_stock'
                    ? { kind: 'set_stock', value: val }
                    : mode === 'adjust_stock'
                    ? { kind: 'adjust_stock', delta: val }
                    : { kind: 'set_reserved', value: val }
                void onRun(action)
                setMode(null)
              }}
              className="btn-primary text-xs"
              disabled={busy || (mode === 'adjust_stock' ? val === 0 : val < 0)}
            >
              {busy ? 'Uygulaniyor...' : 'Uygula'}
            </button>
            <button onClick={() => setMode(null)} className="btn-secondary text-xs" disabled={busy}>
              İptal
            </button>
          </>
        )}
      </div>

      <button onClick={onClear} className="ml-auto text-xs text-gray-300 hover:text-white" disabled={busy}>
        Seçimi temizle
      </button>
    </div>
  )
}
