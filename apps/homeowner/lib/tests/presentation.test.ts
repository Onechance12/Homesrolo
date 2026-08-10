import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Presentation contracts checkable from source, in the house style: if a rule
 * matters, deleting it must fail a test, not a code review.
 */

const APP = path.resolve(import.meta.dirname, '../..')
const read = (relative: string) => readFileSync(path.join(APP, relative), 'utf8')

/**
 * Relative paths in the route inventory are always POSIX, whatever the host
 * separator is. Without this, `path.join` yields backslashes on Windows and
 * every screen-existence assertion comparing against 'app/…/page.tsx' literals
 * fails there while Linux CI stays green — found by validation on a Windows
 * machine, reproduced here as a normalization the tests below exercise.
 */
export function toPosix(relative: string): string {
  return relative.split('\\').join('/')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(path.join(APP, dir))) {
    const rel = toPosix(path.join(dir, name))
    const stat = statSync(path.join(APP, rel))
    if (stat.isDirectory()) out.push(...sourceFiles(rel))
    else if (/\.(ts|tsx|css|mjs)$/.test(name)) out.push(rel)
  }
  return out
}

const css = read('app/globals.css')
const appSources = ['app', 'components', 'lib'].flatMap(sourceFiles)

// --- accessibility -----------------------------------------------------------

test('focus is always visible and never removed', () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*3px solid/)
  assert.doesNotMatch(css, /outline:\s*(?:none|0)\s*;/)
})

test('reduced motion is honoured', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /animation-duration:\s*0\.01ms\s*!important/)
})

test('interactive controls carry a real minimum hit area', () => {
  assert.match(css, /\.btn\s*\{[^}]*min-height:\s*44px/, 'buttons are field-usable targets')
  assert.match(css, /\.field input[^{]*\{[^}]*min-height:\s*44px/, 'inputs are field-usable targets')
  assert.match(css, /min-height:\s*var\(--tabbar\)/, 'tab bar items fill the bar')
})

test('the shell has a language, a skip link, and a main landmark', () => {
  const layout = read('app/layout.tsx')
  assert.match(layout, /<html lang="en">/)
  assert.match(layout, /className="skip-link"/)
  const shell = read('components/AppShell.tsx')
  assert.match(shell, /<main id="main" tabIndex=\{-1\}/)
})

// --- honesty -----------------------------------------------------------------

test('the demo banner is part of the shell whenever the mode is synthetic', () => {
  const shell = read('components/AppShell.tsx')
  assert.match(shell, /SYNTHETIC_NOTICE/)
  assert.match(shell, /mode === 'synthetic'\s*\n?\s*\? <p className="demo-banner"/,
    'the banner is tied to the mode, not to a per-page choice')
})

test('the app never claims to be indexed', () => {
  const layout = read('app/layout.tsx')
  assert.match(layout, /robots:\s*\{\s*index:\s*false/)
})

test('the network exists in exactly one sanctioned file', () => {
  // Constructs, not words: a comment naming the fetch ban is not a fetch, and
  // a status flag honestly recording a missing connection is not a connection.
  // Phase 2 adds ONE sanctioned call site: the JSON transport. Everything else
  // stays banned, so no component can grow a backend on the side.
  const SANCTIONED = 'lib/port/transport.ts'
  for (const rel of appSources) {
    const content = read(rel)
    if (rel === SANCTIONED) {
      assert.match(content, /credentials:\s*'same-origin'/, 'the transport is same-origin with cookies')
      assert.doesNotMatch(content, /https?:\/\//, 'the transport never carries an absolute URL')
      continue
    }
    assert.doesNotMatch(content, /\bfetch\s*\(/, `${rel} must not call fetch; only ${SANCTIONED} may`)
    assert.doesNotMatch(content, /new\s+(XMLHttpRequest|WebSocket)\s*\(/, `${rel} must not open a connection`)
    assert.doesNotMatch(content, /process\.env\.(DATABASE|SECRET|API_KEY|TOKEN)/, `${rel} must not read secrets`)
  }
})

test('synthetic is the default mode and the only config is the public mode value', () => {
  const mode = read('lib/port/mode.ts')
  assert.match(mode, /raw === 'remote' \? 'remote' : 'synthetic'/,
    'exact-match on remote; everything else fails closed to synthetic')
  const provider = read('lib/port/provider.tsx')
  assert.match(provider, /activePortMode\(\)/)
  assert.match(provider, /mode === 'remote'\s*\n?\s*\? createRemotePort/,
    'remote is the exception; synthetic is the resting state')
  // The only environment read in the entire app is the public mode selector.
  for (const rel of appSources) {
    const content = read(rel)
    const reads = content.match(/process\.env\.[A-Z_]+/g) ?? []
    for (const found of reads) {
      assert.equal(found, 'process.env.NEXT_PUBLIC_HOMESROLO_PORT_MODE',
        `${rel} reads ${found}; only the public mode selector is allowed`)
    }
  }
})

test('the browser never supplies principal identity to the wire', () => {
  const remote = read('lib/port/remote.ts')
  assert.doesNotMatch(remote, /principalRef/, 'the adapter never handles a principal ref outbound')
  assert.doesNotMatch(remote, /body:\s*\{[^}]*principal/i, 'no request body carries a principal')
  const transport = read('lib/port/transport.ts')
  assert.doesNotMatch(transport, /authorization|bearer|token/i,
    'no hand-carried credentials; the cookie is the session')
})

test('no raw storage URLs or provider identifiers are projected into the UI', () => {
  for (const rel of appSources) {
    if (rel.startsWith('lib/tests')) continue // the tripwire may name its own targets
    const content = read(rel)
    assert.doesNotMatch(content, /storageObjectRef|storageUrl|signedUrl|s3:|gs:\/\//i,
      `${rel} must not project storage internals`)
  }
  const wire = read('lib/port/wire.ts')
  // The narrowed Phase-2A surface decodes no href, URL, or link field at all;
  // if one returns (e.g. with a timeline route), it must come with an
  // app-internal-route confinement check, not a bare string decoder.
  assert.doesNotMatch(wire, /href|url:/i,
    'no server-supplied link field is decoded on the narrowed surface')
})

test('exactly the three homeowner-http.v1 routes exist and nothing else', () => {
  // Phase 2C: the server boundary defines three authenticated GET reads, so
  // exactly three route files may exist — an allowlist, not a pattern.
  const ROUTE_ALLOWLIST = [
    'app/api/v1/session/route.ts',
    'app/api/v1/homes/route.ts',
    'app/api/v1/homes/[homeRef]/route.ts',
  ]
  const found = appSources.filter(rel => /route\.(ts|tsx)$/.test(rel)).sort()
  assert.deepEqual(found, [...ROUTE_ALLOWLIST].sort(),
    'the route inventory must be exactly the three defined reads')
  for (const rel of ROUTE_ALLOWLIST) {
    const content = read(rel)
    assert.match(content, /export async function GET/, `${rel} serves GET`)
    assert.doesNotMatch(content, /export (async function|const) (POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/,
      `${rel} must export no other method`)
    assert.match(content, /handleHomeownerRequest/, `${rel} only delegates to the adapter`)
  }
  for (const rel of appSources) {
    assert.doesNotMatch(rel, /middleware\.(ts|tsx)$/, 'no middleware exists')
    const content = read(rel)
    assert.doesNotMatch(content, /['"]use server['"]/, `${rel} must not declare a server action`)
  }
})

test('the server seam is isolated: only routes touch it, and only it touches src', () => {
  for (const rel of appSources) {
    const content = read(rel)
    const isServerSide = rel.startsWith('lib/server') || rel.startsWith('app/api/')
    if (!isServerSide && !rel.startsWith('lib/tests')) {
      assert.doesNotMatch(content, /from '.*lib\/server/,
        `${rel} is client-side and must not import the server seam`)
      assert.doesNotMatch(content, /from '.*src\/homeowner/,
        `${rel} is client-side and must not import server contracts`)
    }
    if (isServerSide) {
      assert.doesNotMatch(content, /from '.*fixtures/,
        `${rel} must never serve synthetic fixtures: a server does not invent homeowners`)
      assert.doesNotMatch(content, /process\.env/,
        `${rel} reads no environment; providers arrive through the runtime seam`)
    }
  }
})

test('the shell does not import private contracts or other repositories', () => {
  // Imports, not mentions: PORT_IMPLEMENTATION_STATUS may honestly record that
  // no Jobrolo connection exists; what must never exist is code reaching one.
  for (const rel of appSources) {
    const content = read(rel)
    assert.doesNotMatch(content, /from '.*src\/contracts/, `${rel} must not import root contracts`)
    assert.doesNotMatch(content, /from ['"][^'"]*(jobrolo|thresher|claim.?network)/i,
      `${rel} must not import other systems' code`)
  }
})

test('the magic-link form renders only on server-reported capability', () => {
  const signin = read('app/signin/page.tsx')
  assert.match(signin, /capabilities\.magicLinkSignIn \?/,
    'the form is gated on the session capability, never assumed')
  assert.match(signin, /If that address can sign in/,
    'acceptance copy is generic and does not reveal whether an address exists')
  assert.doesNotMatch(signin, /email (was|has been) sent/i,
    'nothing claims a send the server did not accept')
  assert.match(signin, /mode === 'synthetic'\s*\?\s*\(?\s*<SyntheticEntry/,
    'synthetic mode keeps the honest demo entry')
})

test('a nameless server session renders a neutral label, never "as null"', () => {
  const signin = read('app/signin/page.tsx')
  assert.match(signin, /displayName\?\.trim\(\)/,
    'the name is included only when a real nonempty display name exists')
  assert.match(signin, /'You are already signed in\.'/,
    'the neutral fallback exists')
  assert.doesNotMatch(signin, /signed in as \{session/,
    'no template interpolates a possibly-null name directly')
  const shell = read('components/AppShell.tsx')
  assert.match(shell, /: 'Signed in'\}?/,
    'the shell has the same neutral fallback')
})

test('disabled affordances say why, instead of pretending', () => {
  const signin = read('app/signin/page.tsx')
  assert.match(signin, /not built yet/i)
  const settings = read('app/home/[homeId]/settings/page.tsx')
  assert.match(settings, /not built yet/i)
  const documents = read('app/home/[homeId]/documents/page.tsx')
  assert.match(documents, /Uploads are not built/i)
})

test('photo plates are drawn and say so', () => {
  const plate = read('components/PhotoPlate.tsx')
  assert.match(plate, /drawn placeholder — no photo exists/)
  assert.doesNotMatch(plate, /<img|next\/image/, 'no image files exist to show')
})

// --- structure ---------------------------------------------------------------

test('every home-scoped screen exists', () => {
  for (const screen of [
    'app/home/[homeId]/page.tsx',
    'app/home/[homeId]/projects/page.tsx',
    'app/home/[homeId]/projects/[projectId]/page.tsx',
    'app/home/[homeId]/documents/page.tsx',
    'app/home/[homeId]/warranties/page.tsx',
    'app/home/[homeId]/timeline/page.tsx',
    'app/home/[homeId]/settings/page.tsx',
  ]) {
    assert.ok(appSources.includes(screen), `${screen} must exist`)
  }
})

test('the entry journey screens exist', () => {
  for (const screen of ['app/signin/page.tsx', 'app/onboarding/page.tsx', 'app/homes/page.tsx', 'app/homes/new/page.tsx']) {
    assert.ok(appSources.includes(screen), `${screen} must exist`)
  }
})

test('only the provider chooses the port implementation', () => {
  for (const rel of appSources) {
    if (rel.startsWith('lib/port') || rel.startsWith('lib/tests')) continue
    const content = read(rel)
    assert.doesNotMatch(content, /from '.*port\/synthetic/,
      `${rel} must consume the port via the provider, not the mock directly`)
  }
})

// --- platform neutrality -----------------------------------------------------

test('the route inventory is platform-neutral', () => {
  // The normalization must turn a Windows-style relative path into the POSIX
  // form the screen literals use — asserted with explicit backslash input so
  // Linux CI proves the Windows behaviour rather than merely not hitting it.
  assert.equal(toPosix('app\\home\\[homeId]\\page.tsx'), 'app/home/[homeId]/page.tsx')
  assert.equal(toPosix('lib\\tests\\presentation.test.ts'), 'lib/tests/presentation.test.ts')
  assert.equal(toPosix('app/signin/page.tsx'), 'app/signin/page.tsx', 'POSIX input passes through')
  // And the discovered inventory itself must already be normalized.
  for (const rel of appSources) {
    assert.ok(!rel.includes('\\'), `route inventory leaked a host separator: ${rel}`)
  }
  assert.ok(appSources.includes('app/signin/page.tsx'),
    'inventory entries are comparable against POSIX literals on every platform')
})
