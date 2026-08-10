import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '../lib/site.ts'

export const dynamic = 'force-static'

/**
 * `/companies/` is disallowed in full. Those pages also carry a noindex robots
 * meta tag, and both layers are kept because they fail differently: a meta tag
 * only works if the page is fetched and parsed, while a disallow only works for
 * crawlers that read robots.txt. Synthetic listings warrant both.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/companies/'],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  }
}
