/**
 * The homeowner application is a DYNAMIC Next app — deliberately not a static
 * export — because Phase 1's integration lead (Codex) will attach the real
 * authenticated runtime behind the UI data port. Nothing in this lane creates
 * that runtime: there are no API routes, no server actions, no middleware, and
 * the eslint config bans fetch/XMLHttpRequest/WebSocket in app code, so the
 * shell stays inert until the port is implemented server-side.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The server seam imports the merged contracts from ../../src, so the
  // workspace root is the repository root, stated rather than inferred.
  turbopack: { root: '../..' },
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
}

export default nextConfig
