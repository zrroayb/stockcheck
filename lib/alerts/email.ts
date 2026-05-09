import { Resend } from 'resend'

let resendClient: Resend | null = null

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  if (!resendClient) resendClient = new Resend(key)
  return resendClient
}

export async function sendAlertEmail(args: {
  to: string
  productName: string
  currentStock: number
  threshold: number
  ruleType: 'low_stock' | 'out_of_stock' | 'overstock'
}): Promise<void> {
  const resend = getResend()
  const from = process.env.ALERT_FROM_EMAIL ?? 'alerts@example.com'

  const subject =
    args.ruleType === 'out_of_stock'
      ? `[Stokkontrol] ${args.productName} is OUT OF STOCK`
      : `[Stokkontrol] ${args.productName} stock alert (${args.currentStock} ≤ ${args.threshold})`

  const html = `
    <div style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 540px; margin: 0 auto;">
      <h2 style="margin-bottom: 8px;">${subject}</h2>
      <p>Product <strong>${escapeHtml(args.productName)}</strong> has triggered an alert.</p>
      <table style="border-collapse: collapse; margin-top: 12px;">
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Rule</td><td><code>${args.ruleType}</code></td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Threshold</td><td>${args.threshold}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Current stock</td><td><strong>${args.currentStock}</strong></td></tr>
      </table>
      <p style="margin-top: 16px; color: #666; font-size: 13px;">
        Open Stokkontrol to take action.
      </p>
    </div>
  `.trim()

  if (!resend) {
    // Dev mode without Resend — log instead of failing.
    console.warn('[alerts/email] RESEND_API_KEY not set — would have sent:', { to: args.to, subject })
    return
  }

  await resend.emails.send({
    from,
    to: args.to,
    subject,
    html,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
