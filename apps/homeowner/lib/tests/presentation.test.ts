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

test('new-home setup is a mobile-first progressive form, not a chatbot transcript', () => {
  const page = read('app/homes/new/page.tsx')
  assert.match(page, /Set up your home/)
  assert.match(page, /Step \{stage\.number\} of 4/,
    'the current stage and total are always visible')
  assert.match(page, /Skip optional details — leave them unrecorded/,
    'a homeowner can enter the product after only the required basics')
  assert.doesNotMatch(page, /Update it anytime|update it after the file opens|correct it later/,
    'setup never promises editing that the saved home file does not offer yet')
  assert.match(page, /editing saved details after the file opens is not available yet/,
    'the review step states the current saved-detail limitation')
  assert.match(page, /<ReviewCard[\s\S]*draft=\{draftFrom\(state\)\}[\s\S]*onEdit=\{editStep\}/,
    'review answers have a direct edit path')
  assert.doesNotMatch(page, /state\.transcript\.map/,
    'the deterministic machine must not be presented as a fake AI conversation')

  assert.match(css, /\.gate__card--setup\s*\{[^}]*max-width:\s*46rem/)
  assert.match(css, /\.setup-field input\[type='text'\][\s\S]*min-height:\s*54px/,
    'setup inputs are large enough to use on a phone')
  assert.match(css, /\.setup-option\s*\{[^}]*min-height:\s*62px/,
    'choice cards have generous touch targets')
  assert.match(css, /@media \(max-width: 42rem\)[\s\S]*\.setup-options\s*\{\s*grid-template-columns:\s*1fr/,
    'phone choices stack into one readable column')
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

test('browser and server-to-server network calls exist only in their sanctioned transports', () => {
  // Constructs, not words: a comment naming the fetch ban is not a fetch, and
  // a status flag honestly recording a missing connection is not a connection.
  // Browser calls stay in the same-origin JSON transport. The separate server
  // integrations are the authenticated Homesrolo-to-Jobrolo adapter and the
  // default-off, stateless OpenAI home-research adapter.
  const BROWSER_TRANSPORT = 'lib/port/transport.ts'
  const SERVER_TRANSPORT = 'lib/server/jobrolo-intake-client.ts'
  const AI_TRANSPORT = 'lib/server/home-research.ts'
  for (const rel of appSources) {
    const content = read(rel)
    if (rel === BROWSER_TRANSPORT) {
      assert.match(content, /credentials:\s*'same-origin'/, 'the transport is same-origin with cookies')
      assert.doesNotMatch(content, /https?:\/\//, 'the transport never carries an absolute URL')
      continue
    }
    if (rel === SERVER_TRANSPORT) {
      assert.match(content, /SignedJobroloIntakeClient/, 'the server transport is explicit and named')
      assert.match(content, /\/api\/integrations\/homesrolo\/v1\/project-intakes/,
        'the server transport pins one exact integration path')
      continue
    }
    if (rel === AI_TRANSPORT) {
      assert.match(content, /https:\/\/api\.openai\.com\/v1\/responses/,
        'AI research pins the official Responses endpoint')
      assert.match(content, /store:\s*false/, 'OpenAI response storage stays disabled')
      assert.match(content, /authorization:\s*`Bearer \$\{this\.#configuration\.apiKey\}`/,
        'the server adds the API key at the reviewed transport boundary')
      assert.doesNotMatch(content, /process\.env/,
        'the AI transport receives secrets from the one runtime seam')
      continue
    }
    assert.doesNotMatch(content, /\bfetch\s*\(/,
      `${rel} must not call fetch; only the reviewed transports may`)
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
  assert.doesNotMatch(transport, /authorization|bearer|refresh_token/i,
    'no authorization header or refresh credential crosses the browser seam')
  assert.match(transport, /path:\s*'\/api\/v1\/auth\/exchange'[\s\S]*body:\s*\{ access_token: accessToken \}/,
    'the one-time provider credential can cross only the exact same-origin exchange route')
})

test('no raw storage URLs or provider identifiers are projected into the UI', () => {
  for (const rel of appSources) {
    if (rel.startsWith('lib/tests')) continue // the tripwire may name its own targets
    if (rel.startsWith('lib/server') || rel.startsWith('app/api/')) continue
    const content = read(rel)
    assert.doesNotMatch(content, /storageObjectRef|storageUrl|signedUrl|s3:|gs:\/\//i,
      `${rel} must not project storage internals`)
  }
  const wire = read('lib/port/wire.ts')
  assert.doesNotMatch(wire, /storageUrl|signedUrl|providerObjectId/i,
    'the browser decoder accepts no provider URL or object identifier')
  assert.match(wire, /downloadHref:\s*`\/api\/v1\/homes\//,
    'artifact download links are derived from opaque refs and stay same-origin')
})

test('only the allowlisted homeowner-http.v1 routes and methods exist', () => {
  // One route file now serves both the authenticated list read and the strict
  // create-home command. The file inventory remains an allowlist.
  const ROUTE_ALLOWLIST = [
    'app/api/v1/auth/callback/route.ts',
    'app/api/v1/auth/exchange/route.ts',
    'app/api/v1/auth/magic-link/route.ts',
    'app/api/v1/auth/signout/route.ts',
    'app/api/v1/session/route.ts',
    'app/api/v1/homes/route.ts',
    'app/api/v1/homes/[homeRef]/route.ts',
    'app/api/v1/homes/[homeRef]/intake/route.ts',
    'app/api/v1/homes/[homeRef]/projects/route.ts',
    'app/api/v1/homes/[homeRef]/projects/[projectRef]/route.ts',
    'app/api/v1/homes/[homeRef]/projects/[projectRef]/quotes/route.ts',
    'app/api/v1/homes/[homeRef]/projects/[projectRef]/quotes/[quoteRef]/route.ts',
    'app/api/v1/homes/[homeRef]/projects/[projectRef]/submit-for-review/route.ts',
    'app/api/v1/homes/[homeRef]/roofing-projects/route.ts',
    'app/api/v1/homes/[homeRef]/artifacts/route.ts',
    'app/api/v1/homes/[homeRef]/artifacts/[artifactRef]/content/route.ts',
    'app/api/v1/homes/[homeRef]/photo-checkups/route.ts',
    'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/route.ts',
    'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/full/route.ts',
    'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/thumbnail/route.ts',
    'app/api/v1/homes/[homeRef]/research/route.ts',
  ]
  const found = appSources.filter(rel => /route\.(ts|tsx)$/.test(rel)).sort()
  assert.deepEqual(found, [...ROUTE_ALLOWLIST].sort(),
    'the route inventory must remain exactly the allowlisted paths')
  for (const rel of ROUTE_ALLOWLIST) {
    const content = read(rel)
    if (rel === 'app/api/v1/auth/callback/route.ts') {
      assert.match(content, /export async function GET/, `${rel} completes one magic link`)
      assert.match(content, /completeHomeownerMagicLink/, `${rel} only delegates to the auth boundary`)
    } else if (rel === 'app/api/v1/auth/exchange/route.ts') {
      assert.match(content, /export async function POST/, `${rel} exchanges one provider credential`)
      assert.match(content, /exchangeHomeownerProviderSession/, `${rel} only delegates to the auth boundary`)
    } else if (rel === 'app/api/v1/auth/magic-link/route.ts') {
      assert.match(content, /export async function POST/, `${rel} requests one magic link`)
      assert.match(content, /requestHomeownerMagicLink/, `${rel} only delegates to the auth boundary`)
    } else if (rel === 'app/api/v1/auth/signout/route.ts') {
      assert.match(content, /export async function POST/, `${rel} revokes one session`)
      assert.match(content, /signOutHomeowner/, `${rel} only delegates to the auth boundary`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/intake/route.ts') {
      assert.match(content, /export async function POST/, `${rel} serves the intake command`)
      assert.doesNotMatch(content, /export (async function|const) GET/,
        `${rel} must not expose an intake read`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/roofing-projects/route.ts') {
      assert.match(content, /export async function POST/, `${rel} serves only the roofing command`)
      assert.doesNotMatch(content, /export (async function|const) GET/,
        `${rel} must not expose a duplicate read surface`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/artifacts/route.ts') {
      assert.match(content, /export async function GET/, `${rel} serves the artifact list`)
      assert.match(content, /export async function POST/, `${rel} serves the bounded upload`)
      assert.match(content, /handleArtifactUpload/, `${rel} delegates upload policy to the server seam`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/artifacts/[artifactRef]/content/route.ts') {
      assert.match(content, /export async function GET/, `${rel} serves one private download`)
      assert.match(content, /handleArtifactDownload/, `${rel} delegates download policy to the server seam`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/photo-checkups/route.ts') {
      assert.match(content, /export async function GET/, `${rel} serves the bounded photo list`)
      assert.match(content, /export async function POST/, `${rel} serves one raw image upload`)
      assert.match(content, /handleCheckupPhotoUpload/,
        `${rel} delegates image policy to the isolated photo boundary`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/route.ts') {
      assert.match(content, /export async function DELETE/, `${rel} deletes one exact private photo`)
      assert.match(content, /handleCheckupPhotoDelete/,
        `${rel} delegates deletion to the isolated photo boundary`)
      assert.doesNotMatch(content, /export (async function|const) (GET|POST)/,
        `${rel} has no duplicate read or write surface`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/full/route.ts'
      || rel === 'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/thumbnail/route.ts') {
      assert.match(content, /export async function GET/, `${rel} serves one private derivative`)
      assert.match(content, /handleCheckupPhotoContent/,
        `${rel} delegates content authorization to the isolated photo boundary`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/projects/[projectRef]/submit-for-review/route.ts') {
      assert.match(content, /export async function POST/, `${rel} serves one consent-bound review submission`)
      assert.match(content, /submitProjectForHomesroloReview/,
        `${rel} delegates to the isolated server integration seam`)
      assert.doesNotMatch(content, /export (async function|const) GET/,
        `${rel} must not expose a read surface`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/research/route.ts') {
      assert.match(content, /export async function POST/, `${rel} serves one consent-bound research request`)
      assert.match(content, /handleHomeResearchRequest/,
        `${rel} delegates to the isolated server research boundary`)
      assert.doesNotMatch(content, /export (async function|const) GET/,
        `${rel} must not expose an address-bearing read surface`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/projects/route.ts') {
      assert.match(content, /export async function GET/, `${rel} serves the project list`)
      assert.match(content, /export async function POST/, `${rel} serves generic project creation`)
      assert.match(content, /handleHomeownerRequest/, `${rel} delegates both methods to the adapter`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/projects/[projectRef]/quotes/route.ts') {
      assert.match(content, /export async function GET/, `${rel} serves the private quote list`)
      assert.match(content, /export async function POST/, `${rel} serves strict quote creation`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/projects/[projectRef]/quotes/[quoteRef]/route.ts') {
      assert.match(content, /export async function POST/, `${rel} serves revision-backed quote saving`)
      assert.doesNotMatch(content, /export (async function|const) GET/,
        `${rel} must not add another quote read surface`)
    } else {
      assert.match(content, /export async function GET/, `${rel} serves GET`)
    }
    if (rel.startsWith('app/api/v1/auth/')) {
      // The three explicit authentication routes were checked above.
    } else if (rel === 'app/api/v1/homes/route.ts') {
      assert.match(content, /export async function POST/, `${rel} serves the create command`)
    } else if (rel !== 'app/api/v1/homes/[homeRef]/intake/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/roofing-projects/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/projects/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/artifacts/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/photo-checkups/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/projects/[projectRef]/quotes/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/projects/[projectRef]/quotes/[quoteRef]/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/projects/[projectRef]/submit-for-review/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/research/route.ts') {
      assert.doesNotMatch(content, /export (async function|const) POST/,
        `${rel} must not export POST`)
    }
    if (rel === 'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/route.ts') {
      assert.doesNotMatch(content, /export (async function|const) (PUT|PATCH|HEAD|OPTIONS)/,
        `${rel} exports only its exact delete mutation`)
    } else {
      assert.doesNotMatch(content, /export (async function|const) (PUT|PATCH|DELETE|HEAD|OPTIONS)/,
        `${rel} must export no generic mutation method`)
    }
    if (!rel.startsWith('app/api/v1/auth/')
      && rel !== 'app/api/v1/homes/[homeRef]/artifacts/[artifactRef]/content/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/full/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/thumbnail/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/projects/[projectRef]/submit-for-review/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/research/route.ts') {
      assert.match(content, /handleHomeownerRequest/, `${rel} only delegates to the adapter`)
    }
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
      if (rel === 'lib/server/runtime.ts') {
        assert.equal((content.match(/process\.env/g) ?? []).length, 1,
          'the runtime seam is the one server file allowed to read environment configuration')
      } else {
        assert.doesNotMatch(content, /process\.env/,
          `${rel} receives configuration through the runtime seam`)
      }
    }
  }
})

test('the browser shell does not import private contracts or other repositories', () => {
  // Imports, not mentions: PORT_IMPLEMENTATION_STATUS may honestly record that
  // no Jobrolo connection exists; what must never exist is code reaching one.
  for (const rel of appSources) {
    if (rel.startsWith('lib/server') || rel.startsWith('app/api/') || rel.startsWith('lib/tests')) continue
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

test('project review renders only on its exact server-reported capability', () => {
  const project = read('app/home/[homeId]/projects/[projectId]/page.tsx')
  assert.match(
    project,
    /!project\.isSynthetic\s*&&\s*project\.trade === 'Roofing'\s*&&\s*session\.state\.kind === 'signed_in'\s*&&\s*session\.state\.capabilities\.projectReview \? /,
    'the review form is fail-closed until the session reports projectReview',
  )
  assert.doesNotMatch(project, /capabilities\.sharing/,
    'generic sharing authority must not enable project review')
  assert.match(project, /previewProjectForReview/,
    'the homeowner first receives the exact server-derived disclosure')
  assert.match(project, /reviewedDisclosureDigest:\s*reviewPreview\.disclosureDigest/,
    'submission is bound to the digest the homeowner actually reviewed')
  assert.match(project, /Review the exact information going to Chance/,
    'the exact contact, home, project, and selected files are visibly reviewed')
  assert.match(project, /reviewPreview\.consentText/,
    'the server-pinned consent wording is shown at approval time')
  assert.match(project, /session\.state\.capabilities\.projectReviewAttachments && projectFiles\.length > 0/,
    'file selection is hidden unless the server reports the separate attachment capability')
  assert.match(project, /Your files stay in Homesrolo\./,
    'the zero-file posture tells the homeowner where saved files remain')
  assert.match(project, /no photos or documents are attached\./,
    'the homeowner is told that only the request crosses the handoff')
  assert.equal((project.match(
    /selectedArtifactRefs: attachmentHandoffEnabled \? selectedArtifacts : \[\]/g,
  ) ?? []).length, 2,
  'both preview and submit force an empty file list when attachment handoff is disabled')
})

test('roof proposal comparison is private, neutral, editable, and separate from Jobrolo', () => {
  const project = read('app/home/[homeId]/projects/[projectId]/page.tsx')
  const vault = read('components/RoofQuoteVault.tsx')
  const joined = `${project}\n${vault}`
  assert.match(project, /uploadsEnabled\s*\?\s*port\.listDocuments\(homeId\)/,
    'the disabled upload capability makes zero artifact-list requests')
  assert.match(project, /session\.state\.capabilities\.projectQuotes/,
    'the proposal vault is gated independently from general persistence')
  assert.match(project, /sessionReady\s*&&\s*!projectQuotesEnabled/,
    'the page does not flash an unavailable quote state while session capabilities load')
  assert.match(project, /Private uploads are unavailable right now/,
    'the capability-off state is visible and truthful')
  assert.match(vault, /Scope only—not a price score/)
  assert.match(vault, /Homesrolo does not estimate this roof, rank proposals/)
  assert.match(vault, /Not reviewed/)
  assert.match(vault, /Not stated/)
  assert.match(vault, /valleys/)
  assert.match(vault, /penetrations/)
  assert.match(vault, /expectedRevision/,
    'saved classifications can be corrected without overwriting another session')
  assert.match(vault, /reopen the record before making a correction/,
    'a revision conflict invalidates the stale full-replacement draft')
  for (const visibleField of ['Proposal date', 'Linked original', 'General notes']) {
    assert.match(vault, new RegExp(visibleField), `${visibleField} is visible outside edit mode`)
  }
  assert.match(vault, /aria-label={`Edit proposal record:/,
    'each edit control names the proposal it changes')
  assert.match(vault, /These classifications and notes stay in Homesrolo/,
    'structured quote metadata never implies Jobrolo disclosure')
  assert.match(vault, /Nothing was sent to Jobrolo or a contractor/,
    'a failed local save never implies cross-system delivery')
  assert.doesNotMatch(joined, /fair.?price|overpriced|best proposal|recommended proposal|priceScore/i)
  assert.doesNotMatch(vault, /submitProjectForReview|selectedArtifactRefs|jobroloTenant/i,
    'the quote component has no Jobrolo transport or handoff authority')
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
  assert.match(signin, /Email sign-in is unavailable in the demo/i)
  assert.match(signin, /This local demo uses only sample data/i)
  const settings = read('app/home/[homeId]/settings/page.tsx')
  assert.match(settings, /not built yet/i)
  const documents = read('app/home/[homeId]/documents/page.tsx')
  assert.match(documents, /Uploads are unavailable/i)
})

test('settings reports session capabilities, not internal implementation flags', () => {
  const settings = read('app/home/[homeId]/settings/page.tsx')
  assert.match(settings, /session\.capabilities/,
    'availability is derived from the exact capabilities returned for this session')
  assert.doesNotMatch(settings, /PORT_IMPLEMENTATION_STATUS/,
    'foundation implementation status cannot be presented as runtime availability')
  assert.match(settings, /Home research assistant/)
  assert.match(settings, /Private file uploads/)
  assert.match(settings, /available \? 'Available' : 'Off'/,
    'each runtime capability has a plain-language availability state')
})

test('the authenticated home is a whole-home Rolodex, not a roofing dashboard', () => {
  const shell = read('components/AppShell.tsx')
  const dashboard = read('app/home/[homeId]/page.tsx')
  const library = read('app/home/[homeId]/documents/page.tsx')

  assert.match(shell, /label: 'Home library', tabLabel: 'Library'/,
    'desktop and phone navigation name the library at the right size')
  assert.match(shell, /label: 'Events & care', tabLabel: 'Care'/,
    'routine home care is a first-class destination')
  assert.match(dashboard, /Build the Rolodex for the whole home\./)
  assert.match(dashboard, /roof, HVAC, plumbing, electrical, interior, exterior, yard, pest/,
    'the dashboard opens on the whole property')
  assert.doesNotMatch(dashboard, /Need roof work\?|Start a roof project|Open roof projects/,
    'roofing is never presented as the dashboard default')

  for (const area of [
    'Photos & home checkups',
    'Insurance',
    'Projects & upgrades',
    'Inventory & manuals',
    'Warranties',
    'Taxes, value & sale',
    'Events & maintenance',
    'People & service history',
  ]) {
    assert.match(library, new RegExp(area.replace('&', '\\&')),
      `${area} has an honest place in the library map`)
  }
  assert.match(library, /state\.status === 'ready' \? state\.value : \[\]/,
    'file and photo rows can come only from the private port response')
  assert.match(library, /record\.kind === 'photo_set'/,
    'returned photos have a dedicated condition-record surface')
  assert.match(library, /session\.state\.capabilities\.uploads/,
    'the add-file form remains fail-closed on the exact upload capability')
  assert.match(library, /Uploads are unavailable right now/,
    'the production capability-off state stays visible and specific')
})

test('seasonal photo checkups are mobile-first, exact-view, and independently gated', () => {
  const library = read('app/home/[homeId]/documents/page.tsx')
  const checkups = read('components/PhotoCheckups.tsx')
  const remote = read('lib/port/remote.ts')
  const wire = read('lib/port/wire.ts')
  const transport = read('lib/port/transport.ts')

  assert.match(library, /session\.state\.capabilities\.photoCheckups/,
    'the image-only beta has its own server-reported capability')
  assert.match(library, /session\.state\.capabilities\.uploads/,
    'generic documents remain behind their separate capability')
  assert.match(checkups, /enabled\s*\n\s*\? port\.listPhotoCheckups\(homeRef\)\s*\n\s*:\s*Promise\.resolve/,
    'capability false makes no photo-list port call')
  assert.match(library, /key=\{`\$\{homeId\}:\$\{photoCheckupsEnabled \? 'enabled' : 'disabled'\}`\}/,
    'home, session, or capability changes remount the private photo surface before its first real read')

  for (const value of [
    'front_exterior', 'rear_exterior', 'roofline', 'attic', 'ceilings',
    'hvac', 'water_heater', 'foundation', 'gutters', 'other',
  ]) {
    assert.match(checkups, new RegExp(`value: '${value}'`), `${value} is one repeatable view`)
  }
  assert.match(checkups, /type="date"[\s\S]*max=\{today\}/,
    'observation date defaults locally and cannot select a future day')
  assert.match(checkups, /accept="image\/jpeg,image\/png"/,
    'the picker offers only the two accepted image formats')
  assert.doesNotMatch(checkups, /capture="environment"/,
    'mobile homeowners can choose existing photos instead of being forced into the camera')
  assert.match(checkups, /HEIC is not accepted[\s\S]*JPEG copy/,
    'unsupported iPhone photos have honest conversion guidance')
  assert.match(checkups, /commandRef\.current \?\?= mintCommandRef\(\)/,
    'one upload attempt keeps its idempotency ref across a retry')
  assert.match(checkups, /Try the same upload again/,
    'the retry affordance is explicit and preserves the selected File')
  assert.match(checkups, /Repeatable view name[\s\S]*maxLength=\{80\}/,
    'each photo has a required homeowner-named repeatable spot')
  assert.match(checkups, /aria-busy=\{uploadPending\}/,
    'the form exposes its frozen upload state')
  assert.ok((checkups.match(/disabled=\{uploadPending\}/g) ?? []).length >= 6,
    'date, area, view, note, file, form toggle, and compare toggle freeze while uploading')
  assert.match(checkups, /uploadGeneration\.current !== generation/,
    'a late upload completion cannot overwrite a newer attempt')
  assert.match(checkups, /failure\.action !== 'same_retry'[\s\S]*commandRef\.current = null/,
    'only retryable provider outcomes retain the exact command reference')

  assert.match(checkups, /`\$\{photo\.area\}\\u0000\$\{photo\.viewLabel\}`/,
    'gallery grouping and comparison require the exact area plus repeatable view name')
  assert.match(checkups, /const latest = group\.photos\[0\][\s\S]*const previous = group\.photos\[1\]/,
    'comparison is pinned to the latest two photos in one view')
  assert.match(checkups, /loading="lazy"/,
    'private thumbnails load lazily')
  assert.match(checkups, /href=\{photo\.fullUrl\}[\s\S]*Open full image/,
    'a full derivative opens only after an explicit homeowner action')
  assert.match(checkups, /aria-label=\{`Delete \$\{group\.viewLabel\}, \$\{group\.areaLabel\} photo from/,
    'every repeated delete control names the photo date, area, and repeatable view')
  assert.match(checkups, /We could not confirm whether this photo was deleted[\s\S]*safe to try deleting it again/,
    'an uncertain delete never claims success and explains safe retry')
  assert.match(checkups, /ref=\{keepPhotoRef\}/,
    'delete confirmation receives keyboard focus')
  assert.match(checkups, /does not inspect or diagnose the home/,
    'the record never poses as an AI or professional inspection')

  const photoTransport = transport.slice(transport.indexOf('export const fetchPhotoCheckupUploadTransport'))
  assert.match(photoTransport, /body:\s*request\.file/,
    'the photo itself is the raw request body')
  assert.doesNotMatch(photoTransport, /new FormData\(/,
    'the photo route never transmits a multipart filename')
  for (const header of [
    'x-homesrolo-command-ref', 'x-homesrolo-observed-on',
    'x-homesrolo-photo-area', 'x-homesrolo-view-label', 'x-homesrolo-caption',
  ]) {
    assert.match(photoTransport, new RegExp(`'${header}'`), `${header} is explicit`)
  }
  assert.match(remote, /MAX_PHOTO_INPUT_BYTES = 10 \* 1024 \* 1024/)
  assert.match(wire, /decoded\.fullUrl !== `\$\{base\}\/full`[\s\S]*decoded\.thumbnailUrl !== `\$\{base\}\/thumbnail`/,
    'server-supplied image URLs must match their own exact home and photo refs')
  assert.match(wire, /boundedArray\(decodePhotoCheckup, 0, 100\)/,
    'the response list cannot exceed the per-home quota')
})

test('whole-home project history never invents a category or work date', () => {
  const projects = read('app/home/[homeId]/projects/page.tsx')
  const detail = read('app/home/[homeId]/projects/[projectId]/page.tsx')
  const wire = read('lib/port/wire.ts')

  assert.match(projects, /useState<ProjectCategory \| null>\(\(\) => carriedIntent \? 'roofing' : null\)/,
    'ordinary projects require the homeowner to choose a category')
  assert.match(projects, /disabled=\{busy \|\| !category \|\| !title\.trim\(\)\}/,
    'the form cannot submit without that category')
  assert.match(projects, /Exact completion date \(optional\)/)
  assert.match(projects, /Leave this blank unless you can support the exact day/)
  assert.match(projects, /project\.performedOn \?\? 'Date not recorded'/)
  assert.match(detail, /<dt>Work date<\/dt><dd>\{project\.performedOn \?\? 'Not recorded'\}<\/dd>/)
  assert.match(wire, /performedOn: decoded\.occurredOn/)
  assert.doesNotMatch(wire, /performedOn:[^\n]*createdAt/,
    'record creation time is never relabeled as the work date')
})

test('capability-off library, care, and warranty surfaces are intentional states, not errors', () => {
  const library = read('app/home/[homeId]/documents/page.tsx')
  const care = read('app/home/[homeId]/timeline/page.tsx')
  const warranties = read('app/home/[homeId]/warranties/page.tsx')

  assert.match(library, /libraryReadable[\s\S]*\? port\.listDocuments\(homeId\)[\s\S]*Promise\.resolve/,
    'the Library does not call the disabled private-file route')
  assert.match(care, /Care scheduling is not connected yet/)
  assert.match(care, /Project history is live now/)
  assert.match(warranties, /Warranty storage is not open yet/)
  assert.match(warranties, /Homesrolo is not holding a warranty file/)
})

test('home research is capability-gated, consent-bound, and never presented as a saved fact', () => {
  const assistant = read('components/HomeResearchAssistant.tsx')

  assert.match(
    assistant,
    /session\.state\.kind !== 'signed_in' \|\| !session\.state\.capabilities\.homeResearch/,
    'the research controls fail closed unless the exact signed-in capability is live',
  )
  assert.match(assistant, /consentToResearchThisAddressOnline:\s*true/,
    'every request carries the explicit consent literal required by the server')
  assert.match(
    assistant,
    /I agree to send this street address,[\s\S]*OpenAI[\s\S]*generally kept up to 30 days[\s\S]*retained longer/,
    'the checkbox names the processor, normal retention, and documented exceptions',
  )
  assert.match(assistant, /setMessage\(event\.target\.value\)[\s\S]*setConsent\(false\)/,
    'changing the exact question invalidates earlier consent')
  assert.match(assistant, /checked=\{consent\}[\s\S]*required/,
    'consent is an actual required checkbox rather than passive disclosure copy')
  assert.match(assistant, /Draft facts to check/)
  assert.match(assistant, /These are not in your home record\./,
    'model output stays visibly separate from the durable home record')
  assert.doesNotMatch(assistant, /\b(?:save|saved|verified|verification)\b/i,
    'the read-only assistant offers no save or verification language')
})

test('home research chat is accessible, link-safe, and frozen while one request is pending', () => {
  const assistant = read('components/HomeResearchAssistant.tsx')

  assert.match(
    assistant,
    /role="log"[\s\S]*aria-live="polite"[\s\S]*aria-relevant="additions"/,
    'new research exchanges are announced as additions to a polite chat log',
  )
  assert.match(assistant, /aria-busy=\{pendingQuestion !== null\}/,
    'the conversation exposes its in-flight state')
  assert.match(
    assistant,
    /className="research-pending" role="status" aria-live="polite"/,
    'the honest search progress message is announced without stealing focus',
  )
  assert.match(
    assistant,
    /<a href=\{url\} target="_blank" rel="noopener noreferrer">/,
    'public citations cannot retain an opener or send a referrer to their destination',
  )
  assert.match(assistant, /\(opens in a new tab\)/,
    'source-link behavior is also named for screen-reader users')
  assert.doesNotMatch(assistant, /dangerouslySetInnerHTML/,
    'model and source text is rendered as escaped React text only')
  assert.equal(
    (assistant.match(/disabled=\{pendingQuestion !== null\}/g) ?? []).length,
    3,
    'address, question, and consent controls are all frozen while a request is running',
  )
})

test('the dashboard places the research assistant in the whole-home opening flow', () => {
  const dashboard = read('app/home/[homeId]/page.tsx')

  assert.match(dashboard, /import \{ HomeResearchAssistant \}/,
    'the dashboard owns the homeowner-facing research surface')
  assert.match(
    dashboard,
    /<section className="roof-callout"[\s\S]*<HomeResearchAssistant homeRef=\{homeId\}[\s\S]*<dl className="cardgrid/,
    'research follows the whole-home introduction and precedes the record counts',
  )
})

test('one bounded roofing intent continues through the existing homeowner flow', () => {
  const signin = read('app/signin/page.tsx')
  const homes = read('app/homes/page.tsx')
  const newHome = read('app/homes/new/page.tsx')
  const projects = read('app/home/[homeId]/projects/page.tsx')
  for (const content of [signin, homes, newHome]) {
    assert.match(content, /withRoofingIntent/)
    assert.match(content, /roofingIntent/)
  }
  assert.match(projects, /carriedIntent/)
  assert.match(projects, /Nothing is sent to a contractor unless you choose that later\./)
  assert.doesNotMatch([signin, homes, newHome, projects].join('\n'), /insurance_claim/)
})

test('the inspection entry explains the private boundary before sign in', () => {
  const signin = read('app/signin/page.tsx')
  assert.match(signin, /intent === 'inspection'/)
  assert.match(signin, /Start your private roof record/)
  assert.match(signin, /does not schedule a Roof Watch visit or send your request to a contractor/)
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
