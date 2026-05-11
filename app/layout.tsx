import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import './globals.css'

export const metadata: Metadata = {
  title: 'PazarPilot | E-ticaret operasyon super app',
  description: 'Trendyol, Shopify ve Hepsiburada stok, siparis ve kanal operasyonunu tek merkezden yonet.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `
    try {
      var stored = window.localStorage.getItem('theme');
      document.documentElement.dataset.theme = stored === 'light' ? 'light' : 'dark';
    } catch (_) {
      document.documentElement.dataset.theme = 'dark';
    }
  `

  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: '#14b8a6',
          colorBackground: '#0b0b08',
          colorInputBackground: '#151511',
          colorInputText: '#f4f2ea',
          colorText: '#f4f2ea',
          colorTextSecondary: '#a8a29a',
          colorTextOnPrimaryBackground: '#06201d',
          colorNeutral: '#f4f2ea',
        },
      }}
    >
      <html lang="tr" suppressHydrationWarning>
        <body>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
