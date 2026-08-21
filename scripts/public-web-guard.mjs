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

const EXPECTED_ROOF_WATCH_IMAGES = new Map([
  ['/roof-watch/', [
    '/images/roof-watch/architectural-shingle-roof-condition.webp',
    '/images/roof-watch/roof-ridge-cap-and-vent-detail.webp',
    '/images/roof-watch/round-attic-vent-and-shingle-field.webp',
    '/images/roof-watch/roof-tear-off-hidden-assembly.webp',
    '/images/roof-watch/roof-shingle-surface-detail.webp',
    '/images/roof-watch/gray-shingle-roof-ridges-and-vents.webp',
    '/images/roof-watch/laminated-shingle-ridge-detail.webp',
    '/images/roof-watch/roof-field-and-hip-ridge-detail.webp',
  ]],
  ['/roof-watch/guides/hail-first-72-hours/', ['/images/roof-watch/architectural-shingle-roof-condition.webp']],
  ['/roof-watch/guides/roof-inspection-report/', ['/images/roof-watch/roof-ridge-cap-and-vent-detail.webp']],
  ['/roof-watch/guides/texas-heat-roof/', ['/images/roof-watch/round-attic-vent-and-shingle-field.webp']],
  ['/roof-watch/guides/selling-documented-home/', ['/images/roof-watch/roof-field-and-hip-ridge-detail.webp']],
  ['/roof-watch/keller/', ['/images/roof-watch/roof-ridge-cap-and-vent-detail.webp']],
  ['/roof-watch/roanoke/', ['/images/roof-watch/gray-shingle-roof-ridges-and-vents.webp']],
  ['/roof-watch/grapevine/', ['/images/roof-watch/laminated-shingle-ridge-detail.webp']],
  ['/roof-watch/southlake/', ['/images/roof-watch/roof-tear-off-hidden-assembly.webp']],
  ['/roof-watch/flower-mound/', ['/images/roof-watch/roof-shingle-surface-detail.webp']],
  ['/roof-watch/fort-worth/', ['/images/roof-watch/roof-field-and-hip-ridge-detail.webp']],
])

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

function uint24le(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
}

function webpDimensions(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return undefined
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const kind = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const data = offset + 8
    if (kind === 'VP8 ' && data + 10 <= buffer.length) {
      return { width: buffer.readUInt16LE(data + 6) & 0x3fff, height: buffer.readUInt16LE(data + 8) & 0x3fff }
    }
    if (kind === 'VP8L' && data + 5 <= buffer.length) {
      const bits = buffer.readUInt32LE(data + 1)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (kind === 'VP8X' && data + 10 <= buffer.length) {
      return { width: uint24le(buffer, data + 4) + 1, height: uint24le(buffer, data + 7) + 1 }
    }
    offset = data + size + (size % 2)
  }
  return undefined
}

function jpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  let offset = 2
  while (offset + 8 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1]
    offset += 2
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const length = buffer.readUInt16BE(offset)
    if (length < 2 || offset + length > buffer.length) break
    if (startOfFrame.has(marker)) {
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) }
    }
    offset += length
  }
  return undefined
}

function pngDimensions(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') return undefined
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

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

// Documentary photos must not ship camera/location records or old operator
// branding in their embedded metadata. The visible pixels receive a separate
// human review before a file is added.
const roofPhotoDirectory = path.join(WEB, 'public', 'images', 'roof-watch')
const roofPhotoFiles = walk(roofPhotoDirectory, name => /\.(?:jpe?g|webp|avif)$/i.test(name), new Set([]))
for (const file of roofPhotoFiles) {
  const image = readFileSync(file)
  if (image.includes(Buffer.from('Exif\0\0'))) fail(`${rel(file)}: contains an EXIF metadata segment`)
  if (/\.webp$/i.test(file) && image.includes(Buffer.from('EXIF'))) fail(`${rel(file)}: contains a WebP EXIF chunk`)
  if (image.includes(Buffer.from('http://ns.adobe.com/xap/1.0/')) || image.includes(Buffer.from('<x:xmpmeta'))) {
    fail(`${rel(file)}: contains XMP metadata`)
  }
  for (const token of ['GPSLatitude', 'GPSLongitude', 'iPhone', 'THREE24', 'Three24', 'Chance Pearson']) {
    if (image.includes(Buffer.from(token))) fail(`${rel(file)}: contains sensitive or obsolete embedded metadata (${token})`)
  }
}
for (const file of roofPhotoFiles.filter(file => /\.jpe?g$/i.test(file))) {
  if (path.basename(file) !== 'roof-watch-field-photos-social.jpg') {
    fail(`${rel(file)}: body field photos must ship as responsive WebP, not JPEG`)
  }
}
for (const file of roofPhotoFiles.filter(file => /\.webp$/i.test(file) && !/-640\.webp$/i.test(file))) {
  const derivative = file.replace(/\.webp$/i, '-640.webp')
  if (!existsSync(derivative) || statSync(derivative).size === 0) {
    fail(`${rel(file)}: missing non-empty 640px responsive derivative`)
    continue
  }
  const fullDimensions = webpDimensions(readFileSync(file))
  const dimensions = webpDimensions(readFileSync(derivative))
  if (dimensions?.width !== 640) fail(`${rel(derivative)}: responsive derivative width is ${dimensions?.width ?? 'unreadable'}, expected 640`)
  if (!fullDimensions || !dimensions) {
    fail(`${rel(file)}: full or responsive WebP dimensions could not be read`)
  } else {
    const expectedHeight = Math.round(fullDimensions.height * 640 / fullDimensions.width)
    if (dimensions.height !== expectedHeight) {
      fail(`${rel(derivative)}: responsive derivative is ${dimensions.width}x${dimensions.height}; expected 640x${expectedHeight}`)
    }
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
      'www.owenscorning.com',
      'www.osha.gov',
      'www.rcat.net',
      'www.tdi.texas.gov',
      'www.trec.texas.gov',
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
  else {
    const robots = readFileSync(robotsPath, 'utf8')
    for (const crawler of ['Googlebot', 'Bingbot', 'OAI-SearchBot']) {
      const group = robots.match(new RegExp(`User-Agent:\\s*${crawler}\\s*([\\s\\S]*?)(?=\\nUser-Agent:|\\nSitemap:|$)`, 'i'))?.[1]
      if (!group) {
        fail(`robots.txt must state the public policy for ${crawler}`)
        continue
      }
      if (!/^Allow:\s*\/$/im.test(group)) fail(`robots.txt must allow / for ${crawler}`)
      if (/^Disallow:\s*\/companies\/$/im.test(group)) {
        fail(`robots.txt must let ${crawler} fetch synthetic company pages and observe noindex`)
      }
    }
    const gptBotGroup = robots.match(/User-Agent:\s*GPTBot\s*([\s\S]*?)(?=\nUser-Agent:|\nSitemap:|$)/i)?.[1]
    if (!gptBotGroup || !/^Allow:\s*\/$/im.test(gptBotGroup) || !/^Disallow:\s*\/companies\/$/im.test(gptBotGroup)) {
      fail('robots.txt must allow GPTBot on public education and disallow it from synthetic company fixtures')
    }
  }

  const sitemapPath = path.join(OUT, 'sitemap.xml')
  if (!existsSync(sitemapPath)) fail('sitemap.xml was not exported')
  else {
    const sitemap = readFileSync(sitemapPath, 'utf8')
    if (/\/companies\//.test(sitemap)) fail('sitemap.xml must not list synthetic company profiles')

    // A successful Next build can still export the not-found body at a real
    // sitemap route (for example when an async dynamic param is read
    // synchronously). Check the actual artifact, not only the build exit code.
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
    if (locations.length === 0) fail('sitemap.xml contains no locations')
    for (const location of locations) {
      const url = new URL(location)
      if (url.origin !== 'https://homesrolo.com') {
        fail(`sitemap.xml contains a non-canonical origin: ${location}`)
        continue
      }

      const route = url.pathname.replace(/^\/+|\/+$/g, '')
      const outputPath = route ? path.join(OUT, route, 'index.html') : path.join(OUT, 'index.html')
      if (!existsSync(outputPath)) {
        fail(`${location}: sitemap route has no exported index.html`)
        continue
      }

      const page = readFileSync(outputPath, 'utf8')
      // Next embeds the not-found component's RSC payload in otherwise valid
      // pages, so only treat a rendered error title or h1 as a failed export.
      if (/<h1\b[^>]*>\s*That page (?:isn.t|isn’t) here|<title>[^<]*(?:404|Not Found)/i.test(page)) {
        fail(`${rel(outputPath)}: sitemap route exported a not-found document`)
      }
      if (!/<meta name="robots" content="[^"]*index,\s*follow/i.test(page)) {
        fail(`${rel(outputPath)}: sitemap route is not explicitly index, follow`)
      }
      if (!/<h1\b/i.test(page)) fail(`${rel(outputPath)}: sitemap route has no h1`)

      const canonical = page.match(/<link rel="canonical" href="([^"]+)"/i)?.[1]
      if (canonical !== location) {
        fail(`${rel(outputPath)}: canonical is ${canonical ?? 'missing'}; expected ${location}`)
      }

      for (const property of ['og:title', 'og:type', 'og:image']) {
        if (!new RegExp(`<meta property="${property}" content="[^"]+"`, 'i').test(page)) {
          fail(`${rel(outputPath)}: missing ${property}`)
        }
      }
      const openGraphUrl = page.match(/<meta property="og:url" content="([^"]+)"/i)?.[1]
      if (openGraphUrl !== location) fail(`${rel(outputPath)}: og:url is ${openGraphUrl ?? 'missing'}; expected ${location}`)
      const openGraphImage = page.match(/<meta property="og:image" content="([^"]+)"/i)?.[1]
      if (openGraphImage) {
        const imageUrl = new URL(openGraphImage)
        const assetPath = path.join(OUT, imageUrl.pathname.replace(/^\/+/, ''))
        if (imageUrl.origin !== 'https://homesrolo.com' || !existsSync(assetPath) || statSync(assetPath).size === 0) {
          fail(`${rel(outputPath)}: og:image must be a non-empty canonical Homesrolo asset`)
        }
      }
      for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) {
        if (!new RegExp(`<meta name="${name}" content="[^"]+"`, 'i').test(page)) {
          fail(`${rel(outputPath)}: missing ${name}`)
        }
      }

      if (url.pathname.startsWith('/roof-watch/')) {
        if (!page.includes('Roof Watch')) fail(`${rel(outputPath)}: Roof Watch route lost its page sentinel`)
      }
    }

    const imageLocations = [...sitemap.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map(match => match[1])
    const expectedImageCount = [...EXPECTED_ROOF_WATCH_IMAGES.values()].reduce((total, images) => total + images.length, 0)
    if (imageLocations.length !== expectedImageCount) {
      fail(`sitemap.xml exposes ${imageLocations.length} images; expected exactly ${expectedImageCount} reviewed route-image entries`)
    }
    const sitemapImageEntries = new Map([...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => {
      const block = match[1]
      const location = block.match(/<loc>([^<]+)<\/loc>/)?.[1]
      const images = [...block.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map(imageMatch => imageMatch[1])
      return [location, images]
    }))
    for (const [route, expectedImages] of EXPECTED_ROOF_WATCH_IMAGES) {
      const pageUrl = `https://homesrolo.com${route}`
      const actualImages = sitemapImageEntries.get(pageUrl) ?? []
      const expectedUrls = expectedImages.map(image => `https://homesrolo.com${image}`)
      if (actualImages.length !== expectedUrls.length || expectedUrls.some(image => !actualImages.includes(image))) {
        fail(`${pageUrl}: image sitemap entries do not match the reviewed on-page images`)
      }
      const routePath = route.replace(/^\/+|\/+$/g, '')
      const outputPath = routePath ? path.join(OUT, routePath, 'index.html') : path.join(OUT, 'index.html')
      const page = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : ''
      for (const expectedImage of expectedImages) {
        if (!page.includes(`src="${expectedImage}"`)) {
          fail(`${pageUrl}: expected sitemap image is not visible in the exported HTML (${expectedImage})`)
        }
      }
    }
    const hubImageUrls = sitemapImageEntries.get('https://homesrolo.com/roof-watch/') ?? []
    if (new Set(hubImageUrls).size !== 8) fail('Roof Watch hub must expose eight distinct documentary images')
    for (const imageLocation of imageLocations) {
      const imageUrl = new URL(imageLocation)
      if (imageUrl.origin !== 'https://homesrolo.com') {
        fail(`sitemap.xml contains a non-canonical image origin: ${imageLocation}`)
        continue
      }
      const imagePath = path.join(OUT, imageUrl.pathname.replace(/^\/+/, ''))
      if (!existsSync(imagePath) || statSync(imagePath).size === 0) {
        fail(`${imageLocation}: sitemap image was not exported`)
      }
    }

    for (const file of html) {
      const page = readFileSync(file, 'utf8')
      for (const match of page.matchAll(/<img\b[^>]*>/gi)) {
        const tag = match[0]
        const source = tag.match(/\bsrc="([^"]+)"/i)?.[1]
        if (!source?.startsWith('/images/roof-watch/') || !source.endsWith('.webp')) continue
        const declaredWidth = Number(tag.match(/\bwidth="(\d+)"/i)?.[1])
        const declaredHeight = Number(tag.match(/\bheight="(\d+)"/i)?.[1])
        const assetPath = path.join(OUT, source.replace(/^\/+/, ''))
        const dimensions = existsSync(assetPath) ? webpDimensions(readFileSync(assetPath)) : undefined
        if (!dimensions || dimensions.width !== declaredWidth || dimensions.height !== declaredHeight) {
          fail(`${rel(file)}: ${source} declares ${declaredWidth || 'missing'}x${declaredHeight || 'missing'} but exports ${dimensions ? `${dimensions.width}x${dimensions.height}` : 'no readable WebP'}`)
        }
      }
      for (const match of page.matchAll(/srcset="([^"]+)"/gi)) {
        for (const candidate of match[1].split(',')) {
          const source = candidate.trim().split(/\s+/)[0]
          if (!source?.startsWith('/images/roof-watch/')) continue
          const asset = path.join(OUT, source.replace(/^\/+/, ''))
          if (!existsSync(asset) || statSync(asset).size === 0) {
            fail(`${rel(file)}: responsive image candidate is missing or empty (${source})`)
          }
        }
      }
    }
  }

  const llmsPath = path.join(OUT, 'llms.txt')
  if (!existsSync(llmsPath)) fail('llms.txt was not exported')
  else {
    const llms = readFileSync(llmsPath, 'utf8')
    if (!llms.includes('https://homesrolo.com/services/roofing/')) fail('llms.txt must name the canonical roofing center')
    if (!llms.includes('https://homesrolo.com/roof-watch/')) fail('llms.txt must name the canonical Roof Watch page')
    if (/homesrolo\.example\.com|\/companies\/[a-z0-9-]+/i.test(llms)) fail('llms.txt must not advertise placeholder hosts or sample company profiles')
  }

  const genericSocialPath = path.join(OUT, 'homesrolo-social-card.png')
  if (!existsSync(genericSocialPath) || statSync(genericSocialPath).size === 0) {
    fail('the generic Homesrolo social card must export as a non-empty PNG')
  } else {
    const dimensions = pngDimensions(readFileSync(genericSocialPath))
    if (dimensions?.width !== 1200 || dimensions?.height !== 630) {
      fail(`the generic Homesrolo social card is ${dimensions?.width ?? 'unreadable'}x${dimensions?.height ?? 'unreadable'}; expected 1200x630`)
    }
  }
  for (const publicAsset of ['manifest.webmanifest', 'icon.svg', 'apple-icon.png']) {
    const assetPath = path.join(OUT, publicAsset)
    if (!existsSync(assetPath) || statSync(assetPath).size === 0) fail(`${publicAsset} must be exported`)
  }

  const roofWatchHubPath = path.join(OUT, 'roof-watch', 'index.html')
  if (!existsSync(roofWatchHubPath)) fail('Roof Watch hub was not exported')
  else {
    const hub = readFileSync(roofWatchHubPath, 'utf8')
    if (!hub.includes('/images/roof-watch/architectural-shingle-roof-condition.webp')) {
      fail('Roof Watch hub must contain the reviewed documentary hero photo')
    }
    if (!/alt="Brown architectural asphalt shingles viewed across a roof slope"/.test(hub)) {
      fail('Roof Watch documentary hero photo must retain its factual alt text')
    }
    if (!hub.includes('/images/roof-watch/roof-watch-field-photos-social.jpg')) {
      fail('Roof Watch hub must expose the reviewed photo-based social image')
    }
    const socialCardPath = path.join(OUT, 'images', 'roof-watch', 'roof-watch-field-photos-social.jpg')
    if (!existsSync(socialCardPath) || statSync(socialCardPath).size === 0) {
      fail('Roof Watch social image must export as a non-empty JPEG')
    } else {
      const dimensions = jpegDimensions(readFileSync(socialCardPath))
      if (dimensions?.width !== 1200 || dimensions?.height !== 630) {
        fail(`Roof Watch social image is ${dimensions?.width ?? 'unreadable'}x${dimensions?.height ?? 'unreadable'}; expected 1200x630`)
      }
    }
  }

  const indexNowKey = 'ae05831592254a7653354c33657a5584'
  const indexNowKeyPath = path.join(OUT, `${indexNowKey}.txt`)
  if (!existsSync(indexNowKeyPath) || readFileSync(indexNowKeyPath, 'utf8').trim() !== indexNowKey) {
    fail('IndexNow verification key must export at the canonical root')
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
