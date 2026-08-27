/* Homesrolo PWA shell — private Home Record responses are intentionally never cached. */
importScripts('/expo-shell-assets.js')

const MAX_SHELL_ASSETS = 160
const manifest = self.HOMESROLO_SHELL_MANIFEST
if (!manifest || typeof manifest.cacheName !== 'string' || !Array.isArray(manifest.assets)) {
  throw new Error('Homesrolo shell manifest is unavailable.')
}
if (!/^homesrolo-shell-[a-f0-9]{20}$/.test(manifest.cacheName)
  || manifest.assets.length === 0
  || manifest.assets.length > MAX_SHELL_ASSETS) {
  throw new Error('Homesrolo shell manifest is invalid.')
}

const CACHE_NAME = manifest.cacheName
const SHELL_ASSETS = new Set(manifest.assets)
const FIXED_PUBLIC_SHELL_ASSETS = new Set([
  '/apple-icon.png',
  '/expo-shell-assets.js',
  '/expo-shell.html',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/manifest.webmanifest',
  '/register-sw.js',
])
const isPublicShellAsset = assetPath => FIXED_PUBLIC_SHELL_ASSETS.has(assetPath)
  || assetPath.startsWith('/_expo/static/')
  || assetPath.startsWith('/assets/')
if (SHELL_ASSETS.size !== manifest.assets.length
  || !SHELL_ASSETS.has('/expo-shell.html')
  || [...SHELL_ASSETS].some(assetPath => (
    typeof assetPath !== 'string'
    || !assetPath.startsWith('/')
    || assetPath.startsWith('//')
    || assetPath.includes('..')
    || !isPublicShellAsset(assetPath)
  ))) {
  throw new Error('Homesrolo shell manifest contains an unsafe path.')
}

self.addEventListener('install', event => {
  const requests = [...SHELL_ASSETS].map(assetPath => new Request(assetPath, { cache: 'reload' }))
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(requests)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)),
    )).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin
    || url.pathname === '/api'
    || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/expo-shell.html')))
    return
  }

  if (!SHELL_ASSETS.has(url.pathname)) return

  event.respondWith(
    caches.match(url.pathname).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone()
        void caches.open(CACHE_NAME).then(cache => cache.put(url.pathname, copy))
      }
      return response
    })),
  )
})
