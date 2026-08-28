import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(relative: string) {
  return readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')
}

test('the homeowner app is chat-first with four stable destinations', () => {
  const tabs = read('app/home/[homeId]/_layout.tsx')
  const visible = [...tabs.matchAll(/<Tabs\.Screen name="([^"]+)" options=\{\{ title: '([^']+)'/g)]
    .map(match => ({ route: match[1], label: match[2] }))

  assert.deepEqual(visible, [
    { route: 'rolo', label: 'Rolo' },
    { route: 'care', label: 'Home' },
    { route: 'work', label: 'Work' },
    { route: 'account', label: 'Account' },
  ])
  assert.match(tabs, /name="index" options=\{\{ href: null \}\}/)
  assert.match(tabs, /name="people" options=\{\{ href: null \}\}/)
  assert.match(tabs, /<HomeRouteProvider key=\{homeId\} homeId=\{homeId\}>/)
  assert.doesNotMatch(tabs, /title: 'Today'/)
  assert.doesNotMatch(tabs, /title: 'Pros'/)
  assert.doesNotMatch(tabs, /name="pro"/)
})

test('old home roots resolve to Rolo and Account stays inside the homeowner tab shell', () => {
  const frontDoor = read('app/home/[homeId]/index.tsx')
  const nestedAccount = read('app/home/[homeId]/account.tsx')
  const account = read('app/account.tsx')
  const header = read('src/components/HomeHeader.tsx')

  assert.match(frontDoor, /pathname: '\/home\/\[homeId\]\/rolo'/)
  assert.match(nestedAccount, /<AccountWorkspace embedded \/>/)
  assert.match(account, /showAccount=\{false\}/)
  assert.match(header, /pathname: '\/home\/\[homeId\]\/account'/)
})

test('Rolo keeps contractor discovery and active work reachable from the front door', () => {
  const rolo = read('app/home/[homeId]/rolo.tsx')
  const home = read('app/home/[homeId]/care.tsx')

  assert.match(rolo, /label: 'Find or invite a pro'[\s\S]*destination: 'people'/)
  assert.match(rolo, /pathname: '\/home\/\[homeId\]\/people'/)
  assert.match(rolo, /<WorkCard work=\{activeWork\[0\]\} compact \/>/)
  assert.match(home, /title="People & companies"[\s\S]*pathname: '\/home\/\[homeId\]\/people'/)
})

test('Rolo refreshes home context safely and hidden People has a deterministic return', () => {
  const rolo = read('app/home/[homeId]/rolo.tsx')
  const people = read('app/home/[homeId]/people.tsx')

  assert.match(rolo, /useFocusEffect\(useCallback\(\(\) => \{[\s\S]*setHomeSummary\(null\)[\s\S]*setActiveWork\(\[\]\)/)
  assert.match(rolo, /setHomeSummary\(homeResult\.status === 'fulfilled' \? homeResult\.value : null\)/)
  assert.match(rolo, /persistenceKey && hydratedScope !== persistenceKey[\s\S]*Opening Rolo…/)
  assert.match(people, /accessibilityLabel="Back to Home"[\s\S]*pathname: '\/home\/\[homeId\]\/care'/)
})

test('Account switches existing spaces without recruiting a homeowner into Pro', () => {
  const account = read('app/account.tsx')

  assert.doesNotMatch(account, /Do you also run a home-service company\?/)
  assert.doesNotMatch(account, /Add a company workspace/)
  assert.match(account, /activeOrganizations\.length > 0/)
})
