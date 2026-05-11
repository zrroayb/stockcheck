/**
 * Worker process entrypoint.
 *
 * Run with:  npm run workers   (or)   tsx workers/index.ts
 *
 * Workers MUST run in their own Node process — not inside Next.js — so they
 * survive Next dev reloads and have predictable concurrency.
 */
import 'dotenv/config'
import { enqueuePendingSyncs, schedulePendingSyncSweep, syncWorkers } from './sync-worker'
import { cancelWorker } from './cancel-worker'
import { alertWorker } from './alert-worker'
import { pollWorker, scheduleHepsiburadaPolling } from './poll-worker'

async function main() {
  console.log('[workers] starting…')
  console.log(
    '[workers] sync workers:',
    syncWorkers.map((w) => w.name).join(', ')
  )
  console.log('[workers] cancel worker:', cancelWorker.name)
  console.log('[workers] alert worker:', alertWorker.name)
  console.log('[workers] poll worker:', pollWorker.name)

  try {
    await scheduleHepsiburadaPolling()
    console.log('[workers] hepsiburada polling scheduled')
    const pending = await enqueuePendingSyncs()
    console.log(`[workers] pending sync sweep queued=${pending.queued} failed=${pending.failed}`)
    schedulePendingSyncSweep()
  } catch (err) {
    console.error('[workers] failed to schedule startup jobs:', err)
  }

  console.log('[workers] ready.')
}

void main()

async function shutdown(signal: string) {
  console.log(`[workers] received ${signal}, shutting down…`)
  await Promise.allSettled([
    ...syncWorkers.map((w) => w.close()),
    cancelWorker.close(),
    alertWorker.close(),
    pollWorker.close(),
  ])
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
