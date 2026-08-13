#!/usr/bin/env node
/**
 * Phase 0.5 guard for the public web experience.
 *
 * The prohibitions on this slice (no auth, no database, no API routes, no
 * server actions, no uploads, no network fetches, no analytics, no PII) are
 * only real if something checks them. This script does, in two passes:
 *
 *   1. SOURCE — scans apps/web for constructs that must not exist.
 *   2. EXPORT — scans apps/web/out, when present, for what actually shipped.
 *
 * Run from the repository root. Exits non-zero on the first category of
 * failure, listing every instance rather than just the first.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const WEB = path.join(ROOT, 'apps', 'web')
const OUT = path.join(WEB, 'out')

const failures = []
const fail = (message) => failures.push(message)

function walk(dir, filter, skip = new Set(['node_modules', '.next', 'out'])) {
  const found = []
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...walk(absolute, filter, skip))
    else if (filter(entry.name)) found.push(absolute)
  }
  return found
}

const rel = (absolute) => path.relative(ROOT, absolute)

// =============================================================================
// 1. Source prohibitions
// =============================================================================

const sourceFiles = walk(WEB, name => /\.(?:tsx?|mjs|jsx?)$/.test(name))
if (sourceFiles.length === 0) fail('source scan found no files under apps/web')

/** [label, pattern, exempt] — exempt paths are checked separately. */
const FORBIDDEN_SOURCE = [
  ['server action', /['"]use server['"]/],
  ['network fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bnew\s+WebSocket\b/],
  ['environment variable read', /\bprocess\.env\b/],
  ['database client', /\b(?:@prisma\/client|PrismaClient|mongoose|pg\.Client|createPool)\b/],
  ['auth library', /\b(?:next-auth|@clerk\/|@auth\/core|jsonwebtoken|bcrypt)\b/],
  ['payment library', /\b(?:stripe|@stripe\/|paypal|braintree)\b/],
  ['analytics or cookies', /\b(?:gtag|googletagmanager|analytics\.track|mixpanel|posthog|document\.cookie)\b/],
  ['file upload', /\b(?:multer|formidable|<input[^>]+type=["']file)/],
  ['jobrolo application import', /from\s+['"][^'"]*\/(?:jobrolo|thresher|hcn|chance-brain)\//],
]

/**
 * Lint configuration legitimately names the globals it bans, so scanning it for
 * those names would flag a file for enforcing the very rule being checked.
 */
const CONFIG_EXEMPT = new Set(['eslint.config.mjs'])

for (const file of sourceFiles) {
  if (CONFIG_EXEMPT.has(path.basename(file))) continue
  const source = readFileSync(file, 'utf8')
  for (const [label, pattern] of FORBIDDEN_SOURCE) {
    if (pattern.test(source)) fail(`${rel(file)}: contains a ${label}`)
  }
}

// API routes and server handlers must not exist at all.
for (const routeFile of walk(path.join(WEB, 'app'), name => /^route\.(?:tsx?|js)$/.test(name))) {
  fail(`${rel(routeFile)}: API routes are prohibited in Phase 0.5`)
}
for (const middleware of ['middleware.ts', 'middleware.js']) {
  if (existsSync(path.join(WEB, middleware))) fail(`apps/web/${middleware}: middleware requires a server`)
}

// The static export switches must stay on.
const configPath = path.join(WEB, 'next.config.mjs')
if (!existsSync(configPath)) {
  fail('apps/web/next.config.mjs is missing')
} else {
  const config = readFileSync(configPath, 'utf8')
  if (!/output:\s*['"]export['"]/.test(config)) fail('next.config.mjs must set output: "export"')
  if (!/unoptimized:\s*true/.test(config)) fail('next.config.mjs must set images.unoptimized: true')
}

// The reviewed Phase 0 share contract must not be reachable from the public web.
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8')
  if (/homeowner-share|home-file\.v1|home-file-record|company-link\.v1/.test(source)) {
    fail(`${rel(file)}: the public layer must not import the private/share contracts`)
  }
}

// =============================================================================
// 2. Export prohibitions
// =============================================================================

const PRIVATE_TOKENS = [
  'streetAddress', 'addressLine1', 'postalCode', 'homeownerName', 'homeownerRef',
  'claimNumber', 'policyNumber', 'deductibleAmount', 'settlementAmount',
  'shareId', 'manifestDigest', 'jobNimbusId', 'sponsorshipTier', 'placementFee',
  'rankBoost', 'leadPrice',
]

if (!existsSync(OUT)) {
  console.log('note: apps/web/out not present, export scan skipped (run the web build first)')
} else {
  const html = walk(OUT, name => name.endsWith('.html'), new Set([]))
  if (html.length === 0) fail('export scan found no HTML in apps/web/out')

  for (const file of html) {
    const page = readFileSync(file, 'utf8')

    for (const token of PRIVATE_TOKENS) {
      if (page.includes(token)) fail(`${rel(file)}: exported HTML contains private token "${token}"`)
    }

    // Educational pages may cite this small set of primary or explicitly
    // reviewed sources. Directory fixtures remain synthetic.
    const reviewedSourceHosts = new Set([
      'dallas.gov',
      'consumer.ftc.gov',
      'www.angi.com',
      'www.gaf.com',
      'www.fortworthtexas.gov',
      'ibhs.org',
      'www.ibhs.org',
      'www.ncei.noaa.gov',
      'www.nrca.net',
      'www.rcat.net',
      'www.tdi.texas.gov',
    ])
    for (const match of page.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
      const url = new URL(match[1])
      const synthetic = url.hostname === 'example.com' || url.hostname.endsWith('.example.com')
      const canonical = url.hostname === 'homesrolo.com' || url.hostname === 'app.homesrolo.com'
      if (!synthetic && !canonical && !reviewedSourceHosts.has(url.hostname)) {
        fail(`${rel(file)}: unreviewed external link ${url.href}`)
      }
      if (url.protocol !== 'https:') fail(`${rel(file)}: insecure external link ${url.href}`)
    }
  }

  // Synthetic company pages must be noindex and must carry the sample notice.
  const companyPages = walk(path.join(OUT, 'companies'), name => name.endsWith('.html'), new Set([]))
  if (companyPages.length === 0) fail('no exported company pages found')
  for (const file of companyPages) {
    const page = readFileSync(file, 'utf8')
    if (!/<meta name="robots" content="[^"]*noindex/.test(page)) {
      fail(`${rel(file)}: a synthetic company page must be noindex`)
    }
    if (!/Sample listing/i.test(page)) {
      fail(`${rel(file)}: a synthetic company page must say it is a sample`)
    }
  }

  const robotsPath = path.join(OUT, 'robots.txt')
  if (!existsSync(robotsPath)) fail('robots.txt was not exported')
  else if (!/Disallow:\s*\/companies\//.test(readFileSync(robotsPath, 'utf8'))) {
    fail('robots.txt must disallow /companies/')
  }

  const sitemapPath = path.join(OUT, 'sitemap.xml')
  if (!existsSync(sitemapPath)) fail('sitemap.xml was not exported')
  else if (/\/companies\//.test(readFileSync(sitemapPath, 'utf8'))) {
    fail('sitemap.xml must not list synthetic company profiles')
  }

  const llmsPath = path.join(OUT, 'llms.txt')
  if (!existsSync(llmsPath)) fail('llms.txt was not exported')
  else {
    const llms = readFileSync(llmsPath, 'utf8')
    if (!llms.includes('https://homesrolo.com/services/roofing/')) fail('llms.txt must name the canonical roofing center')
    if (/homesrolo\.example\.com|\/companies\/[a-z0-9-]+/i.test(llms)) fail('llms.txt must not advertise placeholder hosts or sample company profiles')
  }

  if (!existsSync(path.join(OUT, '404.html'))) fail('404.html was not exported')

  // A static export must not have produced a server bundle.
  if (existsSync(path.join(WEB, '.next', 'server', 'app-paths-manifest.json'))) {
    const manifest = readFileSync(path.join(WEB, '.next', 'server', 'app-paths-manifest.json'), 'utf8')
    if (/\/api\//.test(manifest)) fail('the build produced API route handlers')
  }
}

// =============================================================================

if (failures.length > 0) {
  console.error(`public web guard FAILED with ${failures.length} problem(s):`)
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}

console.log(`public web guard passed (${sourceFiles.length} source files scanned)`)
