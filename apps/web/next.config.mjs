/**
 * Static export only.
 *
 * `output: 'export'` produces plain HTML/CSS/JS with no Node server, which is
 * what keeps the Phase 0.5 prohibitions structural rather than aspirational:
 * an API route, a server action, or a runtime data fetch would fail the build
 * rather than quietly shipping.
 *
 * `images.unoptimized` is required because the default image optimiser needs a
 * server at request time. All visuals here are code-native anyway.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  // Directory-style URLs so the export works on any static host without
  // server-side rewrite rules.
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
}

export default nextConfig
