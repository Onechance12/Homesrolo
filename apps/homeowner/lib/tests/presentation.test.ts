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
 * every screen-existence assertion comparing against 'app/â€¦/page.tsx' literals
 * fails there while Linux CI stays green â€” found by validation on a Windows
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

test('only the allowlisted homeowner-http.v1 routes and methods exist', () => {
  // One route file now serves both the authenticated list read and the strict
  // create-home command. The file inventory remains an allowlist.
  const ROUTE_ALLOWLIST = [
    'app/api/v1/session/route.ts',
    'app/api/v1/homes/route.ts',
    'app/api/v1/homes/[homeRef]/route.ts',
  ]
  const found = appSources.filter(rel => /route\.(ts|tsx)$/.test(rel)).sort()
  assert.deepEqual(found, [...ROUTE_ALLOWLIST].sort(),
    'the route inventory must remain exactly the three defined paths')
  for (const rel of ROUTE_ALLOWLIST) {
    const content = read(rel)
    assert.match(content, /export async function GET/, `${rel} serves GET`)
    if (rel === 'app/api/v1/homes/route.ts') {
      assert.match(content, /export async function POST/, `${rel} serves the create command`)
    } else {
      assert.doesNotMatch(content, /export (async function|const) POST/,
        `${rel} must not export POST`)
    }
    assert.doesNotMatch(content, /export (async function|const) (PUT|PATCH|DELETE|HEAD|OPTIONS)/,
      `${rel} must export no generic mutation method`)
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
    assert.doesNmu×~m¢G§²ÚîÆ­yÒ&W÷6—F÷'’‚’À¢6öÖÖæG3¢–çWBæ6öÖÖæG2óò°¢7–æ27&VFU&—fFT†öÖUv÷&·76R‚’²&WGW&â²†öÖRÂÖVÖ&W'6†—ÒÒÀ¢7–æ27&VFU&ö¦V7B‚’²F‡&÷ræWrW'&÷"‚væ÷BW6VBr’ÒÀ¢ÒÀ¢æ÷s¢‚’Óâæ÷rÀ¢6&–Æ—F–W3¢²ââæ6&–Æ—F–W2ÂW'6—7FVæ6S¢–çWBçW'6—7FVæ6RóòfÇ6RÒÀ¢Ò§Ð ¦6öç7B6öçFW‡BÒ²6W76–öä†æFÆS¢w6W'fW"×6W76–öâÖ†æFÆRrÐ §FW7B‚w6W76–öâ&ö¦V7F–öâ—2G'WF†gVÂæBæWfW"W‡÷6W26W76–öâ÷"&÷f–FW"–FVçF—G’rÂ7–æ2‚’Óâ°¢6öç7B6–væVD–âÒv—B6W'f–6R‚’ç&VE6W76–öâ†6öçFW‡B¢76W'BæFVWWVÂ‡6–væVD–âÂ°¢•fW'6–öã¢„ôÔTõtäU%ô•õdU%4”ôâÀ¢¶–æC¢w6–væVEö–ârÀ¢&–æ6—Å&VbÀ¢6&–Æ—F–W2À¢Ò¢76W'BæWVÂ‚w6W76–öä†æFÆRr–â6–væVD–âÂfÇ6R¢76W'BæWVÂ‚w&÷f–FW$–Br–â6–væVD–âÂfÇ6R¢76W'BæÖF6‚„„ôÔTõtäU%ô•õt$ä”ärÂ÷&VÖ–âVæf–Æ&ÆRò ¢6öç7B6–væVD÷WBÒv—B6W'f–6R‡²&W6öÇfVE&–æ6—Ã¢çVÆÂÒ’ç&VE6W76–öâ†6öçFW‡B¢76W'BæWVÂ‡6–væVD÷WBæ¶–æBÂw6–væVEö÷WBr¢76W'BæWVÂ‚w&–æ6—Å&Vbr–â6–væVD÷WBÂfÇ6R§Ò §FW7B‚v–æ7F—fR÷"VçfW&–f–VB&–æ6—Ç2&V6V—fRF†R6–væVBÖ÷WB&ö¦V7F–öârÂ7–æ2‚’Óâ°¢6öç7BF—6&ÆVBÒv—B6W'f–6R‡°¢&W6öÇfVE&–æ6—Ã¢²ââç&–æ6—ÂÂ7FGW3¢vF—6&ÆVBrÒÀ¢Ò’ç&VE6W76–öâ†6öçFW‡B¢6öç7BVçfW&–f–VBÒv—B6W'f–6R‡°¢&W6öÇfVE&–æ6—Ã¢²ââç&–æ6—ÂÂVÖ–ÅfW&–f–VC¢fÇ6RÒÀ¢Ò’ç&VE6W76–öâ†6öçFW‡B¢76W'BæWVÂ†F—6&ÆVBæ¶–æBÂw6–væVEö÷WBr¢76W'BæWVÂ‡VçfW&–f–VBæ¶–æBÂw6–væVEö÷WBr§Ò §FW7B‚v†öÖRÆ—7F–ærg&W6‚Ö6†V6·2WfW'’ÖVÖ&W'6†—æB6¶—2–æ7F—fR÷"Ö—6ÖF6†VB&÷w2rÂ7–æ2‚’Óâ°¢6öç7B&Wfö¶VC¢†öÖV÷væW$ÖVÖ&W'6†—Ò²ââæÖVÖ&W'6†—Â7FFS¢w&Wfö¶VBrÂ&Wfö¶VDC¢æ÷rÐ¢6öç7BÖ—6ÖF6†VC¢†öÖV÷væW$ÖVÖ&W'6†—Ò°¢ââæÖVÖ&W'6†—À¢ÖVÖ&W'6†—&Vc¢†Ö'%òG¶&öG’‚vâr—ÖÀ¢&–æ6—Å&Vc¢÷F†W%&–æ6—Å&VbÀ¢†öÖU&Vc¢÷F†W$†öÖU&VbÀ¢Ð¢6öç7B&WòÒ&W÷6—F÷'’‡°¢7–æ2Æ—7DÖVÖ&W'6†—2‚’²&WGW&â·&Wfö¶VBÂÖ—6ÖF6†VBÂÖVÖ&W'6†—ÒÒÀ¢Ò¢76W'BæFVWWVÂ†v—B6W'f–6R‡²&W÷6—F÷'“¢&WòÒ’æÆ—7D†öÖW2†6öçFW‡B’Â·°¢†öÖU&VbÀ¢F—7Æ”Æ&VÃ¢t÷W"†öÖRrÀ¢&—fFTÆö6F–öäÆ&VÃ¢t&—fFR†öÖV÷væW"Æö6F–öâÆ&VÂrÀ¢&VÆF–öç6†—Æ&VÃ¢v6Æ–ÖVE÷VçfW&–f–VBrÀ¢ÕÒ§Ò §FW7B‚vW†7B†öÖR&VB&V6†V6·2ÖVÖ&W'6†—æB&ö¦V7G2æòWF†÷&—G’÷"7F÷&vRf–VÆG2rÂ7–æ2‚’Óâ°¢6öç7B&WòÒ&W÷6—F÷'’‡°¢7–æ2Æ—7E&ö¦V7G2‚’²&WGW&â·²&ö¦V7E&Vc¢‡&¥òG¶&öG’‚v¢r—ÖÕÒ2æWfW"ÒÀ¢7–æ2Æ—7D'F–f7DÖWFFF‚’°¢&WGW&â°¢²¶–æC¢vFö7VÖVçBrÂ7F÷&vTö&¦V7E&Vc¢†ö&¥òG¶&öG’‚w2r—ÖÒÀ¢²¶–æC¢w†÷FòrÂ7F÷&vTö&¦V7E&Vc¢†ö&¥òG¶&öG’‚wBr—ÖÒÀ¢Ò2æWfW ¢ÒÀ¢7–æ2Æ—7Ev'&çF–W2‚’²&WGW&â·²v'&çG•&Vc¢‡wG•òG¶&öG’‚wrr—ÖÕÒ2æWfW"ÒÀ¢7–æ2Æ—7DÖ–çFVææ6R‚’²&WGW&â·²Ö–çFVææ6U&Vc¢†ÖçEòG¶&öG’‚w‚r—ÖÕÒ2æWfW"ÒÀ¢Ò¢6öç7Bf–WrÒv—B6W'f–6R‡²&W÷6—F÷'“¢&WòÒ’ç&VD†öÖR†6öçFW‡BÂ†öÖU&Vb¢76W'Bæö²††öÖV÷væW$”†öÖUf–Wu66†VÖç'6R‡f–Wr’¢76W'BæWVÂ‡f–Wrç&ö¦V7D6÷VçBÂ¢76W'BæWVÂ‡f–WræFö7VÖVçD6÷VçBÂ¢76W'BæWVÂ‡f–Wrçv'&çG”6÷VçBÂ¢76W'BæWVÂ‡f–WræÖ–çFVææ6T6÷VçBÂ¢76W'BæWVÂ‚v7&VFVD'•&–æ6—Å&Vbr–âf–WrÂfÇ6R¢76W'BæWVÂ‚vÖVÖ&W'6†—&Vbr–âf–WrÂfÇ6R¢76W'BæWVÂ‚w7F÷&vTö&¦V7E&Vbr–âf–WrÂfÇ6R§Ò §FW7B‚vÖÆf÷&ÖVBÂ7&÷72Ö†öÖRÂæB&Wfö¶VB&VG2f–Â6Æ÷6VBv—F†÷WB&WfVÆ–ærWF†÷&—G’rÂ7–æ2‚’Óâ°¢v—B76W'Bç&V¦V7G2€¢6W'f–6R‚’ç&VD†öÖR†6öçFW‡BÂs#2W†×ÆR7G&VWBr’À¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb†öÖV÷væW$”W'&÷"bbW'&÷"æ6öFRÓÓÒv–çfÆ–E÷&WVW7BrÀ¢¢v—B76W'Bç&V¦V7G2€¢6W'f–6R‚’ç&VD†öÖR†6öçFW‡BÂ÷F†W$†öÖU&Vb’À¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb†öÖV÷væW$”W'&÷"bbW'&÷"æ6öFRÓÓÒvæ÷Eöf÷VæBrÀ¢¢6öç7B&Wfö¶VE&WòÒ&W÷6—F÷'’‡°¢7–æ2&VDÖVÖ&W'6†—‚’²&WGW&â²ââæÖVÖ&W'6†—Â7FFS¢w&Wfö¶VBrÂ&Wfö¶VDC¢æ÷rÒÒÀ¢Ò¢v—B76W'Bç&V¦V7G2€¢6W'f–6R‡²&W÷6—F÷'“¢&Wfö¶VE&WòÒ’ç&VD†öÖR†6öçFW‡BÂ†öÖU&Vb’À¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb†öÖV÷væW$”W'&÷"bbW'&÷"æ6öFRÓÓÒvæ÷Eöf÷VæBrÀ¢§Ò §FW7B‚w7G&–7B'&÷w6W"&ö¦V7F–öç2&V¦V7B&rU$Ç2Â&÷f–FW"–G2ÂæBW‡G&WF†÷&—G’6Æ–×2rÂ‚’Óâ°¢6öç7B&6RÒ°¢†öÖU&VbÀ¢F—7Æ”Æ&VÃ¢t÷W"†öÖRrÀ¢&—fFTÆö6F–öäÆ&VÃ¢t&—fFR†öÖV÷væW"Æö6F–öâÆ&VÂrÀ¢&VÆF–öç6†—Æ&VÃ¢v6Æ–ÖVE÷VçfW&–f–VBrÀ¢&ö¦V7D6÷VçC¢À¢Fö7VÖVçD6÷VçC¢À¢v'&çG”6÷VçC¢À¢Ö–çFVææ6T6÷VçC¢À¢WFFVDC¢æ÷rÀ¢Ð¢76W'Bæö²††öÖV÷væW$”†öÖUf–Wu66†VÖç'6R†&6R’¢f÷"†6öç7BW‡G&öb°¢²&÷f–FW$–C¢w&÷f–FW"Ö†öÖRÓrÒÀ¢²7F÷&vTö&¦V7E&Vc¢†ö&¥òG¶&öG’‚w2r—ÖÒÀ¢²V&Æ–5W&Ã¢v‡GG3¢òöW†×ÆRæ6öÒ÷&—fFRçFbrÒÀ¢²fW&–f–VD÷væW#¢G'VRÒÀ¢²6öçG&öÆÆW%&–æ6—Å&Vc¢&–æ6—Å&VbÒÀ¢Ò’°¢76W'BçF‡&÷w2‚‚’Óâ†öÖV÷væW$”†öÖUf–Wu66†VÖç'6R‡²ââæ&6RÂââæW‡G&Ò’¢Ð ¢f÷"†6öç7Bæöæ6æöæ–6Âöb°¢s##bÓ‚ÓC#££¢rÀ¢s##bÓ‚ÓC#££ã¢rÀ¢s##bÓ‚ÓC#££ã³£rÀ¢s##bÓ"Ó3C#££ã¢rÀ¢Ò’°¢76W'BçF‡&÷w2€¢‚’Óâ†öÖV÷væW$”†öÖUf–Wu66†VÖç'6R‡²ââæ&6RÂWFFVDC¢æöæ6æöæ–6ÂÒ’À¢G¶æöæ6æöæ–6ÇÒ×W7Bæ÷B7&÷72F†R6W'fW"ö6Æ–VçB&÷VæF'–À¢¢Ð§Ò §FW7B‚v†öÖR7&VF–öâFW&—fW2WF†÷&—G’æBF–ÖRöâF†R6W'fW"rÂ7–æ2‚’Óâ°¢ÆWBö'6W'fVC¢Væ¶æ÷và¢6öç7B7&VFVBÒv—B6W'f–6R‡°¢W'6—7FVæ6S¢G'VRÀ¢6öÖÖæG3¢°¢7–æ27&VFU&—fFT†öÖUv÷&·76R†–çWB’°¢ö'6W'fVBÒ–çW@¢&WGW&â²†öÖRÂÖVÖ&W'6†—Ð¢ÒÀ¢7–æ27&VFU&ö¦V7B‚’²F‡&÷ræWrW'&÷"‚væ÷BW6VBr’ÒÀ¢ÒÀ¢Ò’æ7&VFT†öÖR†6öçFW‡BÂ°¢6öÖÖæE&Vc¢†6ÖEòG¶&öG’‚v2r—ÖÀ¢F—7Æ”Æ&VÃ¢t÷W"†öÖRrÀ¢&—fFTÆö6F–öäÆ&VÃ¢u&—fFRÆö6F–öârÀ¢Ò ¢76W'BæFVWWVÂ†7&VFVBÂ°¢†öÖU&VbÀ¢F—7Æ”Æ&VÃ¢t÷W"†öÖRrÀ¢&—fFTÆö6F–öäÆ&VÃ¢t&—fFR†öÖV÷væW"Æö6F–öâÆ&VÂrÀ¢&VÆF–öç6†—Æ&VÃ¢v6Æ–ÖVE÷VçfW&–f–VBrÀ¢Ò¢76W'BæFVWWVÂ†ö'6W'fVBÂ°¢WF†÷&—¦F–öã¢²WF†÷&—¦VC¢G'VRÂ&–æ6—Å&VbÒÀ¢6öÖÖæC¢°¢6öÖÖæE&Vc¢†6ÖEòG¶&öG’‚v2r—ÖÀ¢F—7Æ”Æ&VÃ¢t÷W"†öÖRrÀ¢&—fFTÆö6F–öäÆ&VÃ¢u&—fFRÆö6F–öârÀ¢&WVW7FVDC¢æ÷rÀ¢ÒÀ¢Ò§Ò §FW7B‚v†öÖR7&VF–öâ&V¦V7G2'&÷w6W"WF†÷&—G’ÂF—6&ÆVBW'6—7FVæ6RÂæB–æ6ö†W&VçBFFW"÷WGWBrÂ7–æ2‚’Óâ°¢v—B76W'Bç&V¦V7G2€¢6W'f–6R‡²W'6—7FVæ6S¢G'VRÒ’æ7&VFT†öÖR†6öçFW‡BÂ°¢6öÖÖæE&Vc¢†6ÖEòG¶&öG’‚v2r—ÖÀ¢F—7Æ”Æ&VÃ¢t÷W"†öÖRrÀ¢&—fFTÆö6F–öäÆ&VÃ¢u&—fFRÆö6F–öârÀ¢&–æ6—Å&VbÀ¢Ò’À¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb†öÖV÷væW$”W'&÷"bbW'&÷"æ6öFRÓÓÒv–çfÆ–E÷&WVW7BrÀ¢¢v—B76W'Bç&V¦V7G2€¢6W'f–6R‚’æ7&VFT†öÖR†6öçFW‡BÂ°¢6öÖÖæE&Vc¢†6ÖEòG¶&öG’‚v2r—ÖÀ¢F—7Æ”Æ&VÃ¢t÷W"†öÖRrÀ¢&—fFTÆö6F–öäÆ&VÃ¢u&—fFRÆö6F–öârÀ¢Ò’À¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb†öÖV÷væW$”W'&÷"bbW'&÷"æ6öFRÓÓÒwVæf–Æ&ÆRrÀ¢¢v—B76W'Bç&V¦V7G2€¢6W'f–6R‡°¢W'6—7FVæ6S¢G'VRÀ¢6öÖÖæG3¢°¢7–æ27&VFU&—fFT†öÖUv÷&·76R‚’°¢&WGW&â²†öÖRÂÖVÖ&W'6†—¢²ââæÖVÖ&W'6†—Â&–æ6—Å&Vc¢÷F†W%&–æ6—Å&VbÒÐ¢ÒÀ¢7–æ27&VFU&ö¦V7B‚’²F‡&÷ræWrW'&÷"‚væ÷BW6VBr’ÒÀ¢ÒÀ¢Ò’æ7&VFT†öÖR†6öçFW‡BÂ°¢6öÖÖæE&Vc¢†6ÖEòG¶&öG’‚v2r—ÖÀ¢F—7Æ”Æ&VÃ¢t÷W"†öÖRrÀ¢&—fFTÆö6F–öäÆ&VÃ¢u&—fFRÆö6F–öârÀ¢Ò’À¢†W'&÷#¢Væ¶æ÷vâ’ÓâW'&÷"–ç7Fæ6Vöb†öÖV÷væW$”W'&÷"bbW'&÷"æ6öFRÓÓÒwVæf–Æ&ÆRrÀ¢§Ò 