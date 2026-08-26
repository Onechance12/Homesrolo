import { useCallback, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, router, useGlobalSearchParams } from 'expo-router'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { WorkCard } from '../../../src/components/WorkCard.tsx'
import { Button, Card, Loading, Notice, Page, SectionTitle, Tag } from '../../../src/components/ui.tsx'
import { useResource } from '../../../src/hooks/useResource.ts'
import { colors, radius, space } from '../../../src/theme.ts'

const ACTIONS = [
  {
    icon: 'construct-outline' as const,
    title: 'Fix a problem',
    detail: 'Something broke or does not seem right',
    tone: colors.warning,
    prompt: 'Something at my home is not working. Help me figure out what is safe to check, what photos or details would help, and whether I need a professional.',
  },
  {
    icon: 'color-wand-outline' as const,
    title: 'Plan a project',
    detail: 'Pool, remodel, paint, roof, or another idea',
    tone: colors.aqua,
    prompt: 'I want to plan a home project. Ask me what I want, where it is, what matters to me, ideas or photos I already have, my budget, and timing. Help me turn it into a clear plan I can save.',
  },
  {
    icon: 'repeat-outline' as const,
    title: 'Get routine help',
    detail: 'Yard care, service, cleaning, pest, and more',
    tone: colors.mint,
    prompt: 'I need routine help at my home, such as yard care, heating and air service, pest control, cleaning, or another recurring service. Help me describe exactly what I need and create a service plan.',
  },
  {
    icon: 'time-outline' as const,
    title: 'Add past work',
    detail: 'Bring an old repair or improvement into the Rolo',
    tone: colors.lime,
    prompt: "Help me add past work to this home's history. Ask only what matters: what was done, when it happened, who did it, and what proof I still have.",
  },
]

export default function TodayScreen() {
  const { homeId } = useGlobalSearchParams<{ homeId: string }>()
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
        title="What needs doing?"
        detail={`${home.displayLabel} · ${home.privateLocationLabel}`}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ask Rolo about this home"
        onPress={() => openRolo('I need help with my home. Ask me what I am trying to fix, plan, schedule, or understand.')}
        style={({ pressed }) => [styles.roloBar, pressed && styles.pressed]}
      >
        <View style={styles.roloMark}><Ionicons name="sparkles" size={23} color={colors.ink} /></View>
        <View style={styles.roloCopy}>
          <Text style={styles.roloTitle}>Tell Rolo what you need</Text>
          <Text style={styles.roloDetail}>Talk it through—no forms or trade knowledge needed.</Text>
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

      <Pressable
        accessibilityRole="button"
        onPress={() => openRolo("I have a question about my home. Use this home's saved information when it helps, and tell me clearly what you can and cannot confirm.")}
        style={({ pressed }) => [styles.askCard, pressed && styles.pressed]}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={25} color={colors.aqua} />
        <View style={styles.roloCopy}>
          <Text style={styles.askTitle}>Ask about my home</Text>
          <Text style={styles.actionDetail}>Use what this home already remembers.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.slate} />
      </Pressable>

      <SectionTitle
        title="In motion"
        detail={workViews.active.length > 0 ? `${workViews.active.length} open ${workViews.active.length === 1 ? 'plan' : 'plans'} for this home.` : 'The work you start will stay within reach here.'}
      />
      {workViews.active.slice(0, 3).map(item => <WorkCard key={item.projectRef} work={item} />)}
      {workViews.active.length === 0 ? (
        <Card>
          <Tag tone="lime">Clear for now</Tag>
          <Text style={styles.emptyTitle}>No open work is waiting on you.</Text>
          <Text style={styles.emptyCopy}>Start with a problem, project idea, or routine service and Rolo will help shape the first plan.</Text>
        </Card>
      ) : null}
      <Button
        label={workViews.active.length > 0 ? 'See all plans' : 'Open plans'}
        icon="layers-outline"
        quiet
        onPress={() => router.push({ pathname: '/home/[homeId]/work', params: { homeId } })}
      />

      {workViews.finished.length > 0 ? (
        <>
          <SectionTitle title="Recently finished" detail="Completed work quietly becomes part of My Home." />
          {workViews.finished.slice(0, 2).map(item => <WorkCard key={item.projectRef} work={item} compact />)}
        </>
      ) : null}
    </Page>
  )
}

const styles = StyleSheet.create({
  roloBar: {
    minHeight: 84,
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
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roloCopy: { flex: 1, gap: 3 },
  roloTitle: { color: colors.cream, fontSize: 17, fontWeight: '900' },
  roloDetail: { color: colors.slate, fontSize: 12, lineHeight: 17 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: {
    width: '48%',
    minHeight: 158,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.inkRaised,
    padding: 15,
    gap: 9,
  },
  actionIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: { color: colors.cream, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  actionDetail: { color: colors.slate, fontSize: 12, lineHeight: 17 },
  askCard: {
    minHeight: 72,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.inkRaised,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  askTitle: { color: colors.cream, fontSize: 16, fontWeight: '900' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  emptyTitle: { color: colors.cream, fontSize: 19, lineHeight: 24, fontWeight: '900' },
  emptyCopy: { color: colors.slate, fontSize: 14, lineHeight: 20 },
})
