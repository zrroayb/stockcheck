import Link from 'next/link'
import { BellRing, ShieldAlert } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'
import { CreateAlertRule } from './_components/create-alert-rule'
import { AlertActions } from './_components/alert-actions'

export const dynamic = 'force-dynamic'

export default async function AlertsPage() {
  const company = await requireCompany()

  const [rules, products] = await Promise.all([
    prisma.alertRule.findMany({
      where: { product: { companyId: company.id } },
      include: { product: { select: { id: true, name: true, masterSku: true, stockCount: true } } },
      orderBy: { id: 'desc' },
    }),
    prisma.product.findMany({
      where: { companyId: company.id },
      select: { id: true, name: true, masterSku: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-amber-200">
            <ShieldAlert className="h-3.5 w-3.5" />
            Otomasyon kalkanı
          </div>
          <h1 className="text-2xl font-semibold">Stok otomasyonlari</h1>
          <p className="text-sm text-gray-400">
            Stok esigi gecilince alarm uret, kritik urunu kanallarda 0 stoka cek ve satis riskini azalt.
          </p>
        </div>
        <CreateAlertRule products={products} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="metric-card">
          <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wider text-gray-500">
            <span>Aktif kural</span>
            <BellRing className="h-4 w-4 text-emerald-300" />
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {rules.filter((r) => r.enabled).length}
          </div>
        </div>
        <div className="metric-card">
          <div className="mb-3 text-xs uppercase tracking-wider text-gray-500">Pause otomasyonu</div>
          <div className="text-2xl font-semibold tabular-nums">
            {rules.filter((r) => r.action === 'pause_listings').length}
          </div>
        </div>
        <div className="metric-card">
          <div className="mb-3 text-xs uppercase tracking-wider text-gray-500">Izlenen SKU</div>
          <div className="text-2xl font-semibold tabular-nums">
            {new Set(rules.map((r) => r.productId)).size}
          </div>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="card py-12 text-center text-gray-400">
          Henuz kural yok. Ilk otomasyonu kurunca PazarPilot kritik stok aninda aksiyon alir.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Urun</th>
                <th>Rule</th>
                <th className="text-right">Threshold</th>
                <th>Aksiyon</th>
                <th className="text-right">Stock</th>
                <th>Enabled</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/products/${r.product.id}`} className="font-medium hover:text-white">
                      {r.product.name}
                    </Link>
                    <div className="text-xs text-gray-500">{r.product.masterSku}</div>
                  </td>
                  <td className="text-gray-300">{r.ruleType}</td>
                  <td className="text-right tabular-nums">{r.threshold}</td>
                  <td className="text-gray-300">{r.action}</td>
                  <td className="text-right tabular-nums">{r.product.stockCount}</td>
                  <td>
                    {r.enabled ? (
                      <span className="badge-ok">on</span>
                    ) : (
                      <span className="badge-muted">off</span>
                    )}
                  </td>
                  <td className="text-right">
                    <AlertActions ruleId={r.id} enabled={r.enabled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
