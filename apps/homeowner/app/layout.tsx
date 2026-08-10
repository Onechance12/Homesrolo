import type { Metadata } from 'next'
import './globals.css'
import { PortProvider } from '../lib/port/provider.tsx'

export const metadata: Metadata = {
  title: {
    default: 'Homesrolo — your home file',
    template: '%s — Homesrolo',
  },
  description: 'The homeowner application shell. Phase 1 demo with synthetic data only.',
  // The app is a Phase 1 demo shell; it has no business in a search index.
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <PortProvider>{children}</PortProvider>
      </body>
    </html>
  )
}
