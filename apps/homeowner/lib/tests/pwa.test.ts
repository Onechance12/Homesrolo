import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const APP = path.resolve(import.meta.dirname, '../..')
const read = (relative: string) => readFileSync(path.join(APP, relative), 'utf8')
const readRepository = (relative: string) => readFileSync(path.join(APP, '../..', relative), 'utf8')

function pngDimensions(relative: string) {
  const image = readFileSync(path.join(APP, relative))
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.ok(image.subarray(0, 8).equals(signature), `${relative} must be a PNG`)
  assert.equal(image.toString('ascii', 12, 16), 'IHDR')
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) }
}

test('the homeowner origin is an installable Homesrolo PWA, not a wrapper around another host', () => {
  const manifest = read('app/manifest.ts')
  assert.match(manifest, /id: '\/'/)
  assert.match(manifest, /start_url: '\/'/)
  assert.match(manifest, /scope: '\/'/)
  assert.match(manifest, /display: 'standalone'/)
  assert.match(manifest, /theme_color: '#071c27'/)
  assert.match(manifest, /background_color: '#071c27'/,
    'the installed app opens on the same dark canvas instead of flashing a light splash')
  assert.match(manifest, /icon-192\.png[\s\S]*icon-512\.png[\s\S]*icon-maskable-512\.png/)
  assert.doesNotMatch(manifest, /onrender|netlify|vercel/i,
    'the installed app manifest carries only the Homesrolo identity and canonical routes')

  const layout = read('app/layout.tsx')
  assert.match(layout, /metadataBase: new URL\('https:\/\/app\.homesrolo\.com'\)/)
  assert.match(layout, /manifest: '\/manifest\.webmanifest'/)
  assert.match(layout, /appleWebApp:[\s\S]*capable: true/)
  assert.match(layout, /viewportFit: 'cover'/)
  assert.match(layout, /<PwaRegistrar \/>/)

  assert.deepEqual(pngDimensions('public/icon-192.png'), { width: 192, height: 192 })
  assert.deepEqual(pngDimensions('public/icon-512.png'), { width: 512, height: 512 })
  assert.deepEqual(pngDimensions('public/icon-maskable-512.png'), { width: 512, height: 512 })
  assert.deepEqual(pngDimensions('app/apple-icon.png'), { width: 180, height: 180 })
})

test('the complete maskable mark stays inside the platform safe zone', async () => {
  const { data, info } = await sharp(path.join(APP, 'public/icon-maskable-512.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const background = [data[0]!, data[1]!, data[2]!] as const
  const center = (info.width - 1) / 2
  let coloredPixels = 0
  let farthestPixel = 0

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels
      const difference = Math.abs(data[offset]! - background[0])
        + Math.abs(data[offset + 1]! - background[1])
        + Math.abs(data[offset + 2]! - background[2])
      if (difference <= 20) continue
      coloredPixels += 1
      farthestPixel = Math.max(farthestPixel, Math.hypot(x - center, y - center))
    }
  }

  assert.ok(coloredPixels > 10_000, 'the Homesrolo mark must be present')
  assert.ok(farthestPixel <= 200,
    `the maskable mark exceeds its safe radius: ${farthestPixel.toFixed(1)}px`)
})

test('offline support caches only the public shell and never a private Home Record response', () => {
  const worker = read('public/sw.js')
  assert.match(worker, /importScripts\('\/expo-shell-assets\.js'\)/,
    'the worker loads the exact dependency graph produced by the hosted Expo export')
  assert.match(worker, /const CACHE_NAME = manifest\.cacheName/,
    'each generated dependency graph receives its own content-derived cache')
  assert.match(worker, /manifest\.assets\.length > MAX_SHELL_ASSETS/,
    'a malformed export cannot grow the offline cache without a hard limit')
  assert.match(worker,
    /url\.pathname === '\/api'[\s\S]*url\.pathname\.startsWith\('\/api\/'\)\) return/,
    'every private API response bypasses the service worker')
  assert.match(worker, /request\.mode === 'navigate'[\s\S]*fetch\(request\)\.catch\(\(\) => caches\.match\('\/expo-shell\.html'\)\)/,
    'authenticated navigation remains network-only with a public offline fallback')
  assert.match(worker, /if \(!SHELL_ASSETS\.has\(url\.pathname\)\) return/,
    'runtime caching is limited to the exact generated manifest, not a URL-prefix wildcard')
  assert.match(worker, /caches\.match\(url\.pathname\)/)
  assert.match(worker, /cache\.put\(url\.pathname, copy\)/,
    'query strings cannot create unbounded duplicate cache entries')
  assert.doesNotMatch(worker, /indexedDB|localStorage|sessionStorage/)

  const offline = read('app/offline/page.tsx')
  assert.match(offline, /Private records are never placed in the offline browser cache\./)
  const installer = read('components/PwaRegistrar.tsx')
  assert.match(installer, /Your private records still stay on the secure server—not in an offline browser cache\./)

  const exporter = readRepository('apps/mobile/scripts/export-web-for-homeowner.mjs')
  assert.match(exporter, /rel=\"manifest\" href=\"\/manifest\.webmanifest\"/)
  assert.match(exporter, /<script src=\"\/register-sw\.js\" defer><\/script>/,
    'the hosted shell avoids an inline script so its CSP can keep script-src self-only')
  const registrar = read('public/register-sw.js')
  assert.match(registrar,
    /navigator\.serviceWorker\.register\('\/sw\.js', \{ updateViaCache: 'none' \}\)/)
  assert.doesNotMatch(registrar, /localStorage|sessionStorage|cookie/i)
  assert.match(exporter, /EXPO_PUBLIC_HOMESROLO_PREVIEW_MODE: '0'/)
  assert.match(exporter, /collectGeneratedShellDependencies/)
  assert.match(exporter, /createShellRevision/)
  assert.match(exporter, /renderShellPrecacheManifest/)
  assert.match(exporter, /writeFile\(shellManifestPath, shellManifest, 'utf8'\)/)

  const proxy = read('proxy.ts')
  assert.match(proxy, /'\/expo-shell-assets\.js'/,
    'the generated public dependency manifest bypasses the user-route shell rewrite')
  assert.match(proxy, /'\/register-sw\.js'/,
    'the external service-worker registrar bypasses the user-route shell rewrite')
  assert.match(proxy, /pathname = '\/expo-shell\.html'/)
  assert.match(proxy, /SERVER_PREFIXES = \['\/api\/'/,
    'private API routes remain on the same Next origin instead of entering the static app shell')
  assert.match(proxy, /LEGACY_SERVER_ROUTES = new Set\(\['\/auth\/complete'\]\)/,
    'already-issued legacy email links retain their server-side completion route')
  assert.match(proxy, /NextResponse\.rewrite\(shell\)/)

  const signInAlias = readRepository('apps/mobile/app/signin.tsx')
  assert.match(signInAlias, /export \{ default \} from '\.\/sign-in\.tsx'/,
    'public /signin links open the shared app instead of an unmatched route')
})

test('the off-Render deployment is reproducible from the repository root', () => {
  const configuration = readRepository('netlify.toml')
  assert.match(configuration, /npm --prefix apps\/mobile run export:web:hosted/)
  assert.match(configuration, /npm --prefix apps\/homeowner run build/)
  assert.match(configuration, /publish = "apps\/homeowner\/\.next"/)
  assert.match(configuration, /NODE_VERSION = "22"/)
  assert.match(configuration, /package = "@netlify\/plugin-nextjs"/)
  assert.match(configuration, /NEXT_PUBLIC_HOMESROLO_PORT_MODE = "remote"/)
  assert.match(configuration, /HOMESROLO_APP_ORIGIN = "https:\/\/app\.homesrolo\.com"/)
  assert.match(configuration, /EXPO_PUBLIC_HOMESROLO_API_URL = "https:\/\/app\.homesrolo\.com"/)
  assert.match(configuration, /EXPO_PUBLIC_HOMESROLO_PREVIEW_MODE = "0"/)
  assert.match(configuration, /HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED = "true"/)
  assert.match(configuration, /HOMESROLO_SELF_SIGNUP_ENABLED = "false"/)
  assert.match(configuration, /HOMESROLO_PRIVATE_UPLOADS_ENABLED = "true"/,
    'the reviewed private bucket migration is live before this release gate opens')
  assert.match(configuration, /HOMESROLO_PHOTO_CHECKUPS_ENABLED = "true"/,
    'the reviewed photo-checkup migration and bounded private upload path are live before this release gate opens')
  assert.match(configuration, /HOMESROLO_ROLO_VISION_ENABLED = "true"/,
    'exact-home authorization, explicit consent, and metadata-free photo transforms are live before photo review opens')
  assert.match(configuration, /for = "\/\*"[\s\S]*X-Content-Type-Options = "nosniff"/)
  assert.match(configuration, /X-Frame-Options = "DENY"/)
  assert.match(configuration, /Referrer-Policy = "strict-origin-when-cross-origin"/)
  assert.match(configuration,
    /Permissions-Policy = "camera=\(self\), geolocation=\(self\), microphone=\(self\), payment=\(\), usb=\(\)"/)
  assert.match(configuration,
    /Content-Security-Policy = "default-src 'self';[^"]*script-src 'self';[^"]*style-src 'self' 'unsafe-inline';[^"]*img-src 'self' blob: data:;[^"]*connect-src 'self' https:\/\/\*\.supabase\.co;[^"]*worker-src 'self';/,
    'the HttpOnly-cookie PWA retains a self-only script policy and bounded app capabilities')
  assert.match(configuration, /Service-Worker-Allowed = "\/"/)
  assert.match(configuration,
    /for = "\/expo-shell-assets\.js"[\s\S]*Cache-Control = "public, max-age=0, must-revalidate"/,
    'service-worker dependency revisions are always revalidated')
  assert.doesNotMatch(configuration, /onrender/i)
})
