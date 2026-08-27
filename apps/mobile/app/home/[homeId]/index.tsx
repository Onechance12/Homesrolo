import { useCallback, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, router } from 'expo-router'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { WorkCard } from '../../../src/components/WorkCard.tsx'
import { Button, Card, Loading, Notice, Page, SectionTitle, Tag } from '../../../src/components/ui.tsx'
import { useHomeId } from '../../../src/home/HomeRouteProvider.tsx'
import { useResource } from '../../../src/hooks/useResource.ts'
import { colors, radius, space } from '../../../src/theme.ts'

const ACTIONS = [
  {
    icon: 'construct-outline' as const,
    title: 'Fix something',
    detail: 'Broken, leaking, or not right',
    tone: colors.warning,
    prompt: 'Something at home is not working.',
  },
  {
    icon: 'color-wand-outline' as const,
    title: 'Plan work',
    detail: 'Pool, remodel, paint, roof, or yard',
    tone: colors.aqua,
    prompt: 'I want to plan a home project.',
  },
  {
    icon: 'repeat-outline' as const,
    title: 'Schedule care',
    detail: 'Yard, cleaning, pest, or a tune-up',
    tone: colors.mint,
    prompt: 'I need routine help at my home.',
  },
  {
    icon: 'time-outline' as const,
    title: 'Add past work',
    detail: 'Save an older repair, service, or upgrade',
    tone: colors.lime,
    prompt: 'I want to add work that already happened.',
  },
]

export default function TodayScreen() {
  const homeId = useHomeId()
  const { state: auth, api, refreshSession } = useSession()
  const loader = useCallback(async () => {
    const [home, work] = await Promise.all([api.getHome(homeId), api.listWork(homeId)])
    return { home, work: work.filter(item => !item.archived) }
  }, [api, homeId])
  const bundle = useResource(loader, auth.kind === 'signed_in')
  const workViews = useMemo(() => {
    if (bundle.state.kind !== 'ready') return { active: [], finished: [] }
    const newest = [...bundle.state.value.work].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    return {
      active: newest.filter(item => item.status === 'planned' || item.status === 'in_progress'),
      finished: newest.filter(item => item.status === 'completed'),
    }
  }, [bundle.state])

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }
  if (bundle.state.kind === 'loading') return <Loading label="Opening today…" />
  if (bundle.state.kind === 'error') {
    return <Page><Notice message="Today could not load." actionLabel="Try again" onAction={bundle.reload} /></Page>
  }

  const { home } = bundle.state.value
  const openRolo = (prompt: string) => router.push({
    pathname: '/home/[homeId]/rolo',
    params: { homeId, prompt },
  })

  return (
    <Page>
      <HomeHeader
        section="Today"
        title="What’s going on?"
        detail={`${home.displayLabel} · ${home.privateLocationLabel}`}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ask Rolo about this home"
        onPress={() => openRolo('I need help with something at home.')}
        style={({ pressed }) => [styles.roloBar, pressed && styles.pressed]}
      >
        <View style={styles.roloMark}><Ionicons name="chatbubble-ellipses" size={21} color={colors.ink} /></View>
        <View style={styles.roloCopy}>
          <Text style={styles.roloTitle}>What’s going on at home?</Text>
          <Text style={styles.roloDetail}>Tell Rolo, or choose a shortcut below.</Text>
        </View>
        <Ionicons name="arrow-forward" size={20} color={colors.lime} />
      </Pressable>

      <View style={styles.actionGrid}>
        {ACTIONS.map(action => (
          <Pressable
            key={action.title}
            accessibilityRole="button"
            accessibilityLabel={action.title}
            accessibilityHint={action.detail}
            onPress={() => openRolo(action.prompt)}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${action.tone}24` }]}>
              <Ionicons name={action.icon} size={24} color={action.tone} />
            </View>
            <Text style={styles.actionTitle}>{action.title}</Text>
            <Text style={styles.actionDetail}>{action.detail}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle
        title="Open work"
        detail={workViews.active.length > 0
          ? `${workViews.active.length} active ${workViews.active.length === 1 ? 'item' : 'items'}.`
          : 'Projects, repairs, and service will appear here.'}
      />
      {workViews.active.slice(0, 3).map(item => <WorkCard key={item.projectRef} work={item} />)}
      {workViews.active.length === 0 ? (
        <Card>
          <Tag tone="lime">All clear</Tag>
          <Text style={styles.emptyTitle}>Nothing open right now.</Text>
          <Text style={styles.emptyCopy}>Start a repair, service, or project whenever you need it.</Text>
        </Card>
      ) : null}
      <Button
        label={workViews.active.length > 0 ? 'See all work' : 'Open work'}
        icon="layers-outline"
        quiet
        onPress={() => router.push({ pathname: '/home/[homeId]/work', params: { homeId } })}
      />

      {workViews.finished.length > 0 ? (
        <>
          <SectionTitle title="Recently finished" detail="Recent work saved to this home." />
          {workViews.finished.slice(0, 2).map(item => <WorkCard key={item.projectRef} work={item} compact />)}
        </>
      ) : null}
    </Page>
  )
}

const styles = StyleSheet.create({
  roloBar: {
    minHeight: 76,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.lime,
    backgroundColor: colors.limeSoft,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roloMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roloCopy: { flex: 1, gap: 3 },
  roloTitle: { color: colors.cream, fontSize: 17, fontWeight: '800' },
  roloDetail: { color: colors.slate, fontSize: 12, lineHeight: 17 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 132,
    minHeight: 112,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.inkRaised,
    padding: 13,
    gap: 7,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: { color: colors.cream, fontSize: 15, lineHeight: 19, fontWeight: '800' },
  actionDetail: { color: colors.slate, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  emptyTitle: { color: colors.cream, fontSize: 19, lineHeight: 24, fontWeight: '800' },
  emptyCopy: { color: colors.slate, fontSize: 14, lineHeight: 20 },
})
