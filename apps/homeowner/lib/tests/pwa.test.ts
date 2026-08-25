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
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)\) return/,
    'every private API response bypasses the service worker')
  assert.match(worker, /request\.mode === 'navigate'[\s\S]*fetch\(request\)\.catch\(\(\) => caches\.match\('\/offline'\)\)/,
    'authenticated navigation remains network-only with a public offline fallback')
  assert.match(worker, /SHELL_ASSETS\.has\(url\.pathname\)/)
  assert.match(worker, /url\.pathname\.startsWith\('\/_next\/static\/'\)/)
  assert.doesNotMatch(worker, /indexedDB|localStorage|sessionStorage/)

  const offline = read('app/offline/page.tsx')
  assert.match(offline, /Private records are never placed in the offline browser cache\./)
  const installer = read('components/PwaRegistrar.tsx')
  assert.match(installer, /Your private records still stay on the secure server—not in an offline browser cache\./)
})

test('the off-Render deployment is reproducible from the repository root', () => {
  const configuration = readRepository('netlify.toml')
  assert.match(configuration, /npm --prefix apps\/homeowner run build/)
  assert.match(configuration, /publish = "apps\/homeowner\/\.next"/)
  assert.match(configuration, /NODE_VERSION = "22"/)
  assert.match(configuration, /package = "@netlify\/plugin-nextjs"/)
  assert.match(configuration, /NEXT_PUBLIC_HOMESROLO_PORT_MODE = "remote"/)
  assert.match(configuration, /HOMESROLO_APP_ORIGIN = "https:\/\/app\.homesrolo\.com"/)
  assert.match(configuration, /HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED = "true"/)
  assert.match(configuration, /HOMESROLO_SELF_SIGNUP_ENABLED = "false"/)
  assert.match(configuration, /HOMESROLO_PRIVATE_UPLOADS_ENABLED = "false"/)
  assert.match(configuration, /HOMESROLO_PHOTO_CHECKUPS_ENABLED = "false"/)
  assert.match(configuration, /Service-Worker-Allowed = "\/"/)
  assert.doesNotMatch(configuration, /onrender/i)
})
