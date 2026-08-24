import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '../lib/site.ts'

export const dynamic = 'force-static'

/** Retired company URLs stay crawlable by search engines so their 404 is visible. */
export default function robots(): MetadataRoute.Robots {
  const publicRules = {
    allow: '/',
  }
  const trainingRules = {
    allow: '/',
    disallow: ['/companies/'],
  }
  return {
    rules: [
      { userAgent: '*', ...publicRules },
      // OAI-SearchBot controls ChatGPT Search discovery. GPTBot is a separate
      // training crawler: it may read public education while the unused company
      // namespace stays excluded. Search crawlers may fetch retired URLs as 404s.
      { userAgent: 'OAI-SearchBot', ...publicRules },
      { userAgent: 'GPTBot', ...trainingRules },
      { userAgent: 'ChatGPT-User', ...publicRules },
      { userAgent: 'Claude-SearchBot', ...publicRules },
      { userAgent: 'Googlebot', ...publicRules },
      { userAgent: 'Bingbot', ...publicRules },
      { userAgent: 'PerplexityBot', ...publicRules },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  }
}
