import type { Metadata } from 'next'
import './globals.css'
import { PortProvider } from '../lib/port/provider.tsx'

export const metadata: Metadata = {
  title: {
    default: 'Homesrolo — your Home Record',
    template: '%s — Homesrolo',
  },
  description: 'Keep private whole-home projects, past work, and seasonal photo checkups connected to one home record.',
  // Private account pages should never appear in search results.
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
