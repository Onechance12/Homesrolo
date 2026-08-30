import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(relative: string): string {
  return readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
}

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.ok(startIndex >= 0, `missing source boundary: ${start}`)
  assert.ok(endIndex > startIndex, `missing source boundary: ${end}`)
  return source.slice(startIndex, endIndex)
}

const myRolo = read('app/home/[homeId]/care.tsx')
const roloChat = read('app/home/[homeId]/rolo.tsx')
const cardContract = read('src/home/rolodex.ts')

test('My Rolo projects work and photo albums instead of emitting every photo as a top-level card', () => {
  const projection = section(myRolo, 'const rolo = useMemo(() => {', "\n\n  if (auth.kind === 'signed_out')")

  assert.match(projection, /const workCards = workRecordCards\(values\.historyNewest\)/)
  assert.match(projection, /const photoEntries = values\.entries\.filter\(entry => entry\.kind === 'photo'\)/)
  assert.match(projection, /const albums = homePhotoAlbums\(photoEntries, 'newest'\)/)
  assert.match(projection, /const albumCards = homePhotoAlbumCards\(albums\)/)
  assert.match(projection, /homeLibraryEntryCards\(values\.entries\.filter\(entry => entry\.kind !== 'photo'\)\)/)
  assert.match(projection, /cards: \[[\s\S]*\.\.\.activeWorkCards[\s\S]*\.\.\.albumCards[\s\S]*\.\.\.fileCards[\s\S]*\.\.\.historyWorkCards/)
  assert.doesNotMatch(projection, /homeLibraryEntryCards\(values\.entries\)/)
})

test('My Rolo keeps aggregate navigation on typed app-owned destinations', () => {
  const projection = section(myRolo, 'const rolo = useMemo(() => {', "\n\n  if (auth.kind === 'signed_out')")
  const openCard = section(myRolo, 'async function openRoloCard(card: HomesroloCard)', '\n\n  function askRoloAboutCard')
  const destinationContract = section(cardContract, 'export type HomesroloCardDestination =', '/** Exact user actions')
  const destinationProjector = section(cardContract, 'function navigationDestination(', '\n\nfunction navigationGroup')

  for (const role of ['home_watch', 'timeline', 'home_details', 'people', 'work', 'library']) {
    assert.match(projection, new RegExp(`role: '${role}'`))
  }
  assert.match(projection, /homesroloNavigationCard\(\{/)
  assert.match(destinationContract, /kind: 'work'/)
  assert.match(destinationContract, /kind: 'library'/)
  assert.match(destinationContract, /kind: 'home_watch'/)
  assert.match(destinationContract, /kind: 'home_details' \| 'timeline' \| 'people'/)
  assert.match(destinationContract, /kind: 'work_index'/)
  assert.doesNotMatch(destinationContract, /\b(?:href|url)\b/i)
  assert.match(destinationProjector, /role === 'home_details'[\s\S]*role === 'home_watch'[\s\S]*role === 'timeline'[\s\S]*role === 'people'[\s\S]*role === 'library'/)
  assert.match(openCard, /const destination = card\.destination/)
  assert.match(openCard, /destination\.kind === 'library'/)
  assert.match(openCard, /destination\.kind === 'work'/)
  assert.match(openCard, /destination\.kind === 'home_watch'/)
  assert.match(openCard, /destination\.kind === 'home_details'/)
  assert.match(openCard, /destination\.kind === 'timeline'/)
  assert.match(openCard, /destination\.kind === 'people'/)
})

test('My Rolo exposes Browse, Add, and Library modes around one searchable visual deck', () => {
  assert.match(myRolo, /type HomeSurface = 'rolo' \| 'add' \| 'library'/)
  assert.match(myRolo, /\{ value: 'rolo', label: 'Browse'/)
  assert.match(myRolo, /\{ value: 'add', label: 'Add'/)
  assert.match(myRolo, /\{ value: 'library', label: 'Library'/)
  assert.match(myRolo, /if \(surface === 'rolo'\)/)
  assert.match(myRolo, /surface === 'add' && showUploadActions/)
  assert.match(myRolo, /surface === 'library' \? \(/)

  assert.match(myRolo, /const ROLO_DIVIDERS:[\s\S]*label: 'All'[\s\S]*label: 'Work'[\s\S]*label: 'Care'[\s\S]*label: 'Home'[\s\S]*label: 'People'[\s\S]*label: 'Saved'/)
  assert.match(myRolo, /<RoloDeck[\s\S]*cards=\{rolo\.cards\}[\s\S]*dividers=\{ROLO_DIVIDERS\}/)
  assert.match(myRolo, /renderMedia=\{renderRoloMedia\}/)
  assert.match(myRolo, /searchPlaceholder="Find anything your home remembers"/)
  assert.match(myRolo, /function renderRoloMedia\(card: HomesroloCard, variant: 'compact' \| 'full'\)[\s\S]*<ProtectedImage/)
})

test('an exact My Rolo photo bridge is revalidated inside Rolo before consent', () => {
  const askBridge = section(myRolo, 'function askRoloAboutCard(card: HomesroloCard)', '\n\n  const previewOverlay')
  assert.match(askBridge, /const cover = cardCoverPhoto\(card\)/)
  assert.match(askBridge, /cover\?\.source === 'uploads' \? cover\.artifact\.artifactRef : null/)
  assert.match(askBridge, /\.\.\.\(card\.projectRef \? \{ projectRef: card\.projectRef \} : \{\}\)/)
  assert.match(askBridge, /\.\.\.\(artifactRef \? \{ artifactRef \} : \{\}\)/)

  assert.match(roloChat, /const artifactRefValue = oneRouteParam\(rawArtifactRef\)/)
  assert.match(roloChat, /artifactRefValue && isArtifactRef\(artifactRefValue\)/)

  const artifactLoad = section(roloChat, 'void api.listArtifacts(homeId).then(artifacts => {', '\n    return () => { active = false }')
  assert.match(artifactLoad, /const photos = artifacts\.filter\(item => item\.kind === 'photo'\)/)
  assert.match(artifactLoad, /photos\.find\(item => item\.artifactRef === routeArtifactRef\)/)

  const routeAttachment = section(roloChat, 'if (!routeArtifactRef) {', '\n  }, [homeId, routeArtifactRef, savedPhotos, visionEnabled])')
  assert.match(routeAttachment, /consumedRoutePhoto\.current = null/)
  assert.match(routeAttachment, /if \(!visionEnabled \|\| consumedRoutePhoto\.current === routeArtifactRef\) return/)
  assert.match(routeAttachment, /savedPhotos\.find\(item => item\.homeRef === homeId[\s\S]*item\.kind === 'photo'[\s\S]*item\.artifactRef === routeArtifactRef\)/)
  assert.match(routeAttachment, /setAttachment\(\{ state: 'saved', artifact \}\)/)
  assert.match(routeAttachment, /setRememberedAttachment\(\{ artifactRef: artifact\.artifactRef, title: artifact\.displayName \}\)/)
  assert.match(routeAttachment, /setApprovedPhotoMessage\(null\)/)

  const send = section(roloChat, 'async function send(', '\n  async function saveProposal(')
  assert.match(send, /const reply = await api\.askRolo\([\s\S]*artifactRef: selectedPhoto\.artifactRef,[\s\S]*consentToAnalyze: true/)
  assert.match(send, /if \(prompt !== undefined \|\| routeArtifactRef\) router\.setParams\(\{ prompt: undefined, artifactRef: undefined \}\)/)
})
