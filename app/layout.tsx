import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stokkontrol — Multi-Marketplace Stock Control',
  description: 'Keep your product stock in sync across Trendyol, Shopify and Hepsiburada.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#6366f1',
          colorBackground: '#0b0d12',
          colorInputBackground: '#10131a',
          colorInputText: '#e8eaf0',
          colorText: '#e8eaf0',
        },
      }}
    >
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
