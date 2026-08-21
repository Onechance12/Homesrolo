import type { Metadata } from 'next'

type PublicPageMetadata = {
  readonly title: string
  readonly description: string
  readonly canonical: `/${string}`
  readonly socialTitle?: string
  readonly socialDescription?: string
  readonly openGraphType?: 'website' | 'article'
}

/** Keep ordinary page, canonical, Open Graph, and X/Twitter copy in sync. */
export function publicPageMetadata({
  title,
  description,
  canonical,
  socialTitle = title,
  socialDescription = description,
  openGraphType = 'website',
}: PublicPageMetadata): Metadata {
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: openGraphType,
      title: socialTitle,
      description: socialDescription,
      url: canonical,
      images: [{ url: '/homesrolo-social-card.png', width: 1200, height: 630, alt: 'Homesrolo — a better memory for every home' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description: socialDescription,
      images: [{ url: '/homesrolo-social-card.png', alt: 'Homesrolo — a better memory for every home' }],
    },
  }
}
