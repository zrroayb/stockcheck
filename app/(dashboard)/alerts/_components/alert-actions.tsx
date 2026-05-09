'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function AlertActions({ ruleId, enabled }: { ruleId: string; enabled: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      await fetch(`/api/alert-rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      })
      router.refresh()
    })
  }

  function remove() {
    if (!confirm('Delete this alert rule?')) return
    startTransition(async () => {
      await fetch(`/api/alert-rules/${ruleId}`, { method: 'DELETE' })
      router.refresh()
    })
  }

  return (
    <div className="flex justify-end gap-2">
      <button className="btn-secondary text-xs" onClick={toggle} disabled={pending}>
        {enabled ? 'Disable' : 'Enable'}
      </button>
      <button className="btn-danger text-xs" onClick={remove} disabled={pending}>
        Delete
      </button>
    </div>
  )
}
