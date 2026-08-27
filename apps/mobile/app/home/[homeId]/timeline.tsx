import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { Button, Chip, Loading, Notice, Page, SectionTitle } from '../../../src/components/ui.tsx'
import { useHomeId } from '../../../src/home/HomeRouteProvider.tsx'
import {
  homeTimelineCounts,
  homeTimelineEntries,
  homeTimelinePage,
  type HomeTimelineDestination,
  type HomeTimelineEntry,
  type HomeTimelineEntryKind,
  type HomeTimelineFilter,
} from '../../../src/home/timeline.ts'
import { useResource } from '../../../src/hooks/useResource.ts'
import { colors, radius, space } from '../../../src/theme.ts'

const PAGE_SIZE = 18
const FILTERS: readonly { readonly value: HomeTimelineFilter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'work', label: 'Work' },
  { value: 'photos', label: 'Photos' },
  { value: 'files', label: 'Files' },
]
const KIND_LABEL: Readonly<Record<HomeTimelineEntryKind, string>> = {
  work: 'Work', photos: 'Photo', files: 'File',
}
const KIND_ICON: Readonly<Record<HomeTimelineEntryKind, keyof typeof Ionicons.glyphMap>> = {
  work: 'construct-outline', photos: 'image-outline', files: 'document-text-outline',
}

/** A chronological view projected from the records Homesrolo already owns. */
export default function HomeTimelineScreen() {
  const homeId = useHomeId()
  const { state: auth, api, refreshSession } = useSession()
  const checkupsEnabled = auth.kind === 'signed_in' && auth.session.capabilities.photoCheckups
  const loader = useCallback(async () => {
    const [home, work, artifactResult, checkupResult] = await Promise.all([
      api.getHome(homeId),
      api.listWork(homeId),
      api.listArtifacts(homeId)
        .then(value => ({ value, unavailable: false as const }))
        .catch(() => ({ value: [], unavailable: true as const })),
      checkupsEnabled
        ? api.listHomeCheckups(homeId)
          .then(value => ({ value, unavailable: false as const }))
          .catch(() => ({ value: [], unavailable: true as const }))
        : Promise.resolve({ value: [], unavailable: false as const }),
    ])
    return {
      home,
      entries: homeTimelineEntries(work, artifactResult.value, checkupResult.value),
      artifactsUnavailable: artifactResult.unavailable,
      checkupsUnavailable: checkupResult.unavailable,
    }
  }, [api, checkupsEnabled, homeId])
  const resource = useResource(loader, auth.kind === 'signed_in')
  const [filter, setFilter] = useState<HomeTimelineFilter>('all')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const entries = resource.state.kind === 'ready' ? resource.state.value.entries : []
  const counts = useMemo(() => homeTimelineCounts(entries), [entries])
  const page = useMemo(() => homeTimelinePage(entries, filter, limit), [entries, filter, limit])

  useEffect(() => { setLimit(PAGE_SIZE) }, [filter])

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }
  if (resource.state.kind === 'loading') return <Loading label="Putting this home’s story in order…" />
  if (resource.state.kind === 'error') {
    return (
      <Page>
        <HomeHeader section="My Home" title="Home timeline" />
        <BackToHome homeId={homeId} />
        <Notice message="This home’s timeline could not load." actionLabel="Try again" onAction={resource.reload} />
      </Page>
    )
  }

  const { home, artifactsUnavailable, checkupsUnavailable } = resource.state.value
  return (
    <Page>
      <HomeHeader
        section="The story so far"
        title="Home timeline"
        detail="Work, photos, and files in one history—built from what this home already remembers."
      />
      <BackToHome homeId={homeId} />

      <View style={styles.homeLine}>
        <View style={styles.homeMark}><Ionicons name="home-outline" size={20} color={colors.ink} /></View>
        <View style={styles.flex}>
          <Text style={styles.homeName}>{home.displayLabel}</Text>
          <Text style={styles.homePlace} numberOfLines={2}>{home.privateLocationLabel}</Text>
        </View>
      </View>

      <SectionTitle title="What this home remembers" detail="Choose a type, then open any card to see where it was saved." />
      <View style={styles.filters} accessibilityRole="tablist">
        {FILTERS.map(option => (
          <Chip
            key={option.value}
            label={`${option.label} · ${counts[option.value]}`}
            selected={filter === option.value}
            accessibilityHint={`Shows ${option.label.toLocaleLowerCase('en-US')} in this home timeline`}
            onPress={() => setFilter(option.value)}
          />
        ))}
      </View>

      {artifactsUnavailable ? (
        <Notice message="Work is shown, but saved photos and files could not be added to this view." actionLabel="Try again" onAction={resource.reload} />
      ) : null}
      {checkupsUnavailable ? (
        <Notice message="The rest of the timeline is shown, but Home Watch photos could not be added." actionLabel="Try again" onAction={resource.reload} />
      ) : null}

      {page.groups.length > 0 ? page.groups.map(group => (
        <View key={group.label} style={styles.yearGroup}>
          <View style={styles.yearHead}>
            <Text style={styles.year}>{group.label}</Text>
            <Text style={styles.yearCount}>{group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'} shown</Text>
          </View>
          <View style={styles.cards}>
            {group.entries.map(entry => (
              <TimelineCard key={`${entry.kind}-${entry.id}`} entry={entry} onOpen={() => openTimelineEntry(homeId, entry.destination)} />
            ))}
          </View>
        </View>
      )) : (
        <View style={styles.empty}>
          <View style={styles.emptyMark}><Ionicons name="home-outline" size={26} color={colors.lime} /></View>
          <View style={styles.flex}>
            <Text style={styles.emptyTitle}>{filter === 'all' ? 'The first entry starts here.' : `No ${filter} in this history.`}</Text>
            <Text style={styles.emptyCopy}>{filter === 'all'
              ? 'Add a repair, service visit, idea, project, photo, or file. Homesrolo will put it in order.'
              : 'Show everything to see the rest of this home’s story.'}</Text>
          </View>
          {filter === 'all' ? (
            <Button
              label="Add something to Work"
              accessibilityHint="Opens this home’s Work tab"
              icon="add"
              onPress={() => router.push({ pathname: '/home/[homeId]/work', params: { homeId } })}
            />
          ) : (
            <Button label="Show everything" quiet onPress={() => setFilter('all')} />
          )}
        </View>
      )}

      {page.remaining > 0 ? (
        <Button
          label={`Show ${Math.min(PAGE_SIZE, page.remaining)} more`}
          accessibilityHint={`${page.remaining} more matching timeline entries are available`}
          quiet
          icon="chevron-down"
          onPress={() => setLimit(current => current + PAGE_SIZE)}
        />
      ) : null}
    </Page>
  )
}

function BackToHome({ homeId }: { readonly homeId: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to My Home"
      accessibilityHint="Returns to the Home tab"
      onPress={() => router.replace({ pathname: '/home/[homeId]/care', params: { homeId } })}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}
    >
      <Ionicons name="chevron-back" size={19} color={colors.lime} />
      <Text style={styles.backText}>My Home</Text>
    </Pressable>
  )
}

function TimelineCard({ entry, onOpen }: {
  readonly entry: HomeTimelineEntry
  readonly onOpen: () => void
}) {
  const date = timelineDate(entry.date)
  const fullDate = timelineFullDate(entry.date)
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${entry.title}, ${KIND_LABEL[entry.kind]}, ${fullDate}`}
      accessibilityHint={destinationHint(entry.destination)}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.dateBadge}>
        <Text style={styles.dateMonth}>{date.month}</Text>
        <Text style={styles.dateDay}>{date.day}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.eyebrow} numberOfLines={1}>{entry.eyebrow}</Text>
          <View style={styles.kindPill}>
            <Ionicons name={KIND_ICON[entry.kind]} size={13} color={colors.aqua} />
            <Text style={styles.kindText}>{KIND_LABEL[entry.kind]}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle}>{entry.title}</Text>
        <Text style={styles.cardDetail}>{entry.detail} · {entry.context}</Text>
        <View style={styles.openLine}>
          <Text style={styles.openText}>Open</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.lime} />
        </View>
      </View>
    </Pressable>
  )
}

function openTimelineEntry(homeId: string, destination: HomeTimelineDestination) {
  if (destination.kind === 'work') {
    router.push({
      pathname: '/home/[homeId]/work/[projectRef]',
      params: { homeId, projectRef: destination.projectRef },
    })
    return
  }
  if (destination.kind === 'home_watch') {
    router.push({ pathname: '/home/[homeId]/checkups', params: { homeId } })
    return
  }
  router.replace({ pathname: '/home/[homeId]/care', params: { homeId } })
}

function destinationHint(destination: HomeTimelineDestination): string {
  if (destination.kind === 'work') return 'Opens the connected work record'
  if (destination.kind === 'home_watch') return 'Opens the connected Home Watch views'
  return 'Opens this home’s photo and file library'
}

function timelineDate(value: string | null): { readonly month: string; readonly day: string } {
  if (!value) return { month: 'DATE', day: '—' }
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return { month: 'DATE', day: '—' }
  return {
    month: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(parsed).toLocaleUpperCase(),
    day: new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(parsed),
  }
}

function timelineFullDate(value: string | null): string {
  if (!value) return 'date not recorded'
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return 'date not recorded'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(parsed)
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.76 },
  back: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
  backText: { color: colors.lime, fontSize: 14, fontWeight: '800' },
  homeLine: {
    minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.inkSoft, borderColor: colors.line, borderWidth: 1,
    borderRadius: radius.large, padding: space.md,
  },
  homeMark: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  homeName: { color: colors.cream, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  homePlace: { color: colors.slate, fontSize: 12, lineHeight: 17, marginTop: 2 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yearGroup: { gap: space.sm, marginTop: space.sm },
  yearHead: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  year: { color: colors.lime, fontSize: 22, lineHeight: 27, fontWeight: '900' },
  yearCount: { color: colors.smoke, fontSize: 11, fontWeight: '700' },
  cards: { gap: space.sm },
  card: {
    minHeight: 126, flexDirection: 'row', gap: 12, padding: space.md,
    borderRadius: radius.large, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkRaised,
  },
  cardPressed: { opacity: 0.82, borderColor: colors.lime, transform: [{ scale: 0.992 }] },
  dateBadge: {
    width: 50, height: 60, borderRadius: radius.medium, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.inkSoft, borderWidth: 1, borderColor: colors.line,
  },
  dateMonth: { color: colors.aqua, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  dateDay: { color: colors.cream, fontSize: 22, lineHeight: 25, fontWeight: '900' },
  cardBody: { flex: 1, gap: 5 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  eyebrow: { flex: 1, color: colors.aqua, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.65 },
  kindPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, backgroundColor: colors.inkSoft, paddingHorizontal: 8, paddingVertical: 4 },
  kindText: { color: colors.slate, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardTitle: { color: colors.cream, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  cardDetail: { color: colors.slate, fontSize: 12, lineHeight: 17 },
  openLine: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 1 },
  openText: { color: colors.lime, fontSize: 12, fontWeight: '900' },
  empty: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.large,
    backgroundColor: colors.inkRaised, padding: space.md, gap: space.md,
  },
  emptyMark: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.limeSoft },
  emptyTitle: { color: colors.cream, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  emptyCopy: { color: colors.slate, fontSize: 13, lineHeight: 19, marginTop: 4 },
})
