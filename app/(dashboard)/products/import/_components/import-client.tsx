'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn, formatNumber } from '@/lib/utils'
import type { ApplyPlanItem, ScanResult, ScanRow } from '@/lib/import/types'

type Tab = 'conflicts' | 'matched' | 'unmatched'
type ApplyResp = {
  productsUpserted: number
  listingsUpserted: number
  pushSucceeded: number
  pushFailed: number
  errors: string[]
}

export function ImportClient({ connectedPlatforms }: { connectedPlatforms: string[] }) {
  const router = useRouter()
  const [scanning, setScanning] = useState(false)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('conflicts')
  const [pushBack, setPushBack] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<ApplyResp | null>(null)

  // Per-row state: which stock the user picked, and whether to include it.
  // Keyed by canonical SKU.
  const [picks, setPicks] = useState<Record<string, { stock: number; include: boolean }>>({})

  async function runScan() {
    setError(null)
    setApplyResult(null)
    setScanning(true)
    try {
      const res = await fetch('/api/import/scan', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `Scan failed (${res.status})`)
      }
      const data = (await res.json()) as ScanResult
      setScan(data)
      // Initialise picks: include everything; default stock = suggested.
      const initial: Record<string, { stock: number; include: boolean }> = {}
      for (const r of data.rows) {
        initial[r.sku] = { stock: r.suggestedStock, include: true }
      }
      setPicks(initial)
      // Switch to first non-empty tab.
      if (data.totals.conflicts > 0) setTab('conflicts')
      else if (data.totals.unmatched > 0) setTab('unmatched')
      else setTab('matched')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setScanning(false)
    }
  }

  function setPick(sku: string, partial: Partial<{ stock: number; include: boolean }>) {
    setPicks((prev) => ({
      ...prev,
      [sku]: { ...(prev[sku] ?? { stock: 0, include: true }), ...partial },
    }))
  }

  const rowsByTab = useMemo(() => {
    if (!scan) return { conflicts: [], matched: [], unmatched: [] }
    return {
      conflicts: scan.rows.filter((r) => r.bucket === 'conflict'),
      matched: scan.rows.filter((r) => r.bucket === 'matched'),
      unmatched: scan.rows.filter((r) => r.bucket === 'unmatched'),
    }
  }, [scan])

  const includedCount = useMemo(() => {
    if (!scan) return 0
    return scan.rows.reduce((acc, r) => acc + (picks[r.sku]?.include ? 1 : 0), 0)
  }, [scan, picks])

  async function runApply() {
    if (!scan) return
    setApplying(true)
    setError(null)
    try {
      const items: ApplyPlanItem[] = scan.rows
        .filter((r) => picks[r.sku]?.include)
        .map((r) => ({
          sku: r.sku,
          rawSku: r.rawSku,
          name: r.name,
          barcode: r.barcode,
          chosenStock: Math.max(0, picks[r.sku]?.stock ?? r.suggestedStock),
          existingProductId: r.existingProductId,
          snapshots: r.snapshots.map((s) => ({
            platform: s.platform,
            platformProductId: s.platformProductId,
            platformSku: s.rawSku,
          })),
        }))

      const res = await fetch('/api/import/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pushBack, items }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `Apply failed (${res.status})`)
      }
      const data = (await res.json()) as ApplyResp
      setApplyResult(data)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setApplying(false)
    }
  }

  if (connectedPlatforms.length === 0) {
    return (
      <div className="space-y-4">
        <Header />
        <div className="card py-12 text-center">
          <div className="mb-3 text-3xl">🔌</div>
          <h3 className="text-lg font-semibold">Önce bir pazaryeri bağla</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-400">
            İçe aktarmak için en az bir pazaryeri (Trendyol, Shopify ya da Hepsiburada)
            bağlı olmalı.
          </p>
          <div className="mt-5">
            <Link href="/settings/integrations" className="btn-primary">
              Integrations sayfasına git
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Header />

      {!scan ? (
        <div className="card text-center">
          <p className="text-sm text-gray-400">
            Bağlı pazaryerleri:{' '}
            {connectedPlatforms.map((p) => (
              <span key={p} className="badge-ok ml-1">
                {p}
              </span>
            ))}
          </p>
          <p className="mx-auto mt-3 max-w-lg text-sm text-gray-400">
            Tara butonu, bağlı tüm pazaryerlerinden ürünlerinin <strong>SKU</strong>'larını
            çeker, aynı SKU'ları gruplar ve karşına bir review ekranı çıkarır. Daha hiçbir
            şey yazılmaz — sen "Apply" deyince DB'ye geçer.
          </p>
          <div className="mt-5">
            <button onClick={runScan} className="btn-primary" disabled={scanning}>
              {scanning ? 'Taranıyor… (büyük katalogda 1-2 dk sürebilir)' : 'Pazaryerlerini tara'}
            </button>
          </div>
          {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
        </div>
      ) : (
        <>
          {applyResult ? (
            <div className="card border-emerald-700/40 bg-emerald-900/20">
              <div className="text-sm font-semibold text-emerald-200">
                ✓ Import tamamlandı
              </div>
              <div className="mt-1 text-sm text-emerald-100/80">
                {applyResult.productsUpserted} ürün oluşturuldu/güncellendi,{' '}
                {applyResult.listingsUpserted} listing eşlendi
                {pushBack
                  ? `, push-back: ${applyResult.pushSucceeded} başarılı / ${applyResult.pushFailed} başarısız`
                  : ''}
                .
              </div>
              {applyResult.errors.length > 0 ? (
                <details className="mt-2 text-xs text-emerald-100/70">
                  <summary>{applyResult.errors.length} uyarı</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {applyResult.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <div className="mt-3">
                <Link href="/products" className="btn-primary text-xs">
                  Ürünler sayfasına git →
                </Link>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Stat label="Taranan" value={scan.totals.scanned} />
            <Stat label="Conflict" value={scan.totals.conflicts} accent="warn" />
            <Stat label="Auto-merged" value={scan.totals.matched} accent="ok" />
            <Stat label="Tek listing" value={scan.totals.unmatched} accent="muted" />
          </div>

          {scan.warnings.length > 0 ? (
            <div className="card border-amber-700/30 bg-amber-900/20 text-sm text-amber-200">
              <strong>Uyarı:</strong>
              <ul className="mt-1 list-disc pl-5">
                {scan.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex items-center gap-1 border-b border-border">
            <TabButton active={tab === 'conflicts'} count={rowsByTab.conflicts.length} onClick={() => setTab('conflicts')}>
              Conflicts
            </TabButton>
            <TabButton active={tab === 'matched'} count={rowsByTab.matched.length} onClick={() => setTab('matched')}>
              Auto-merged
            </TabButton>
            <TabButton active={tab === 'unmatched'} count={rowsByTab.unmatched.length} onClick={() => setTab('unmatched')}>
              Unmatched
            </TabButton>
          </div>

          <RowTable rows={rowsByTab[tab]} picks={picks} setPick={setPick} />

          <div className="card sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 shadow-lg shadow-black/30">
            <div className="space-y-1">
              <div className="text-sm text-gray-300">
                <strong>{includedCount}</strong> ürün içe aktarılacak
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={pushBack}
                  onChange={(e) => setPushBack(e.target.checked)}
                  className="h-4 w-4 accent-indigo-500"
                />
                Master stoğu pazaryerlerine de hemen yaz (push-back)
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={runScan} className="btn-secondary" disabled={scanning || applying}>
                Yeniden tara
              </button>
              <button onClick={runApply} className="btn-primary" disabled={applying || includedCount === 0}>
                {applying ? 'Uygulanıyor…' : `${includedCount} ürünü içe aktar`}
              </button>
            </div>
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </>
      )}
    </div>
  )
}

function Header() {
  return (
    <div>
      <Link href="/products" className="text-sm text-gray-400 hover:text-gray-100">
        ← Ürünler
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Pazaryerinden ürün içe aktar</h1>
      <p className="text-sm text-gray-400">
        Aynı SKU'lar tek bir master ürün altında birleştirilir; o andan sonra stok tek
        yerden yönetilir.
      </p>
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: 'ok' | 'warn' | 'muted'
}) {
  const color =
    accent === 'ok'
      ? 'text-emerald-300'
      : accent === 'warn'
      ? 'text-amber-300'
      : accent === 'muted'
      ? 'text-gray-300'
      : ''
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', color)}>
        {formatNumber(value)}
      </div>
    </div>
  )
}

function TabButton({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean
  count: number
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        '-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm transition-colors',
        active
          ? 'border-indigo-500 text-white'
          : 'border-transparent text-gray-400 hover:text-gray-200'
      )}
    >
      {children}
      <span className="ml-2 rounded-full bg-bg-card px-2 py-0.5 text-xs tabular-nums text-gray-300">
        {count}
      </span>
    </button>
  )
}

function RowTable({
  rows,
  picks,
  setPick,
}: {
  rows: ScanRow[]
  picks: Record<string, { stock: number; include: boolean }>
  setPick: (sku: string, partial: Partial<{ stock: number; include: boolean }>) => void
}) {
  if (rows.length === 0) {
    return <div className="card py-10 text-center text-sm text-gray-400">Bu sekme boş.</div>
  }

  return (
    <div className="table-wrap">
      <table className="table-base">
        <thead>
          <tr>
            <th className="w-10"></th>
            <th>Ürün</th>
            <th>Pazaryerleri (stok)</th>
            <th className="w-44">Master stok</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pick = picks[r.sku] ?? { stock: r.suggestedStock, include: true }
            return (
              <tr key={r.sku}>
                <td>
                  <input
                    type="checkbox"
                    checked={pick.include}
                    onChange={(e) => setPick(r.sku, { include: e.target.checked })}
                    className="h-4 w-4 accent-indigo-500"
                  />
                </td>
                <td>
                  <div className="font-medium text-gray-100">{r.name}</div>
                  <div className="text-xs text-gray-500">
                    <code>{r.rawSku}</code>
                    {r.barcode ? <> · {r.barcode}</> : null}
                    {r.existingProductId ? (
                      <span className="ml-2 badge-warn">DB'de mevcut — güncellenecek</span>
                    ) : null}
                  </div>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    {r.snapshots.map((s) => {
                      const equalsPick = s.stock === pick.stock
                      return (
                        <button
                          key={s.platform}
                          type="button"
                          onClick={() => setPick(r.sku, { stock: s.stock })}
                          title={`${s.platform}: ${s.stock} → master yap`}
                          className={cn(
                            'rounded-md border px-2 py-1 text-xs transition-colors',
                            equalsPick
                              ? 'border-indigo-500 bg-indigo-500/15 text-indigo-100'
                              : 'border-border bg-bg-subtle text-gray-300 hover:bg-bg-card'
                          )}
                        >
                          <span className="capitalize">{s.platform}</span>:{' '}
                          <strong className="tabular-nums">{s.stock}</strong>
                        </button>
                      )
                    })}
                  </div>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={pick.stock}
                    onChange={(e) => setPick(r.sku, { stock: Number(e.target.value) })}
                    className="input w-28 tabular-nums"
                  />
                </td>
                <td>
                  {r.bucket === 'conflict' ? (
                    <span className="badge-warn">conflict</span>
                  ) : r.bucket === 'matched' ? (
                    <span className="badge-ok">match</span>
                  ) : (
                    <span className="badge-muted">solo</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
