import Link from 'next/link'
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
          <h1 className="text-2xl font-semibold">Alert rules</h1>
          <p className="text-sm text-gray-400">
            Get notified — or auto-pause listings — when stock crosses a threshold.
          </p>
        </div>
        <CreateAlertRule products={products} />
      </div>

      {rules.length === 0 ? (
        <div className="card py-12 text-center text-gray-400">
          No rules yet. Create one to start getting alerts.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Product</th>
                <th>Rule</th>
                <th className="text-right">Threshold</th>
                <th>Action</th>
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
