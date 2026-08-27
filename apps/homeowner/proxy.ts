import { type NextRequest, NextResponse } from 'next/server'

const SERVER_PREFIXES = ['/api/', '/_next/', '/_expo/', '/assets/', '/.netlify/', '/.well-known/']
const LEGACY_SERVER_ROUTES = new Set(['/auth/complete'])
const PUBLIC_FILES = new Set([
  '/apple-icon.png',
  '/expo-shell-assets.js',
  '/expo-shell.html',
  '/favicon.ico',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/manifest.webmanifest',
  '/register-sw.js',
  '/robots.txt',
  '/sitemap.xml',
  '/sw.js',
])

/**
 * Keep the existing same-origin Next API while every user-facing route opens
 * the shared Expo application used by iOS and Android.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_FILES.has(pathname) || LEGACY_SERVER_ROUTES.has(pathname)
    || SERVER_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  const shell = request.nextUrl.clone()
  shell.pathname = '/expo-shell.html'
  shell.search = ''
  return NextResponse.rewrite(shell)
}

export const config = {
  matcher: '/:path*',
}
