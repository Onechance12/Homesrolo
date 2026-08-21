import type { Metadata } from 'next'
import './globals.css'
import { SiteHeader } from '../components/SiteHeader.tsx'
import { SiteFooter } from '../components/SiteFooter.tsx'
import { ROOF_WATCH_PHONE_DISPLAY, SITE_DESCRIPTION, SITE_NAME, SITE_ORIGIN, SITE_TAGLINE } from '../lib/site.ts'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: '/',
    images: [{ url: '/homesrolo-social-card.png', width: 1200, height: 630, alt: 'Homesrolo — a better memory for every home' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [{ url: '/homesrolo-social-card.png', alt: 'Homesrolo — a better memory for every home' }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_ORIGIN,
    description: SITE_DESCRIPTION,
    logo: `${SITE_ORIGIN}/apple-icon.png`,
    telephone: ROOF_WATCH_PHONE_DISPLAY,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Roof Watch availability',
      telephone: ROOF_WATCH_PHONE_DISPLAY,
      areaServed: 'North Texas',
      availableLanguage: 'English',
    },
  }
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_ORIGIN,
    description: SITE_DESCRIPTION,
  }
  return (
    <html lang="en">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
        <a className="skip-link" href="#main">Skip to content</a>
        <SiteHeader />
        <main id="main" tabIndex={-1}>{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
