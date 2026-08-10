/**
 * Runtime mode selection — the only switch that can ever point this app at a
 * server, and it fails closed.
 *
 * The value is a PUBLIC build-time configuration (NEXT_PUBLIC_*), deliberately
 * not a secret and not a runtime toggle: enabling the remote adapter is a
 * deploy-time decision someone makes on purpose. Absent, empty, misspelled,
 * differently-cased, or unknown values all resolve to 'synthetic' — the demo
 * never guesses its way onto a network.
 */

export type PortMode = 'synthetic' | 'remote'

/** Exact-match only. 'REMOTE', ' remote', 'live', 'prod' → synthetic. */
export function resolvePortMode(raw: string | undefined): PortMode {
  return raw === 'remote' ? 'remote' : 'synthetic'
}

export function activePortMode(): PortMode {
  // Inlined at build time by Next; absent in every default build.
  return resolvePortMode(process.env.NEXT_PUBLIC_HOMESROLO_PORT_MODE)
}
