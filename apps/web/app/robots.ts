import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '../lib/site.ts'

export const dynamic = 'force-static'

/**
 * Synthetic company examples remain crawlable only so search engines can read
 * their page-level `noindex` directive. Blocking the path here would prevent a
 * crawler from seeing that directive and could leave a URL-only result. The
 * examples are also omitted from the sitemap.
 */
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
      // training crawler: it may read public education but not invented company
      // fixtures, which search crawlers may fetch only to observe `noindex`.
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
