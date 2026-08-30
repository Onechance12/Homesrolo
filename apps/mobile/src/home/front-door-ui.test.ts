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
    { route: 'care', label: 'My Rolo' },
    { route: 'work', label: 'Work' },
    { route: 'people', label: 'People' },
  ])
  assert.match(tabs, /name="index" options=\{\{ href: null \}\}/)
  assert.match(tabs, /name="account" options=\{\{ href: null \}\}/)
  assert.match(tabs, /<HomeRouteProvider key=\{homeId\} homeId=\{homeId\}>/)
  assert.doesNotMatch(tabs, /title: 'Today'/)
  assert.doesNotMatch(tabs, /title: 'Pros'/)
  assert.doesNotMatch(tabs, /name="pro"/)
})

test('the shared phone chrome preserves iPhone safe areas and readable Rolodex tabs', () => {
  const tabs = read('app/home/[homeId]/_layout.tsx')
  const myRolo = read('app/home/[homeId]/care.tsx')
  const workRolo = read('app/home/[homeId]/work/index.tsx')
  const deck = read('src/components/RoloDeck.tsx')
  const cards = read('src/components/RoloCardView.tsx')

  assert.match(tabs, /const bottomInset = Math\.max\(insets\.bottom, Platform\.OS === 'web' \? 8 : 0\)/)
  assert.match(tabs, /height: 60 \+ bottomInset/)
  assert.match(tabs, /paddingTop: 2/)
  assert.match(tabs, /paddingBottom: bottomInset,/)
  assert.match(tabs, /tabBarLabelStyle: \{ fontSize: 11, lineHeight: 14, fontWeight: '700' \}/)
  assert.match(myRolo, /const compactDeck = window\.width < 600 \|\| window\.height < 820/)
  assert.match(myRolo, /function MyRoloLoading\(\)[\s\S]*?<SafeAreaView[\s\S]*?styles\.roloLoading[\s\S]*?<Loading label="Opening your home…"/)
  assert.match(myRolo, /auth\.kind === 'loading'\) return <MyRoloLoading \/>/)
  assert.match(myRolo, /resource\.state\.kind === 'loading'\) return <MyRoloLoading \/>/)
  assert.match(myRolo, /roloLoading: \{[\s\S]*?flex: 1,[\s\S]*?paddingHorizontal: space\.lg,[\s\S]*?paddingTop: space\.sm,[\s\S]*?paddingBottom: space\.xs/)
  assert.doesNotMatch(myRolo, /roloLoading: \{[^}]*justifyContent: 'center'/)
  assert.match(myRolo, /<RoloDeck[\s\S]*?fillAvailable[\s\S]*?peekSize=/)
  assert.match(workRolo, /<RoloDeck[\s\S]*?fillAvailable[\s\S]*?peekSize=/)
  assert.doesNotMatch(myRolo, /window\.height - 440/)
  assert.doesNotMatch(workRolo, /window\.height - 390/)
  assert.match(deck, /deckViewportHeight - CARD_GAP - resolvedPeek/)
  assert.match(deck, /rootFill: \{ flex: 1, minHeight: 0 \}/)
  assert.match(deck, /listSlotFill: \{ flex: 1, minHeight: 0 \}/)
  assert.match(cards, /fileTab: \{[\s\S]*?zIndex: 2,[\s\S]*?justifyContent: 'center'/)
  assert.match(cards, /shell: \{ width: '100%', paddingTop: 26 \}/)
  assert.match(cards, /compactBody: \{ flex: 1, minHeight: 0, gap: space\.sm \}/)
  assert.doesNotMatch(cards, /compactBody: \{[^}]*flexDirection: 'row'/)
  assert.match(cards, /compactBodyWithoutMedia: \{ justifyContent: 'space-between' \}/)
  assert.match(cards, /mediaCompact: \{[\s\S]*?flex: 1,[\s\S]*?width: '100%',[\s\S]*?minHeight: 0,[\s\S]*?alignSelf: 'center'/)
  assert.doesNotMatch(cards, /mediaCompact: \{[^}]*maxHeight:/)
  assert.match(cards, /mediaMetaOverlay: \{ position: 'absolute', left: 8, right: 8, bottom: 8 \}/)
  assert.match(myRolo, /resizeMode=\{variant === 'compact' \? 'contain' : 'cover'\}/)
  assert.match(myRolo, /roloMedia: \{ width: '100%', height: '100%', backgroundColor: colors\.inkSoft \}/)
})

test('vertical Rolodexes flip from the exposed card tab without carousel bubbles', () => {
  const deck = read('src/components/RoloDeck.tsx')
  const cards = read('src/components/RoloCardView.tsx')

  assert.match(deck, /onTabPress=\{!horizontal && !active \? \(\) => openPage\(index\) : undefined\}/)
  assert.match(deck, /Flip to card \$\{index \+ 1\} of \$\{search\.visibleCards\.length\}/)
  assert.match(cards, /onTabPress \? \([\s\S]*?<Pressable[\s\S]*?accessibilityHint="Shows this card"/)
  assert.match(deck, /accessibilityValue=\{\{[\s\S]*?now: safeActiveIndex \+ 1/)
  assert.match(deck, /\{horizontal && search\.visibleCards\.length > 0 \? \([\s\S]*?<PagingIndicator/)
})

test('vertical Rolodex cards settle into one centered resting position', () => {
  const deck = read('src/components/RoloDeck.tsx')

  assert.match(deck, /const verticalViewportHeight = !horizontal && fillAvailable && deckViewportHeight > 0[\s\S]*?\? deckViewportHeight[\s\S]*?: viewportHeight/)
  assert.match(deck, /Math\.round\(\(verticalViewportHeight - itemInterval\) \/ 2\)/)
  assert.match(deck, /paddingTop: verticalSnapInset, paddingBottom: verticalSnapInset/)
  assert.match(deck, /WEB_VERTICAL_LIST_SNAP[\s\S]*?scrollSnapType: 'y mandatory'/)
  assert.match(deck, /WEB_VERTICAL_CARD_SNAP[\s\S]*?scrollSnapAlign: 'center'/)
  assert.match(deck, /snapToAlignment="start"/)
  assert.match(deck, /offset: itemInterval \* index/)
  assert.match(deck, /Math\.round\(offset \/ itemInterval\)/)
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
  assert.match(rolo, /<RoloCardView[\s\S]*card=\{workRecordCard\(activeWork\[0\]\)\}[\s\S]*variant="compact"/)
  assert.match(home, /role: 'people'[\s\S]*title: 'People & companies'/)
  assert.match(home, /destination\.kind === 'people'[\s\S]*pathname: '\/home\/\[homeId\]\/people'/)
})

test('new Rolo work immediately becomes the same card shown everywhere else', () => {
  const rolo = read('app/home/[homeId]/rolo.tsx')

  assert.match(rolo, /setKnownWork\(current => \[work, \.\.\.current\.filter\(item => item\.projectRef !== work\.projectRef\)\]\)/)
  assert.match(rolo, /const suggestedWork = suggestion\?\.destination === 'work'[\s\S]*knownWork\.find/)
  assert.match(rolo, /suggestedWork \? \([\s\S]*<RoloCardView[\s\S]*workRecordCard\(suggestedWork\)/)
})

test('Rolo refreshes home context safely and People behaves like a primary tab', () => {
  const rolo = read('app/home/[homeId]/rolo.tsx')
  const people = read('app/home/[homeId]/people.tsx')

  assert.match(rolo, /useFocusEffect\(useCallback\(\(\) => \{[\s\S]*setHomeSummary\(null\)[\s\S]*setActiveWork\(\[\]\)/)
  assert.match(rolo, /setHomeSummary\(homeResult\.status === 'fulfilled' \? homeResult\.value : null\)/)
  assert.match(rolo, /persistenceKey && hydratedScope !== persistenceKey[\s\S]*Opening Rolo…/)
  assert.doesNotMatch(people, /accessibilityLabel="Back to Home"/)
})

test('Account switches existing spaces without recruiting a homeowner into Pro', () => {
  const account = read('app/account.tsx')

  assert.doesNotMatch(account, /Do you also run a home-service company\?/)
  assert.doesNotMatch(account, /Add a company workspace/)
  assert.match(account, /activeOrganizations\.length > 0/)
})
