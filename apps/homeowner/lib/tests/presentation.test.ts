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

function customProperty(source: string, name: string): string {
  const match = source.match(new RegExp(`--${name}:\\s*([^;]+);`))
  assert.ok(match?.[1], `--${name} must be declared`)
  return match[1].trim()
}

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
  assert.match(page, /Where do you need help\?/)
  assert.match(page, /Step \{reviewing \? 2 : 1\} of 2/,
    'the short setup and review stages are always visible')
  assert.match(page, /Street address \(required\)[\s\S]*ZIP code \(required\)/,
    'the form starts one private home workspace from an exact property address')
  assert.doesNotMatch(page, /Home name \(required\)/,
    'a homeowner is not forced to name the property before getting help')
  assert.match(page, /function homeNameFromForm[\s\S]*My home/,
    'the required internal label is derived honestly from the address')
  assert.match(page, /showOptional[\s\S]*Add optional details/,
    'home type, age, and systems stay behind an optional disclosure')
  assert.match(page, /finishOptionalLater\(next\)/,
    'omitting optional answers produces a complete, explicit intake')
  assert.match(page, /Not recorded/,
    'omitted facts are shown honestly instead of being guessed')
  assert.match(page, /port\.updateHomeRecord\(homeRef/,
    'the address and saved facts use the revision-backed Home Record command')
  assert.match(page, /<ReviewCard draft=\{draftFrom\(state\)\} address=\{form\} \/>/,
    'the saved intake draft is rendered for review before creation')
  assert.match(page, /← Edit details/,
    'the review step has one clear route back to the editable form')
  assert.doesNotMatch(page, /state\.transcript\.map/,
    'the deterministic machine must not be presented as a fake AI conversation')
  assert.doesNotMatch(page, /stageFor|questionFor|choicesFor/,
    'the page no longer renders the intake machine as a question-by-question chat')

  assert.match(css, /\.gate__card--setup\s*\{[^}]*max-width:\s*46rem/)
  assert.match(css, /@media \(max-width: 42rem\)[\s\S]*\.gate__card--setup\s*\{/,
    'the setup card has an explicit phone layout')
})

test('the shell has a language, a skip link, and a main landmark', () => {
  const layout = read('app/layout.tsx')
  assert.match(layout, /<html lang="en">/)
  assert.match(layout, /className="skip-link"/)
  const shell = read('components/AppShell.tsx')
  assert.match(shell, /<main id="main" tabIndex=\{-1\}/)
  const icons = read('components/icons.tsx')
  assert.match(icons, /M48\.6 53\.4A25 25 0 1 1 56\.5 34/,
    'the homeowner app uses the same continuous home-loop mark as Homesrolo.com')
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
  assert.match(layout, /referrer:\s*'no-referrer'/,
    'opaque entry context is never sent as a referrer')
})

test('browser and server-to-server network calls exist only in their sanctioned transports', () => {
  // Constructs, not words: a comment naming the fetch ban is not a fetch, and
  // a status flag honestly recording a missing connection is not a connection.
  // Browser calls stay in the same-origin JSON transport. The separate server
  // integrations are the authenticated Homesrolo-to-Jobrolo adapter and the
  // default-off OpenAI research and private organizer adapters.
  const BROWSER_TRANSPORT = 'lib/port/transport.ts'
  const SERVER_TRANSPORT = 'lib/server/jobrolo-intake-client.ts'
  const HANDOFF_TRANSPORT = 'lib/server/jobrolo-handoff-client.ts'
  const AI_TRANSPORT = 'lib/server/home-research.ts'
  const HOME_ASSISTANT_TRANSPORT = 'lib/server/home-assistant.ts'
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
    if (rel === HANDOFF_TRANSPORT) {
      assert.match(content, /SignedJobroloHandoffClient/,
        'the handoff transport is explicit and named')
      assert.match(content, /project-handoffs\/\$\{shareId\}\/claim/,
        'the handoff transport pins the reviewed claim path')
      assert.match(content, /Homesrolo-Handoff-HMAC/,
        'the handoff transport authenticates every request')
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
    if (rel === HOME_ASSISTANT_TRANSPORT) {
      assert.match(content, /https:\/\/api\.openai\.com\/v1\/responses/,
        'Rolo pins the official Responses endpoint')
      assert.match(content, /store:\s*false/, 'Rolo disables provider response storage')
      assert.match(content, /Nothing is saved until you review and approve it/,
        'the organizer produces reviewable drafts rather than direct writes')
      assert.doesNotMatch(content, /process\.env/,
        'the organizer receives secrets from the one runtime seam')
      continue
    }
    assert.doesNotMatch(content, /\bfetch\s*\(/,
      `${rel} must not call fetch; only the reviewed transports may`)
    assert.doesNotMatch(content, /new\s+(XMLHttpRequest|WebSocket)\s*\(/, `${rel} must not open a connection`)
    assert.doesNotMatch(content, /process\.env\.(DATABASE|SECRET|API_KEY|TOKEN)/, `${rel} must not read secrets`)
  }
})

test('contractor handoffs stay capability-gated, consented, and free of browser authority', () => {
  const page = read('app/home/[homeId]/documents/page.tsx')
  const component = read('components/HomeRecordHandoffs.tsx')
  const boundary = read('lib/server/home-record-handoff-http.ts')
  const runtime = read('lib/server/runtime.ts')
  assert.match(page, /session\.state\.capabilities\.homeRecordHandoffs/)
  assert.match(page, /handoffsEnabled[\s\S]*<HomeRecordHandoffs homeId=\{homeId\} entryShareId=\{entryShareId\} \/>/)
  assert.equal((component.match(/claimHomeRecordHandoff/g) ?? []).length, 1,
    'one explicit handler owns the only claim call')
  assert.match(component, /async function claimEntryHandoff\(\)[\s\S]*port\.claimHomeRecordHandoff/)
  assert.match(component, /onClick=\{\(\) => void claimEntryHandoff\(\)\}/,
    'a deliberate button click is the only claim trigger')
  for (const effect of component.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[[^\]]*\]\)/g)) {
    assert.doesNotMatch(effect[1] ?? '', /claimHomeRecordHandoff/,
      'render effects may list received handoffs but never claim a link')
  }
  assert.match(component, /active\.acceptanceText/,
    'the signed acceptance statement is shown beside the consent control')
  assert.match(component, /const completionRecord = active\?\.items\[0\][\s\S]*selectedArtifactRefs: \[completionRecord\.artifactRef\]/,
    'acceptance submits only the one decoded completion PDF')
  assert.match(component, /this exact contractor-issued completion PDF is safety-checked/)
  assert.match(component, /Completion record details/)
  assert.match(component, /This PDF cannot be opened before you accept it\./)
  for (const fixedContent of [
    'Contractor business display name',
    'Completed status',
    'Recorded start date',
    'Recorded completion date',
    'Issue date',
  ]) assert.match(component, new RegExp(fixedContent))
  assert.match(component,
    /does not include raw photos, raw documents, invoices, warranties, claims, or measurements/)
  assert.match(component, /Accept only if you recognize the sender and the link that brought you here/)
  assert.match(component, /Download accepted completion records/,
    'the handoff-only ZIP is not mislabeled as the complete Home Record')
  assert.match(component, /Check whether this one-job record belongs with this Home Record/,
    'the pre-claim prompt does not claim the link matches a home')
  const claimHandler = component.slice(
    component.indexOf('async function claimEntryHandoff'),
    component.indexOf('async function openHandoff'),
  )
  const failedClaim = claimHandler.slice(
    claimHandler.indexOf('if (!result.ok)'),
    claimHandler.indexOf('claimedEntry.current'),
  )
  assert.doesNotMatch(failedClaim, /clearHandoffFromAddressBar/,
    'a wrong-home or transient result cannot destroy a valid link')
  assert.match(claimHandler, /showPreview\(result\.value\)[\s\S]*clearHandoffFromAddressBar\(\)/,
    'the opaque query is cleared only after the exact preview succeeds')
  assert.match(component, /Choose a different home/)
  assert.doesNotMatch(component, /coming soon/i)
  assert.match(boundary, /claimExactShare/,
    'the HTTP boundary may activate only one explicit share through its injected controller')
  assert.doesNotMatch(boundary, /\.claim\(|recipientRef|principalRef/,
    'the HTTP boundary cannot choose recipient or principal authority')
  assert.match(runtime,
    /claimExactShare:[\s\S]*claimForController\([\s\S]*configuredRecipientRef/,
    'runtime closes over the fixed recipient ref before exposing exact-share activation')
  assert.match(runtime,
    /readJobroloIntakeCredentialResidue\(environment\)[\s\S]*state !== 'invalid'[\s\S]*homeRecordHandoffActivationCredentialsSeparated/,
    'activation checks even disabled or partial prior-intake credential residue')
  assert.match(runtime, /homeRecordHandoffReleaseEnvironmentAllowed\(environment\.NODE_ENV\)/,
    'the release-owned production interlock participates in runtime activation')
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
    if (['lib/port/transport.ts', 'lib/port/remote.ts', 'lib/port/wire.ts'].includes(rel)) continue
    const content = read(rel)
    assert.doesNotMatch(content, /storageObjectRef|storageUrl|signedUrl|s3:|gs:\/\//i,
      `${rel} must not project storage internals`)
  }
  const wire = read('lib/port/wire.ts')
  assert.match(wire, /homesrolo-homeowner-dev-uploads[\s\S]*url\.pathname !== expectedPath/,
    'the transient upload ticket is accepted only for the exact private bucket and key')
  assert.doesNotMatch(read('lib/port/types.ts'), /signedUrl|storageObjectRef|providerObjectId/i,
    'no signed URL or provider identifier enters the public UI data port')
  assert.match(wire, /downloadHref:\s*`\/api\/v1\/homes\//,
    'artifact download links are derived from opaque refs and stay same-origin')
})

test('only the allowlisted homeowner-http.v1 routes and methods exist', () => {
  // One route file now serves both the authenticated list read and the strict
  // create-home command. The file inventory remains an allowlist.
  const ROUTE_ALLOWLIST = [
    'app/api/v1/auth/callback/route.ts',
    'app/api/v1/auth/email-code/route.ts',
    'app/api/v1/auth/email-code/verify/route.ts',
    'app/api/v1/auth/exchange/route.ts',
    'app/api/v1/auth/magic-link/route.ts',
    'app/api/v1/auth/signout/route.ts',
    'app/api/v1/session/route.ts',
    'app/api/v1/homes/route.ts',
    'app/api/v1/homes/[homeRef]/route.ts',
    'app/api/v1/homes/[homeRef]/record/route.ts',
    'app/api/v1/homes/[homeRef]/intake/route.ts',
    'app/api/v1/homes/[homeRef]/projects/route.ts',
    'app/api/v1/homes/[homeRef]/projects/[projectRef]/route.ts',
    'app/api/v1/homes/[homeRef]/projects/[projectRef]/update/route.ts',
    'app/api/v1/homes/[homeRef]/projects/[projectRef]/activity/route.ts',
    'app/api/v1/homes/[homeRef]/projects/[projectRef]/items/route.ts',
    'app/api/v1/homes/[homeRef]/projects/[projectRef]/quotes/route.ts',
    'app/api/v1/homes/[homeRef]/projects/[projectRef]/quotes/[quoteRef]/route.ts',
    'app/api/v1/homes/[homeRef]/projects/[projectRef]/submit-for-review/route.ts',
    'app/api/v1/homes/[homeRef]/roofing-projects/route.ts',
    'app/api/v1/homes/[homeRef]/artifacts/route.ts',
    'app/api/v1/homes/[homeRef]/artifacts/[artifactRef]/complete/route.ts',
    'app/api/v1/homes/[homeRef]/artifacts/[artifactRef]/content/route.ts',
    'app/api/v1/homes/[homeRef]/artifacts/[artifactRef]/preview/route.ts',
    'app/api/v1/homes/[homeRef]/photo-checkups/route.ts',
    'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/route.ts',
    'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/full/route.ts',
    'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/thumbnail/route.ts',
    'app/api/v1/homes/[homeRef]/research/route.ts',
    'app/api/v1/homes/[homeRef]/assistant/route.ts',
    'app/api/v1/homes/[homeRef]/handoffs/route.ts',
    'app/api/v1/homes/[homeRef]/handoffs/[shareId]/route.ts',
    'app/api/v1/homes/[homeRef]/handoffs/[shareId]/claim/route.ts',
    'app/api/v1/homes/[homeRef]/handoffs/[shareId]/accept/route.ts',
    'app/api/v1/homes/[homeRef]/handoffs/[shareId]/reject/route.ts',
    'app/api/v1/homes/[homeRef]/home-record/export/route.ts',
  ]
  const found = appSources.filter(rel => /route\.(ts|tsx)$/.test(rel)).sort()
  assert.deepEqual(found, [...ROUTE_ALLOWLIST].sort(),
    'the route inventory must remain exactly the allowlisted paths')
  for (const rel of ROUTE_ALLOWLIST) {
    const content = read(rel)
    if (rel.endsWith('/handoffs/[shareId]/claim/route.ts')
      || rel.endsWith('/handoffs/[shareId]/accept/route.ts')
      || rel.endsWith('/handoffs/[shareId]/reject/route.ts')) {
      assert.match(content, /export async function POST/, `${rel} serves one exact decision`)
      assert.doesNotMatch(content, /export (async function|const) GET/,
        `${rel} exposes no decision read`)
      assert.match(content, /handleHomeRecordHandoffHttp/,
        `${rel} delegates to the isolated handoff boundary`)
    } else if (rel.includes('/handoffs/') || rel.endsWith('/handoffs/route.ts')
      || rel.endsWith('/home-record/export/route.ts')) {
      assert.match(content, /export async function GET/, `${rel} serves one private handoff read`)
      assert.doesNotMatch(content, /export (async function|const) POST/,
        `${rel} exposes no mutation`)
      assert.match(content, /handleHomeRecordHandoffHttp/,
        `${rel} delegates to the isolated handoff boundary`)
    } else if (rel === 'app/api/v1/auth/callback/route.ts') {
      assert.match(content, /export async function GET/, `${rel} completes one magic link`)
      assert.match(content, /completeHomeownerMagicLink/, `${rel} only delegates to the auth boundary`)
    } else if (rel === 'app/api/v1/auth/exchange/route.ts') {
      assert.match(content, /export async function POST/, `${rel} exchanges one provider credential`)
      assert.match(content, /exchangeHomeownerProviderSession/, `${rel} only delegates to the auth boundary`)
    } else if (rel === 'app/api/v1/auth/email-code/route.ts') {
      assert.match(content, /export async function POST/, `${rel} requests one email code`)
      assert.match(content, /requestHomeownerEmailCode/, `${rel} only delegates to the auth boundary`)
    } else if (rel === 'app/api/v1/auth/email-code/verify/route.ts') {
      assert.match(content, /export async function POST/, `${rel} verifies one email code`)
      assert.match(content, /verifyHomeownerEmailCode/, `${rel} only delegates to the auth boundary`)
    } else if (rel === 'app/api/v1/auth/magic-link/route.ts') {
      assert.match(content, /export async function POST/, `${rel} requests one magic link`)
      assert.match(content, /requestHomeownerMagicLink/, `${rel} only delegates to the auth boundary`)
    } else if (rel === 'app/api/v1/auth/signout/route.ts') {
      assert.match(content, /export async function POST/, `${rel} revokes one session`)
      assert.match(content, /signOutHomeowner/, `${rel} only delegates to the auth boundary`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/record/route.ts') {
      assert.match(content, /export async function GET/, `${rel} serves one controller-only record read`)
      assert.match(content, /export async function POST/, `${rel} serves one revision-backed record update`)
      assert.match(content, /handleHomeownerRequest/,
        `${rel} delegates both methods to the exact authorization boundary`)
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
    } else if (rel === 'app/api/v1/homes/[homeRef]/artifacts/[artifactRef]/preview/route.ts') {
      assert.match(content, /export async function GET/, `${rel} serves one private image preview`)
      assert.match(content, /handleArtifactPreview/, `${rel} delegates preview policy to the server seam`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/artifacts/[artifactRef]/complete/route.ts') {
      assert.match(content, /export async function POST/, `${rel} completes one reserved upload`)
      assert.match(content, /handleArtifactUploadCompletion/,
        `${rel} delegates completion policy to the server seam`)
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
    } else if (rel === 'app/api/v1/homes/[homeRef]/assistant/route.ts') {
      assert.match(content, /export async function POST/, `${rel} serves one private assistant turn`)
      assert.match(content, /handleHomeAssistantRequest/,
        `${rel} delegates to the isolated organizer boundary`)
      assert.doesNotMatch(content, /export (async function|const) GET/,
        `${rel} exposes no transcript read`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/projects/route.ts') {
      assert.match(content, /export async function GET/, `${rel} serves the project list`)
      assert.match(content, /export async function POST/, `${rel} serves generic project creation`)
      assert.match(content, /handleHomeownerRequest/, `${rel} delegates both methods to the adapter`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/projects/[projectRef]/update/route.ts') {
      assert.match(content, /export async function POST/, `${rel} serves one revision-backed update`)
      assert.doesNotMatch(content, /export (async function|const) GET/,
        `${rel} must not expose a duplicate read surface`)
    } else if (rel === 'app/api/v1/homes/[homeRef]/projects/[projectRef]/activity/route.ts'
      || rel === 'app/api/v1/homes/[homeRef]/projects/[projectRef]/items/route.ts') {
      assert.match(content, /export async function GET/, `${rel} serves the exact-project list`)
      assert.match(content, /export async function POST/, `${rel} serves the bounded command`)
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
    } else if (rel !== 'app/api/v1/homes/[homeRef]/record/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/intake/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/roofing-projects/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/projects/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/projects/[projectRef]/update/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/projects/[projectRef]/activity/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/projects/[projectRef]/items/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/artifacts/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/artifacts/[artifactRef]/complete/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/photo-checkups/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/projects/[projectRef]/quotes/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/projects/[projectRef]/quotes/[quoteRef]/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/projects/[projectRef]/submit-for-review/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/research/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/assistant/route.ts'
      && !rel.endsWith('/handoffs/[shareId]/claim/route.ts')
      && !rel.endsWith('/handoffs/[shareId]/accept/route.ts')
      && !rel.endsWith('/handoffs/[shareId]/reject/route.ts')) {
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
      && rel !== 'app/api/v1/homes/[homeRef]/artifacts/[artifactRef]/preview/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/artifacts/[artifactRef]/complete/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/full/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/photo-checkups/[photoRef]/thumbnail/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/projects/[projectRef]/submit-for-review/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/research/route.ts'
      && rel !== 'app/api/v1/homes/[homeRef]/assistant/route.ts'
      && !rel.includes('/handoffs/')
      && !rel.endsWith('/handoffs/route.ts')
      && !rel.endsWith('/home-record/export/route.ts')) {
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

test('the same-browser email-code form is preferred and every auth form is capability-gated', () => {
  const signin = read('app/signin/page.tsx')
  const pending = read('lib/email-code-pending.ts')
  assert.match(signin, /capabilities\.emailCodeSignIn \?/,
    'the code form is gated on the exact server capability')
  assert.match(signin, /capabilities\.magicLinkSignIn \?/,
    'the migration fallback remains independently capability-gated')
  assert.match(signin, /If a code arrives for/,
    'code acceptance copy is generic and does not claim that delivery occurred')
  assert.match(signin, /If that address can sign in/,
    'legacy fallback copy remains generic during migration')
  assert.match(signin, /autoComplete="one-time-code"/)
  assert.match(signin, /inputMode="numeric"/)
  assert.match(signin, /type="text"/,
    'a text input preserves leading-zero codes')
  assert.match(signin, /Keep this page open/)
  assert.match(signin, /const requestedEmail = email\.trim\(\)\.toLowerCase\(\)[\s\S]*setDestinationEmail\(requestedEmail\)/,
    'the accepted request remains bound to the exact submitted address')
  assert.match(signin, /resendAvailableAt - Date\.now\(\)/,
    'resend timing uses an absolute deadline after background timer throttling')
  assert.match(signin, /disabled=\{requestState === 'sending'\}/,
    'the address cannot change while its request is in flight')
  assert.match(signin, /requestInFlight\.current\s*\|\|\s*Date\.now\(\) < resendDeadline\.current/,
    'a synchronous ref lock prevents duplicate send and resend requests before React rerenders')
  assert.match(signin, /if \(\s*verifyInFlight\.current\s*\|\| requestInFlight\.current\s*\|\| Date\.now\(\) < verifyDeadline\.current\s*\) return/,
    'verification cannot race a resend or bypass a server-directed lockout')
  assert.match(signin, /disabled=\{requestState === 'sending'[\s\S]*verifyState === 'verifying'[\s\S]*secondsUntilVerify > 0[\s\S]*code\.length !== 6\}/,
    'verification is visibly disabled during an in-flight request or verification lockout')
  assert.match(signin, /result\.error === 'rate_limited'[\s\S]*startResendCooldown\(result\.retryAfterSeconds\)/,
    'a request 429 preserves the server resend cooldown')
  assert.match(signin, /result\.error === 'rate_limited'[\s\S]*startVerifyCooldown\(result\.retryAfterSeconds\)/,
    'a verification 429 uses a separate server-directed verification cooldown')
  assert.match(signin, /window\.sessionStorage\.setItem\([\s\S]*encodePendingEmailCode\(email, resendAvailableAt, verifyAvailableAt\)/,
    'the pending code stage survives a same-tab reload or mobile page eviction')
  assert.match(pending, /readonly email: string[\s\S]*readonly resendAvailableAt: number[\s\S]*readonly verifyAvailableAt: number[\s\S]*readonly savedAt: number/,
    'only the destination, cooldown deadlines, and original save time are persisted')
  assert.match(signin, /if \(verifyAt > 0\) setVerifyState\('rate_limited'\)/,
    'a mobile reload restores an active verification lockout')
  assert.match(signin, /async function resend\(\)[\s\S]*setVerifyState\(current => current === 'rate_limited' \? current : 'idle'\)/,
    'requesting another code cannot visually clear an active verification lockout')
  assert.match(signin, /if \(!storageReady\) return[\s\S]*\[stage, storageReady\]/,
    'autofocus runs after pending session state has been restored')
  const storageWriter = signin.match(/function writePendingEmailCode[\s\S]*?\n\}/)?.[0] ?? ''
  assert.ok(storageWriter, 'the pending-code storage writer exists')
  assert.doesNotMatch(storageWriter, /\bcode\s*[:,]/i,
    'the one-time code itself is never written to browser storage')
  assert.match(signin, /I already have a code/,
    'a homeowner can recover the code-entry screen without requesting another email')
  assert.match(signin, /port\.verifyEmailCode\([\s\S]*context\.intent, context\.handoff/,
    'bounded entry context is preserved through server-side code verification')
  assert.doesNotMatch(signin, /(email|code) (was|has been|is) sent/i,
    'nothing claims a send the server did not accept')
  assert.match(signin, /mode === 'synthetic'\s*\?\s*\(?\s*<SyntheticEntry/,
    'synthetic mode keeps the honest demo entry')
})

test('the complete sign-in journey uses the whole-home navy and lime identity', () => {
  const signin = read('app/signin/page.tsx')
  const complete = read('app/auth/complete/page.tsx')
  const css = read('app/globals.css')

  assert.match(signin, /className="signin"/,
    'sign in uses the dedicated modern authentication shell')
  assert.match(signin, /Open your Home Record\./,
    'the primary entry uses the permanent whole-home product language')
  assert.match(signin, /The whole home, not one trade/,
    'the entry surface keeps Homesrolo broader than roofing')
  assert.match(signin, /The PDF becomes available only after you accept it/,
    'handoff entry explains that document access follows explicit acceptance')
  assert.match(signin, /<span>homesrolo<\/span>/,
    'the current lowercase wordmark is present')
  assert.doesNotMatch(signin, /gate__card/,
    'the sign-in screen cannot fall back to the legacy drafting-card shell')
  assert.doesNotMatch(signin, /a link is on its way/i,
    'provider acceptance is not presented as delivery confirmation')

  assert.match(complete, /signin signin--complete/,
    'the email completion state stays in the same visual journey')
  assert.match(complete, /Opening your Home Record/,
    'the completion state uses the same whole-home language')
  assert.match(complete, /<main id="main" tabIndex=\{-1\}/,
    'the completion screen preserves the global main landmark target')
  assert.doesNotMatch(complete, /gate__card/,
    'opening a magic link cannot reveal the old theme')

  for (const token of ['#071c27', '#0b4f6c', '#c8ef4d']) {
    assert.match(css, new RegExp(token), `${token} is represented in the authentication identity`)
  }
  assert.match(css, /\.signin__form \.field input \{[\s\S]*?min-height: 52px/,
    'email entry remains comfortably sized on a phone')
  assert.match(css, /\.signin \.btn \{[\s\S]*?min-height: 52px/,
    'the sign-in action remains comfortably sized on a phone')
  assert.match(css, /\.signin__try-again \{[\s\S]*?min-height: 44px/,
    'the retry action preserves a real phone hit target')
  assert.match(css, /@media \(max-width: 52rem\) \{[\s\S]*?\.signin__main \{[\s\S]*?grid-template-columns: 1fr/,
    'the desktop composition collapses into one readable phone column')
})

test('the authenticated shell carries the public navy, lime, and sans-serif identity', () => {
  const publicCss = readFileSync(path.resolve(APP, '../web/app/globals.css'), 'utf8')
  const shell = read('components/AppShell.tsx')

  for (const token of [
    'canvas', 'surface', 'surface-muted', 'ink', 'ink-soft', 'ink-faint', 'line',
    'brand', 'brand-deep', 'brand-soft', 'signal', 'signal-soft', 'night',
    'night-raised', 'night-ink', 'night-soft', 'night-faint', 'night-rule',
    'font-display', 'font-body', 'font-mono',
  ]) {
    assert.equal(
      customProperty(css, token),
      customProperty(publicCss, token),
      `the private app must use the public site's canonical --${token} token`,
    )
  }

  assert.doesNotMatch(css, /Iowan Old Style|Palatino(?: Linotype)?|ui-serif|Georgia, serif/i,
    'the old paper-ledger serif stack cannot return through a root font token')
  assert.match(css, /body\s*\{[^}]*font-family:\s*var\(--font-body\)/,
    'all authenticated pages inherit the canonical sans-serif body face')

  for (const selector of ['rail', 'topbar', 'tabbar']) {
    assert.match(
      css,
      new RegExp(`\\.${selector}\\s*\\{[^}]*background:[^;}]+(?:var\\(--night\\)|rgb\\(7 28 39)`, 's'),
      `${selector} uses the same navy chrome as homesrolo.com`,
    )
  }
  assert.match(css, /\.rail__nav a\[aria-current='page'\]\s*\{[^}]*border-left-color:\s*var\(--signal\)/s,
    'the desktop rail keeps a visible lime position marker')
  assert.match(css, /\.rail__nav a\[aria-current='page'\] svg\s*\{[^}]*(?:color|stroke):\s*var\(--signal\)/s,
    'the active desktop destination carries a signal-lime icon')
  assert.match(css, /\.tabbar a\[aria-current='page'\]\s*\{[^}]*color:\s*var\(--signal\)/s,
    'the active mobile destination is signal lime')
  assert.match(css, /\.tabbar a\[aria-current='page'\] svg\s*\{[^}]*stroke:\s*(?:var\(--signal\)|currentColor)/s,
    'the active mobile icon follows the lime destination state')

  const houseMarks = shell.match(/<HouseMark \/>/g) ?? []
  const lowercaseWordmarks = shell.match(/<HouseMark \/>\s*<span>homesrolo<\/span>/g) ?? []
  assert.ok(houseMarks.length > 0, 'the authenticated chrome displays the Homesrolo mark')
  assert.equal(lowercaseWordmarks.length, houseMarks.length,
    'every authenticated shell wordmark uses the lowercase homesrolo identity')

  for (const entry of ['app/page.tsx', 'app/onboarding/page.tsx', 'app/homes/page.tsx', 'app/homes/new/page.tsx']) {
    assert.match(
      read(entry),
      /<HouseMark \/>\s*<span>homesrolo<\/span>/,
      `${entry} uses the same lowercase homesrolo entry wordmark`,
    )
  }
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
  assert.match(project, /!uploadsEnabled \? \([\s\S]*Uploads are turned off in this build\./,
    'the project workspace says plainly when its private storage control is off')
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

test('the finished portal omits fake disabled and roadmap affordances', () => {
  const signin = read('app/signin/page.tsx')
  assert.match(signin, /SYNTHETIC_NOTICE/)
  const settings = read('app/home/[homeId]/settings/page.tsx')
  const documents = read('app/home/[homeId]/documents/page.tsx')
  assert.doesNotMatch(signin, /Email sign-in is unavailable in the demo/i)
  assert.doesNotMatch(settings, /not built yet|coming soon|disabled/i)
  assert.doesNotMatch(documents, /Uploads are unavailable|not open yet|coming soon/i)
})

test('settings exposes account actions, not an internal capability matrix', () => {
  const settings = read('app/home/[homeId]/settings/page.tsx')
  assert.match(settings, /Account &amp; settings/)
  assert.match(settings, /Switch home/)
  assert.match(settings, /Sign out/)
  assert.match(settings, /href=\{`\/home\/\$\{homeId\}`\}/,
    'the dashboard is available from account settings')
  for (const route of ['projects', 'documents', 'checkups']) {
    assert.match(settings, new RegExp(`href=\\{\`/home/\\$\\{homeId\\}/${route}\`\\}`),
      `${route} is available from account settings`)
  }
  assert.match(settings, /checkupsEnabled[\s\S]*session\.capabilities\.photoCheckups/,
    'the only capability read fail-closes a real destination link')
  assert.doesNotMatch(settings, /CAPABILITY_LABELS|Available for this session|Save changes|disabled/,
    'runtime flags and fake edit controls are not homeowner-facing')
})

test('the authenticated home is a whole-home record, not a roofing dashboard', () => {
  const shell = read('components/AppShell.tsx')
  const experience = read('components/RoloHomeDashboard.tsx')
  const rolo = read('app/home/[homeId]/rolo/page.tsx')
  const library = read('app/home/[homeId]/documents/page.tsx')
  const projects = read('app/home/[homeId]/projects/page.tsx')
  const projectStatus = read('components/projectStatus.ts')

  assert.match(shell, /label: 'Today', tabLabel: 'Today'/)
  assert.match(shell, /label: 'Plans & service', tabLabel: 'Plans'/)
  assert.match(shell, /label: 'Pros', tabLabel: 'Pros'/)
  assert.match(shell, /label: 'My Home', tabLabel: 'My Home'/)
  for (const action of ['Fix a problem', 'Plan a project', 'Get routine help', 'Add past work']) {
    assert.match(shell, new RegExp(action), `${action} is available from the persistent Start action`)
  }
  assert.match(shell, /homesrolo:open-assistant/,
    'Rolo remains available from the persistent app shell')
  assert.match(shell, /Account &amp; settings/,
    'account settings remain available without occupying primary navigation')
  assert.doesNotMatch(shell, /label: 'Warranties'|label: 'Events & care'|label: 'Settings'/,
    'primary navigation contains only destinations that work today')
  assert.match(experience, /What do you need done\?/)
  assert.match(experience, /The home history builds quietly while you handle it\./)
  for (const action of ['Fix a problem', 'Plan a project', 'Get routine help', 'Add past work']) {
    assert.match(experience, new RegExp(action), `${action} is a first-class home action`)
  }
  for (const area of [
    'Roof', 'Interior & remodel', 'Heating & cooling', 'Plumbing', 'Electrical',
    'Exterior & gutters', 'Yard & landscaping', 'Appliances', 'Pest control',
    'Pool', 'New construction', 'Something else',
  ]) {
    const expected = area === 'Something else' ? 'Whole home' : area
    assert.match(projectStatus, new RegExp(expected.replace('&', '\\&')),
      `${area} remains available in manual whole-home capture`)
  }
  assert.match(projects, /PROJECT_CATEGORY_OPTIONS\.map/,
    'the project category picker reuses the shared whole-home vocabulary')
  assert.doesNotMatch(experience, /Need roof work\?|Start a roof project|Open roof projects/,
    'roofing is never presented as the dashboard default')
  assert.match(experience, /Add past work/,
    'historical work remains a first-class dashboard action')
  assert.match(experience, /The record happens underneath the work\./)
  assert.match(experience, /href=\{`\/home\/\$\{homeId\}\/checkups`\}/)
  assert.match(experience, /checkupsEnabled \? \([\s\S]*href=\{`\/home\/\$\{homeId\}\/checkups`\}/,
    'the dashboard never links to a disabled photo workspace')
  assert.match(rolo, /type RoloFilter = 'all' \| 'work' \| 'home' \| 'people' \| 'saved'/,
    'the Rolodex ties together the home, work, people, and saved evidence')
  assert.match(rolo, /!showingPros \? \([\s\S]*styles\.filters/,
    'the dedicated Pros tab does not expose unrelated My Home filters')
  assert.match(rolo, /showingPros \? 'Search saved pros'/,
    'Pros has its own concise search language')
  assert.match(library, /Your working records/)
  assert.match(library, /Project history/)
  assert.match(library, /Condition record/)
  assert.match(library, /session\.state\.capabilities\.uploads/,
    'the add-file form remains fail-closed on the exact upload capability')
  assert.match(library, /photoCheckupsEnabled \? \([\s\S]*href=\{`\/home\/\$\{homeId\}\/checkups`\}/,
    'the Home record never links to a disabled photo workspace')
  assert.doesNotMatch(library, /Insurance|Inventory|Taxes|Events & maintenance|People & service history/,
    'the record index does not advertise unbuilt sections')
})

test('the Home Record exposes one private, editable address and saved home facts', () => {
  const dashboard = read('app/home/[homeId]/page.tsx')
  const experience = read('components/RoloHomeDashboard.tsx')
  const details = read('app/home/[homeId]/details/page.tsx')
  const remote = read('lib/port/remote.ts')

  assert.match(dashboard, /port\.getHomeRecord\(homeId\)/)
  assert.match(dashboard, /mode === 'remote' && homeRecord\.state\.status === 'ready'/,
    'only an authorized dedicated read can expose the profile card')
  assert.match(experience, /const exactLocation = homeRecord\?\.address/)
  assert.match(experience, /homeRecord\.address\.city[\s\S]*homeRecord\.address\.regionCode/,
    'Today uses only the private locality and does not turn the address into a marketing hero')
  assert.match(experience, /href=\{`\/home\/\$\{homeId\}\/rolo`\}/)
  assert.match(experience, /The record happens underneath the work\./)
  assert.match(details, /Property address[\s\S]*Home facts[\s\S]*Major systems/)
  assert.match(details, /port\.getHomeRecord\(homeId\)/,
    'a direct edit URL must first pass the controller-only record read')
  assert.match(details, /Home details are controller-only/)
  assert.match(details, /sample record does not include an editable address/)
  assert.match(details, /port\.updateHomeRecord\(profile\.homeRef/)
  assert.match(details, /expectedRevision: profile\.revision/,
    'edits use the exact revision returned by the last Home Record read')
  assert.match(remote, /path: `\$\{API\}\/homes\/\$\{ref\}\/record`/)
  assert.doesNotMatch(`${dashboard}\n${experience}\n${details}`, /coming soon|beta/i)
  assert.doesNotMatch(details, /measurement|square.?foot|roof.?area/i,
    'measurements stay outside this slice')
  assert.match(css, /@media \(max-width: 48rem\)[\s\S]*\.home-details-form__fields/,
    'the edit form collapses to one column on phones')
})

test('seasonal photo checkups are mobile-first, exact-view, and independently gated', () => {
  const checkupPage = read('app/home/[homeId]/checkups/page.tsx')
  const library = read('app/home/[homeId]/documents/page.tsx')
  const checkups = read('components/PhotoCheckups.tsx')
  const remote = read('lib/port/remote.ts')
  const wire = read('lib/port/wire.ts')
  const transport = read('lib/port/transport.ts')

  assert.match(checkupPage, /session\.state\.capabilities\.photoCheckups/,
    'the checkup workspace has its own server-reported capability')
  assert.match(library, /session\.state\.capabilities\.uploads/,
    'generic documents remain behind their separate capability')
  assert.match(checkupPage, /<PhotoCheckups homeRef=\{homeId\} enabled port=\{port\}/,
    'the working capability opens the first-class photo workspace')
  assert.match(checkupPage, /router\.replace\(`\/home\/\$\{homeId\}\/documents`\)/,
    'a session without that capability returns to a working record destination')
  assert.match(checkups, /enabled\s*\n\s*\? port\.listPhotoCheckups\(homeRef\)\s*\n\s*:\s*Promise\.resolve/,
    'capability false makes no photo-list port call')

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
  assert.match(checkups, /For an HEIC image[\s\S]*JPEG copy/,
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
  assert.doesNotMatch(checkups, /\bbeta\b|not open yet/i,
    'the live checkup workspace contains no roadmap language')

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

test('work opens as conversational capture with a compact manual workspace', () => {
  const projects = read('app/home/[homeId]/projects/page.tsx')
  const detail = read('app/home/[homeId]/projects/[projectId]/page.tsx')

  assert.match(projects, /Start with Rolo/,
    'natural conversation is the primary work-capture action')
  assert.match(projects, /Add without Rolo/,
    'the homeowner can still navigate and enter work without the assistant')
  assert.match(projects, /Where is it now\?/)
  for (const state of ['Planned', 'Happening now', 'Already done']) {
    assert.match(projects, new RegExp(state), `${state} remains one fast creation state`)
  }
  assert.match(projects, /<select[\s\S]*Choose an area[\s\S]*PROJECT_CATEGORY_OPTIONS\.map/,
    'twelve home categories stay available without twelve oversized cards')
  assert.match(projects, /<details className="project-more">[\s\S]*Add date or notes/,
    'optional capture stays progressively disclosed')
  assert.match(projects, /className="work-index__advanced-toggle"[\s\S]*aria-expanded=\{advancedFiltersOpen\}[\s\S]*More filters/,
    'kind, area, and sort stay behind one compact disclosure on a phone')
  assert.match(css, /@media \(min-width: 42rem\)[\s\S]*\.work-index__advanced > \.work-index__selects \{ display: grid/,
    'desktop keeps advanced project filters directly visible')

  for (const section of [
    "{ value: 'overview', label: 'Plan' }",
    "{ value: 'activity', label: 'Updates' }",
    "{ value: 'files', label: 'Photos' }",
    "{ value: 'decisions', label: 'Choices' }",
    "{ value: 'people', label: 'People' }",
  ]) assert.match(detail, new RegExp(section.replace(/[&{}'()]/g, '\\$&')))
  assert.match(detail, /YOUR NEXT MOVE/,
    'each plan opens with useful actions instead of a passive record summary')
  assert.match(detail, /Continue with Rolo/,
    'Rolo can continue inside the exact plan context')
  assert.match(detail, /role="tablist" aria-label="Project workspace"/)
  assert.match(detail, /expectedRevision: project\.revision/,
    'homeowner corrections are revision-safe')
  assert.match(detail, /occurredOn: editOccurredOn \|\| null/,
    'clearing an exact date is an explicit saved correction')
  assert.match(detail, /professionalLabel: editProfessional\.trim\(\) \|\| null/,
    'clearing a professional label is an explicit saved correction')
  assert.match(detail, /expectedRevision: editingItem\.revision/,
    'a saved decision cannot overwrite a newer edit')
  assert.match(detail, /detail: itemDetail\.trim\(\) \|\| undefined/,
    'an optional blank item detail stays valid and can clear an older detail')
  assert.doesNotMatch(detail, /Archive project|deleteProject/,
    'the UI does not strand or delete projects before a restore surface exists')
  assert.match(detail, /port\.addProjectActivity\(homeId, projectId/,
    'updates write through the project activity contract')
  assert.match(detail, /port\.saveProjectItem\(homeId, projectId/,
    'materials, decisions, and wish-list items share one bounded project contract')
  assert.match(detail, /This does not grant account or Home Record access\./,
    'a named professional is never confused with sharing authority')
  assert.match(css, /\.project-workspace__tabs\s*\{[^}]*overflow-x:\s*auto/s,
    'the workspace navigation remains horizontally usable on a phone')
})

test('the home library avoids disabled routes and Activity is a real projection', () => {
  const library = read('app/home/[homeId]/documents/page.tsx')
  const care = read('app/home/[homeId]/timeline/page.tsx')
  const warranties = read('app/home/[homeId]/warranties/page.tsx')

  assert.match(library, /recordsReadable[\s\S]*\? port\.listDocuments\(homeId\)[\s\S]*Promise\.resolve/,
    'the Home record does not call the disabled private-file route')
  assert.doesNotMatch(library, /unavailable|not open yet|coming soon/i)
  assert.match(care, /port\.listProjects\(homeId\)/,
    'Activity reuses the canonical work records')
  assert.match(care, /port\.listDocuments\(homeId\)/,
    'Activity projects saved file metadata without copying it')
  assert.match(care, /A chronological projection over work, photos, and files; no copied timeline storage/,
    'Activity is explicitly a read model, not another persistence system')
  assert.match(warranties, /redirect\(`\/home\/\$\{homeId\}\/documents`\)/,
    'the former warranties path resolves to the working Home record')
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

test('the dashboard uses real records and opens one approval-gated Rolo assistant', () => {
  const dashboard = read('app/home/[homeId]/page.tsx')
  const experience = read('components/RoloHomeDashboard.tsx')
  const assistant = read('components/AssistantDock.tsx')
  const assistantServer = read('lib/server/home-assistant.ts')
  const assistantHttp = read('lib/server/home-assistant-http.ts')
  const privacy = read('../web/app/privacy/page.tsx')
  const progress = read('lib/home-record-progress.ts')

  assert.match(dashboard, /port\.listProjects\(homeId\)/)
  assert.match(experience, /What do you need done\?/)
  assert.match(experience, /activeWork/,
    'open work is promoted before passive history')
  assert.match(experience, /Pool & outdoor/,
    'a concrete homeowner project can start from the front door')
  assert.match(experience, /Photos &amp; files[\s\S]*Home Watch[\s\S]*My Home[\s\S]*Activity/,
    'the existing record tools stay one tap away without becoming the front door')
  assert.match(progress, /never scores the home's condition, safety, value, or insurability/)
  assert.match(experience, /The record happens underneath the work\./,
    'the durable record is the result of useful homeowner actions')
  assert.match(experience, /homesrolo:open-assistant/,
    'the home front door opens the same persistent assistant as the shell')
  assert.match(assistant, /port\.askRolo\(homeId/,
    'Rolo talks through the typed browser port')
  assert.match(assistant, /conversation:\s*\{\s*pendingWork,\s*unansweredFollowUpQuestion\s*\}/,
    'Rolo carries its visible question and pending draft into the next turn')
  assert.match(assistant, /port\.createProject\(homeId/,
    'approved drafts reuse the existing work command')
  assert.match(assistant, /Nothing is saved until you approve it/,
    'the review boundary is visible beside every proposed work record')
  assert.match(assistant, /session\.capabilities\.homeAssistantVision/,
    'saved-photo review is hidden behind its explicit runtime capability')
  assert.match(assistant, /port\.listDocuments\(homeId\)/,
    'photo review can reuse an existing private Library photo')
  assert.match(assistant, /port\.uploadPrivateArtifact\(homeId/,
    'a newly attached photo reuses the existing private artifact upload command')
  assert.match(assistant, /capture="environment"/,
    'Rolo offers a phone camera input alongside the photo library')
  assert.match(assistant, /setPhotoConsent\(false\)/,
    'photo consent is reset and must be renewed for each message')
  assert.doesNotMatch(assistant, /FileReader|readAsDataURL|createObjectURL/,
    'the browser never turns an attached photo into model input itself')
  assert.match(assistantServer, /type: 'input_image'/)
  assert.match(assistantServer, /store: false/)
  assert.match(assistantHttp, /sanitizeHomeownerPhotoForAnalysis/)
  assert.match(privacy, /choose one saved Library photo or attach one new JPEG or PNG/i,
    'privacy copy names both narrow one-photo paths')
  assert.doesNotMatch(assistant, /dangerouslySetInnerHTML/,
    'model text is rendered as escaped React text')
  assert.doesNotMatch(`${dashboard}\n${experience}\n${progress}`, /measurement/i,
    'measurements are intentionally outside this release')
})

test('one bounded roofing intent continues through the existing homeowner flow', () => {
  const signin = read('app/signin/page.tsx')
  const homes = read('app/homes/page.tsx')
  const newHome = read('app/homes/new/page.tsx')
  const projects = read('app/home/[homeId]/projects/page.tsx')
  for (const content of [signin, homes, newHome]) {
    assert.match(content, /homeownerEntryContext/)
    assert.match(content, /withHomeownerEntryContext|homeownerEntryDestination/)
  }
  assert.match(projects, /carriedIntent/)
  assert.match(projects, /Nothing is sent to a contractor unless you choose that later\./)
  assert.doesNotMatch([signin, homes, newHome, projects].join('\n'), /insurance_claim/)
})

test('one opaque handoff context survives auth and home selection without auto-claiming', () => {
  const signin = read('app/signin/page.tsx')
  const authComplete = read('app/auth/complete/page.tsx')
  const homes = read('app/homes/page.tsx')
  const newHome = read('app/homes/new/page.tsx')
  const documents = read('app/home/[homeId]/documents/page.tsx')
  const helper = read('lib/entry-context.ts')
  const authHttp = read('lib/server/auth-http.ts')

  assert.match(helper, /\^hshr_\[A-Za-z0-9_-\]\{43\}\$/,
    'only one opaque share reference is accepted')
  assert.match(signin, /port\.requestMagicLink\(email\.trim\(\), context\.intent, context\.handoff\)/)
  assert.match(signin, /port\.verifyEmailCode\([\s\S]*context\.intent, context\.handoff/)
  assert.match(authComplete, /withHomeownerEntryContext\('\/homes', context\)/)
  assert.match(authHttp, /signInPathForEntryContext\(rawIntent, rawHandoff\)/,
    'a valid handoff survives an expired provider token so the homeowner can sign in again')
  assert.match(homes, /homeownerEntryDestination\(home\.homeRef, context\)/)
  assert.equal((newHome.match(/homeownerEntryDestination\(submit\.homeRef, context\)/g) ?? []).length, 2,
    'created and partially-created homes both retain the exact entry destination')
  assert.match(documents, /handoffShareRef\(query\.handoff\)/)
  assert.match(css, /@media \(max-width: 38rem\)[\s\S]*\.handoff-entry/,
    'the entry prompt has a phone-safe layout')
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
    'app/home/[homeId]/details/page.tsx',
    'app/home/[homeId]/projects/page.tsx',
    'app/home/[homeId]/projects/[projectId]/page.tsx',
    'app/home/[homeId]/documents/page.tsx',
    'app/home/[homeId]/checkups/page.tsx',
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
