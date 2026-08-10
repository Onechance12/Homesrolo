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

test('the demo banner is part of the shell, not optional per page', () => {
  const shell = read('components/AppShell.tsx')
  assert.match(shell, /SYNTHETIC_NOTICE/)
  assert.match(shell, /demo-banner/)
})

test('the app never claims to be indexed', () => {
  const layout = read('app/layout.tsx')
  assert.match(layout, /robots:\s*\{\s*index:\s*false/)
})

test('no source file wires a network or a real backend', () => {
  // Constructs, not words: a comment naming the fetch ban is not a fetch, and
  // a status flag honestly recording a missing connection is not a connection.
  for (const rel of appSources) {
    const content = read(rel)
    assert.doesNotMatch(content, /\bfetch\s*\(/, `${rel} must not call fetch`)
    assert.doesNotMatch(content, /new\s+(XMLHttpRequest|WebSocket)\s*\(/, `${rel} must not open a connection`)
    assert.doesNotMatch(content, /process\.env\.(DATABASE|SECRET|API_KEY|TOKEN)/, `${rel} must not read secrets`)
  }
})

test('no API routes, server actions, or middleware exist in the shell', () => {
  for (const rel of appSources) {
    assert.doesNotMatch(rel, /route\.(ts|tsx)$/, 'no API routes in the Phase 1 shell')
    assert.doesNotMatch(rel, /middleware\.(ts|tsx)$/, 'no middleware in the Phase 1 shell')
    const content = read(rel)
    assert.doesNotMatch(content, /['"]use server['"]/, `${rel} must not declare a server action`)
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
