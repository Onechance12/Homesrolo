import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Homesrolo — Your Home Record',
    short_name: 'Homesrolo',
    description: 'Keep the projects, photos, documents, warranties, and seasonal checkups that make up your home record.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f4f7f6',
    theme_color: '#071c27',
    categories: ['house-home', 'lifestyle', 'utilities'],
    prefer_related_applications: false,
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Open my homes',
        short_name: 'My homes',
        description: 'Open the homes connected to this account.',
        url: '/homes',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  }
}
