import type { MetadataRoute } from 'next'
import { INDEXABLE_ROUTES, SITE_ORIGIN } from '../lib/site.ts'

/**
 * Synthetic company profiles are deliberately absent. A sitemap entry is an
 * invitation to index, and inviting a crawler to an invented company would put
 * a fabricated business into search results no matter what the page says.
 *
 * The date is a fixed constant rather than `new Date()` so two builds of the
 * same commit produce byte-identical output.
 */
const LAST_MODIFIED = new Date('2026-08-12T00:00:00.000Z')

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_ROUTES.map(route => ({
    url: `${SITE_ORIGIN}${route}`,
    lastModified: LAST_MODIFIED,
    changeFrequency: 'monthly' as const,
    priority: route === '/' ? 1 : route === '/services/roofing/' ? 0.9 : 0.7,
  }))
}
