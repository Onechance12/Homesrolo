import { useCallback, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router } from 'expo-router'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { WorkCard } from '../../../src/components/WorkCard.tsx'
import { Button, Card, Loading, Notice, Page, SectionTitle } from '../../../src/components/ui.tsx'
import { useHomeId } from '../../../src/home/HomeRouteProvider.tsx'
import { useResource } from '../../../src/hooks/useResource.ts'
import { colors, radius, space } from '../../../src/theme.ts'

const QUICK_STARTS = [
  {
    icon: 'camera-outline' as const,
    title: 'Diagnose',
    tone: colors.warning,
    prompt: 'Help me figure out what is wrong. I can describe it or add a photo.',
  },
  {
    icon: 'sparkles-outline' as const,
    title: 'Plan work',
    tone: colors.aqua,
    prompt: 'I want to plan a home project.',
  },
  {
    icon: 'time-outline' as const,
    title: 'Log past work',
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
  const activeWork = useMemo(() => {
    if (bundle.state.kind !== 'ready') return []
    return [...bundle.state.value.work]
      .filter(item => item.status === 'planned' || item.status === 'in_progress')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
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
        title={home.displayLabel}
        detail={home.privateLocationLabel}
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
          <Text style={styles.roloDetail}>Tell Rolo, show a photo, or plan the next step.</Text>
        </View>
        <Ionicons name="arrow-forward" size={20} color={colors.lime} />
      </Pressable>

      <View style={styles.quickRow}>
        {QUICK_STARTS.map(action => (
          <Pressable
            key={action.title}
            accessibilityRole="button"
            accessibilityLabel={action.title}
            accessibilityHint="Starts this conversation with Rolo"
            onPress={() => openRolo(action.prompt)}
            style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
          >
            <View style={[styles.quickIcon, { backgroundColor: `${action.tone}24` }]}>
              <Ionicons name={action.icon} size={19} color={action.tone} />
            </View>
            <Text style={styles.quickLabel}>{action.title}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle
        title={activeWork.length > 0 ? 'Needs attention' : 'You’re caught up'}
        detail={activeWork.length > 1
          ? `${activeWork.length - 1} more ${activeWork.length - 1 === 1 ? 'item' : 'items'} waiting in Work.`
          : activeWork.length === 1 ? 'Your most recently updated work.' : 'Nothing open for this home right now.'}
      />
      {activeWork[0] ? <WorkCard work={activeWork[0]} compact /> : (
        <Card style={styles.clearCard}>
          <View style={styles.clearIcon}><Ionicons name="checkmark" size={20} color={colors.ink} /></View>
          <View style={styles.clearCopy}>
            <Text style={styles.clearTitle}>No loose ends</Text>
            <Text style={styles.clearDetail}>When something needs attention, start with Rolo above.</Text>
          </View>
        </Card>
      )}
      <Button
        label={activeWork.length > 0 ? `See all work · ${activeWork.length}` : 'Open Work'}
        icon="layers-outline"
        quiet
        onPress={() => router.push({ pathname: '/home/[homeId]/work', params: { homeId } })}
      />
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
  quickRow: { flexDirection: 'row', gap: 8 },
  quickAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 76,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.inkRaised,
    paddingHorizontal: 7,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  quickIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { color: colors.cream, fontSize: 11, lineHeight: 15, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  clearCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clearIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint },
  clearCopy: { flex: 1, gap: 2 },
  clearTitle: { color: colors.cream, fontSize: 15, lineHeight: 19, fontWeight: '800' },
  clearDetail: { color: colors.slate, fontSize: 12, lineHeight: 17 },
})
