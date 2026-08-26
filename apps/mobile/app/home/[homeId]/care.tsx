import { useCallback, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, router, useGlobalSearchParams } from 'expo-router'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { WorkCard } from '../../../src/components/WorkCard.tsx'
import { Button, Card, Loading, Notice, Page, SectionTitle, Tag } from '../../../src/components/ui.tsx'
import { useResource } from '../../../src/hooks/useResource.ts'
import { colors, radius, space } from '../../../src/theme.ts'

export default function CareScreen() {
  const { homeId } = useGlobalSearchParams<{ homeId: string }>()
  const { state: auth, api, previewMode, refreshSession } = useSession()
  const loader = useCallback(async () => {
    const [home, work, artifacts] = await Promise.all([
      api.getHome(homeId), api.listWork(homeId), api.listArtifacts(homeId),
    ])
    return { home, work: work.filter(item => !item.archived), artifacts }
  }, [api, homeId])
  const resource = useResource(loader, auth.kind === 'signed_in')

  const values = useMemo(() => {
    if (resource.state.kind !== 'ready') return null
    const { work, artifacts } = resource.state.value
    const active = work.filter(item => item.status === 'planned' || item.status === 'in_progress')
    const care = work.filter(item => item.workKind === 'service' || item.workKind === 'repair' || item.workKind === 'issue')
    const categories = new Set(work.map(item => item.category))
    const photos = artifacts.filter(item => item.kind === 'photo').length
    return { active, care, categories, photos }
  }, [resource.state])

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Loading label="Checking the house…" />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }
  if (resource.state.kind === 'loading') return <Loading label="Checking the house…" />
  if (resource.state.kind === 'error' || !values) {
    const previewDetail = previewMode && resource.state.kind === 'error'
      ? ` (${resource.state.message})`
      : ''
    return <Page><Notice message={`Care could not load.${previewDetail}`} actionLabel="Try again" onAction={resource.reload} /></Page>
  }

  const { home } = resource.state.value
  return (
    <Page>
      <HomeHeader
        section="Care"
        title="Keep an eye on the whole home."
        detail={`${home.displayLabel} · regular care, repairs, issues, and condition checks in one rhythm.`}
      />

      <Card accent>
        <View style={styles.watchRow}>
          <View style={styles.watchIcon}><Ionicons name="eye-outline" size={27} color={colors.ink} /></View>
          <View style={styles.watchCopy}>
            <Tag tone="lime">Home Watch</Tag>
            <Text style={styles.watchTitle}>A repeatable checkup—not a roofing pitch.</Text>
          </View>
        </View>
        <Text style={styles.copy}>Walk the same areas a few times a year, take comparable photos, and save what changed. Roof Watch lives inside Home Watch as the roof-specific check.</Text>
        <Button
          label="Talk through a home checkup"
          icon="sparkles-outline"
          onPress={() => router.push({
            pathname: '/home/[homeId]/rolo',
            params: { homeId, prompt: 'Help me do a seasonal Home Watch checkup and record what I see.' },
          })}
        />
      </Card>

      <SectionTitle title="Your care rhythm" detail="Small wins build a useful home memory." />
      <View style={styles.badges}>
        <Badge icon="camera-outline" title="Photo habit" earned={values.photos > 0} detail={`${values.photos} saved`} />
        <Badge icon="layers-outline" title="Whole home" earned={values.categories.size >= 3} detail={`${values.categories.size} areas`} />
        <Badge icon="checkmark-circle-outline" title="Care keeper" earned={values.care.length >= 3} detail={`${values.care.length} entries`} />
      </View>

      <SectionTitle title="Needs attention" detail="Planned and active work stays visible here." />
      {values.active.slice(0, 5).map(item => <WorkCard key={item.projectRef} work={item} />)}
      {values.active.length === 0 ? <Notice message="Nothing is marked planned or in progress right now." /> : null}

      <SectionTitle title="Care already remembered" />
      {values.care.slice(0, 5).map(item => <WorkCard key={item.projectRef} work={item} />)}
      {values.care.length === 0 ? (
        <Notice message="Log an AC service, repair, pest visit, yard service, leak, or any other care from Work or Rolo." />
      ) : null}
    </Page>
  )
}

function Badge({ icon, title, detail, earned }: {
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly title: string
  readonly detail: string
  readonly earned: boolean
}) {
  return (
    <View style={[styles.badge, earned && styles.badgeEarned]}>
      <Ionicons name={icon} size={22} color={earned ? colors.lime : colors.smoke} />
      <Text style={styles.badgeTitle}>{title}</Text>
      <Text style={styles.badgeDetail}>{earned ? detail : 'Keep building'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  watchRow: { flexDirection: 'row', gap: 13, alignItems: 'center' },
  watchIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  watchCopy: { flex: 1, gap: 7 },
  watchTitle: { color: colors.cream, fontSize: 19, lineHeight: 23, fontWeight: '900' },
  copy: { color: colors.slate, fontSize: 14, lineHeight: 21 },
  badges: { flexDirection: 'row', gap: space.sm },
  badge: {
    flex: 1, minHeight: 120, borderRadius: radius.medium, borderWidth: 1,
    borderColor: colors.line, backgroundColor: colors.inkRaised, padding: 12, gap: 6,
  },
  badgeEarned: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  badgeTitle: { color: colors.cream, fontWeight: '900', fontSize: 13 },
  badgeDetail: { color: colors.slate, fontSize: 11, lineHeight: 15 },
})
