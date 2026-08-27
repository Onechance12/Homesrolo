import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(relative: string) {
  return readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
}

test('keeps every restored home capability reachable inside the Expo shell', () => {
  const home = read('app/home/[homeId]/care.tsx')
  const tabs = read('app/home/[homeId]/_layout.tsx')
  assert.match(home, /title="Home details"[\s\S]*pathname: '\/home\/\[homeId\]\/details'/)
  assert.match(home, /title="Home Watch"[\s\S]*pathname: '\/home\/\[homeId\]\/checkups'/)
  assert.match(tabs, /name="details" options=\{\{ href: null \}\}/)
  assert.match(tabs, /name="checkups" options=\{\{ href: null \}\}/)
  assert.match(tabs, /name="projects\/\[projectId\]" options=\{\{ href: null \}\}/)
  assert.match(tabs, /name="pros\/\[slug\]" options=\{\{ href: null \}\}/)
})

test('new-home onboarding reviews structured fields and saves the Home Record before opening it', () => {
  const homes = read('app/homes.tsx')
  assert.match(homes, /label="Street address"/)
  assert.match(homes, /label="City"/)
  assert.match(homes, /label="State"/)
  assert.match(homes, /label="ZIP"/)
  assert.match(homes, /Review this home/)
  assert.match(homes, /api\.getHomeRecord\(home\.homeRef\)/)
  assert.match(homes, /api\.updateHomeRecord\(home\.homeRef/)
  assert.match(homes, /openHome\(home\.homeRef\)/)
  assert.ok(homes.indexOf('api.updateHomeRecord(home.homeRef') < homes.indexOf('openHome(home.homeRef)'))
})

test('keeps a complete unified library reachable without rendering an unbounded list', () => {
  const home = read('app/home/[homeId]/care.tsx')
  assert.match(home, /homeLibraryEntries/)
  assert.match(home, /visibleHomeLibraryEntries/)
  assert.match(home, /Show \$\{Math\.min\(PHOTO_PAGE_SIZE, photoPage\.remaining\)\} more photos/)
  assert.match(home, /Show \$\{Math\.min\(FILE_PAGE_SIZE, filePage\.remaining\)\} more files/)
  assert.match(home, /Home Watch/)
  assert.match(home, /Whole home/)
  assert.match(home, /accessibilityRole="button"/)
})

test('hidden parity screens return to the explicit Home route', () => {
  const details = read('app/home/[homeId]/details.tsx')
  const checkups = read('app/home/[homeId]/checkups.tsx')
  assert.doesNotMatch(details, /router\.back\(\)/)
  assert.doesNotMatch(checkups, /router\.back\(\)/)
  assert.match(details, /pathname: '\/home\/\[homeId\]\/care'/)
  assert.match(checkups, /pathname: '\/home\/\[homeId\]\/care'/)
})

test('home details can recover from a stale revision instead of retrying forever', () => {
  const details = read('app/home/[homeId]/details.tsx')
  assert.match(details, /error instanceof NativeApiError && error\.code === 'conflict'/)
  assert.match(details, /actionLabel: 'Load latest'/)
  assert.match(details, /resource\.reload\(\)/)
})

test('expanded professional profiles retain their existing public contact actions', () => {
  const people = read('app/home/[homeId]/people.tsx')
  assert.match(people, /organization\.publicPhone/)
  assert.match(people, /organization\.publicEmail/)
  assert.match(people, /organization\.websiteUrl/)
  assert.match(people, /Linking\.openURL/)
  assert.match(people, /accessibilityRole="link"/)
})

test('work detail opens Rolo with the exact existing project context', () => {
  const detail = read('app/home/[homeId]/work/[projectRef].tsx')
  const rolo = read('app/home/[homeId]/rolo.tsx')
  const client = read('src/api/client.ts')
  assert.match(detail, /label="Ask Rolo about this work"/)
  assert.match(detail, /projectRef,[\s\S]*Help me review this work record/)
  assert.match(rolo, /isProjectRef\(projectRefValue\)/)
  assert.match(rolo, /api\.askRolo\([\s\S]*conversationProjectRef/)
  assert.match(rolo, /setConversationProjectRef\(conversation\.projectRef\)/)
  assert.match(rolo, /projectRef: conversationProjectRef/)
  assert.match(rolo, /Talk about something else/)
  assert.match(rolo, /router\.replace\(\{ pathname: '\/home\/\[homeId\]\/rolo'/)
  assert.doesNotMatch(rolo, /useRootNavigationState/)
  assert.match(rolo, /if \(prompt !== undefined\) router\.setParams\(\{ prompt: undefined \}\)/)
  assert.match(client, /\.\.\.\(projectRef \? \{ projectRef \} : \{\}\)/)
})

test('legacy Expo bookmarks resolve to one coherent app shell', () => {
  const projects = read('app/home/[homeId]/projects.tsx')
  const project = read('app/home/[homeId]/projects/[projectId].tsx')
  const documents = read('app/home/[homeId]/documents.tsx')
  const warranties = read('app/home/[homeId]/warranties.tsx')
  const pros = read('app/home/[homeId]/pros.tsx')
  const professional = read('app/home/[homeId]/pros/[slug].tsx')
  const settings = read('app/home/[homeId]/settings.tsx')
  const newHome = read('app/homes/new.tsx')
  assert.match(projects, /pathname: '\/home\/\[homeId\]\/work'/)
  assert.match(project, /pathname: '\/home\/\[homeId\]\/work\/\[projectRef\]'/)
  assert.match(documents, /pathname: '\/home\/\[homeId\]\/care'/)
  assert.match(warranties, /library: 'warranties'/)
  assert.match(pros, /pathname: '\/home\/\[homeId\]\/people'/)
  assert.match(professional, /professionalSlug/)
  assert.match(settings, /Redirect href="\/homes"/)
  assert.match(newHome, /add: '1'/)
})
