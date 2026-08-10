import path from 'node:path'

/**
 * The homeowner application is a DYNAMIC Next app — deliberately not a static
 * export — because Phase 1's integration lead (Codex) will attach the real
 * authenticated runtime behind the UI data port. The three read-only API
 * routes now terminate at a fail-closed server adapter; there are still no
 * server actions or middleware, and the runtime remains signed-out until the
 * integration lane supplies real identity and repository providers.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The server seam imports the merged contracts from ../../src, so the
  // workspace root is the repository root, stated rather than inferred.
  turbopack: { root: path.resolve(import.meta.dirname, '../..') },
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
}

export default nextConfig
