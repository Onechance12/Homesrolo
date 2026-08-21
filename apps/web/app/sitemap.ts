import type { MetadataRoute } from 'next'
import { INDEXABLE_ROUTES, SITE_ORIGIN } from '../lib/site.ts'
import { ROOF_WATCH_CITIES } from '../lib/content/roof-watch-cities.ts'
import { ROOF_WATCH_GUIDES } from '../lib/content/roof-watch-guides.ts'

/**
 * Synthetic company profiles are deliberately absent. A sitemap entry is an
 * invitation to index, and inviting a crawler to an invented company would put
 * a fabricated business into search results no matter what the page says.
 *
 * Only pages with a reviewed modification date receive `lastmod`. A blanket
 * build date is not a content update and gives crawlers a false freshness
 * signal. The fixed value also keeps two builds of one commit byte-identical.
 */
const ROOF_WATCH_HUB_LAST_MODIFIED = '2026-08-20'
const ROOF_WATCH_GUIDES_INDEX_LAST_MODIFIED = '2026-08-21'
export const ROOF_WATCH_ROUTE_LAST_MODIFIED: Readonly<Record<string, string>> = Object.freeze({
  '/roof-watch/': ROOF_WATCH_HUB_LAST_MODIFIED,
  '/roof-watch/guides/': ROOF_WATCH_GUIDES.reduce(
    (latest, guide) => guide.dateModified > latest ? guide.dateModified : latest,
    ROOF_WATCH_GUIDES_INDEX_LAST_MODIFIED,
  ),
  ...Object.fromEntries(ROOF_WATCH_CITIES.map(city => [`/roof-watch/${city.slug}/`, city.dateModified])),
  ...Object.fromEntries(ROOF_WATCH_GUIDES.map(guide => [`/roof-watch/guides/${guide.slug}/`, guide.dateModified])),
})
const ROUTE_LAST_MODIFIED: Readonly<Record<string, string>> = Object.freeze({
  ...ROOF_WATCH_ROUTE_LAST_MODIFIED,
  '/': '2026-08-21',
  '/for-agents/': '2026-08-21',
  '/services/roofing/': '2026-08-21',
  '/services/roofing/cost/': '2026-08-21',
  '/editorial-standards/': '2026-08-21',
})
export const ROUTE_IMAGES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '/roof-watch/': [
    '/images/roof-watch/architectural-shingle-roof-condition.webp',
    '/images/roof-watch/roof-ridge-cap-and-vent-detail.webp',
    '/images/roof-watch/round-attic-vent-and-shingle-field.webp',
    '/images/roof-watch/roof-tear-off-hidden-assembly.webp',
    '/images/roof-watch/roof-shingle-surface-detail.webp',
    '/images/roof-watch/gray-shingle-roof-ridges-and-vents.webp',
    '/images/roof-watch/laminated-shingle-ridge-detail.webp',
    '/images/roof-watch/roof-field-and-hip-ridge-detail.webp',
  ],
  '/roof-watch/guides/hail-first-72-hours/': ['/images/roof-watch/architectural-shingle-roof-condition.webp'],
  '/roof-watch/guides/roof-inspection-report/': ['/images/roof-watch/roof-ridge-cap-and-vent-detail.webp'],
  '/roof-watch/guides/texas-heat-roof/': ['/images/roof-watch/round-attic-vent-and-shingle-field.webp'],
  '/roof-watch/guides/selling-documented-home/': ['/images/roof-watch/roof-field-and-hip-ridge-detail.webp'],
  '/roof-watch/keller/': ['/images/roof-watch/roof-ridge-cap-and-vent-detail.webp'],
  '/roof-watch/roanoke/': ['/images/roof-watch/gray-shingle-roof-ridges-and-vents.webp'],
  '/roof-watch/grapevine/': ['/images/roof-watch/laminated-shingle-ridge-detail.webp'],
  '/roof-watch/southlake/': ['/images/roof-watch/roof-tear-off-hidden-assembly.webp'],
  '/roof-watch/flower-mound/': ['/images/roof-watch/roof-shingle-surface-detail.webp'],
  '/roof-watch/fort-worth/': ['/images/roof-watch/roof-field-and-hip-ridge-detail.webp'],
})

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_ROUTES.map(route => {
    const lastModified = ROUTE_LAST_MODIFIED[route]
    const images = ROUTE_IMAGES[route]
    return {
      url: `${SITE_ORIGIN}${route}`,
      ...(lastModified ? { lastModified: new Date(`${lastModified}T00:00:00.000Z`) } : {}),
      ...(images ? { images: images.map(image => `${SITE_ORIGIN}${image}`) } : {}),
      changeFrequency: 'monthly' as const,
      priority: route === '/' ? 1 : route === '/services/roofing/' ? 0.9 : 0.7,
    }
  })
}
