import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PortProvider } from '../lib/port/provider.tsx'
import { PwaRegistrar } from '../components/PwaRegistrar.tsx'

export const metadata: Metadata = {
  metadataBase: new URL('https://app.homesrolo.com'),
  applicationName: 'Homesrolo',
  title: {
    default: 'Homesrolo — your Home Record',
    template: '%s — Homesrolo',
  },
  description: 'Keep private whole-home projects, past work, and seasonal photo checkups connected to one home record.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Homesrolo',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  referrer: 'no-referrer',
  // Private account pages should never appear in search results.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#071c27',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <PwaRegistrar />
        <PortProvider>{children}</PortProvider>
      </body>
    </html>
  )
}
