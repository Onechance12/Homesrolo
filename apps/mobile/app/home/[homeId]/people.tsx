import { useCallback, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, router, useGlobalSearchParams } from 'expo-router'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { Button, Card, Loading, Notice, Page, SectionTitle, Tag } from '../../../src/components/ui.tsx'
import { useResource } from '../../../src/hooks/useResource.ts'
import { categoryLabel, colors, space } from '../../../src/theme.ts'

export default function PeopleScreen() {
  const { homeId } = useGlobalSearchParams<{ homeId: string }>()
  const { state: auth, api, refreshSession } = useSession()
  const loader = useCallback(() => api.listWork(homeId), [api, homeId])
  const resource = useResource(loader, auth.kind === 'signed_in')
  const people = useMemo(() => {
    if (resource.state.kind !== 'ready') return []
    const byName = new Map<string, { name: string; count: number; areas: Set<string>; latest: string | null }>()
    for (const work of resource.state.value) {
      const name = work.professionalLabel?.trim()
      if (!name || work.archived) continue
      const key = name.toLocaleLowerCase()
      const entry = byName.get(key) ?? { name, count: 0, areas: new Set<string>(), latest: null }
      entry.count += 1
      entry.areas.add(categoryLabel[work.category])
      if (work.occurredOn && (!entry.latest || work.occurredOn > entry.latest)) entry.latest = work.occurredOn
      byName.set(key, entry)
    }
    return [...byName.values()].sort((left, right) => right.count - left.count)
  }, [resource.state])

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }

  return (
    <Page>
      <HomeHeader
        section="Pros"
        title="Keep the right people close."
        detail="Start with the help you need, then remember the people and companies that actually worked on this home."
      />
      <Card accent>
        <View style={styles.safetyRow}>
          <View style={styles.shield}><Ionicons name="shield-checkmark-outline" size={28} color={colors.ink} /></View>
          <View style={styles.safetyCopy}>
            <Text style={styles.safetyTitle}>Need someone for the work?</Text>
            <Text style={styles.copy}>Rolo can help you describe the job, identify the right kind of professional, and prepare the questions to ask.</Text>
          </View>
        </View>
        <Button
          label="Get help choosing a pro"
          icon="sparkles-outline"
          onPress={() => router.push({
            pathname: '/home/[homeId]/rolo',
            params: {
              homeId,
              prompt: 'Help me figure out what kind of professional I need, what information I should give them, and what questions I should ask before inviting anyone to my home.',
            },
          })}
        />
      </Card>

      <SectionTitle title="Saved pros" detail="Built from the company or person saved on each real work record—never invented listings." />
      {resource.state.kind === 'loading' ? <Loading label="Opening your people…" /> : null}
      {resource.state.kind === 'error' ? <Notice message="People could not load." actionLabel="Try again" onAction={resource.reload} /> : null}
      {people.map(person => (
        <Card key={person.name.toLocaleLowerCase()}>
          <View style={styles.personTop}>
            <View style={styles.avatar}><Text style={styles.initial}>{person.name.slice(0, 1).toUpperCase()}</Text></View>
            <View style={styles.personCopy}>
              <Text style={styles.personName}>{person.name}</Text>
              <Text style={styles.personMeta}>{person.count} saved {person.count === 1 ? 'record' : 'records'}{person.latest ? ` · latest ${person.latest}` : ''}</Text>
            </View>
          </View>
          <View style={styles.tags}>{[...person.areas].map(area => <Tag key={area} tone="aqua">{area}</Tag>)}</View>
        </Card>
      ))}
      {resource.state.kind === 'ready' && people.length === 0 ? (
        <Notice message="No pros are saved for this home yet. Add a person or company to a real plan and this Rolodex builds itself." />
      ) : null}
      <Button
        label="Add through a plan"
        icon="layers-outline"
        onPress={() => router.push({ pathname: '/home/[homeId]/work', params: { homeId } })}
      />
      <Text style={styles.disclosure}>A saved name is history, not an endorsement. You control what a professional can see.</Text>
    </Page>
  )
}

const styles = StyleSheet.create({
  safetyRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  shield: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  safetyCopy: { flex: 1, gap: 4 },
  safetyTitle: { color: colors.cream, fontSize: 20, fontWeight: '900' },
  copy: { color: colors.slate, fontSize: 13, lineHeight: 19 },
  personTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.inkSoft, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.lime, fontSize: 20, fontWeight: '900' },
  personCopy: { flex: 1, gap: 3 },
  personName: { color: colors.cream, fontSize: 19, fontWeight: '900' },
  personMeta: { color: colors.slate, fontSize: 12, lineHeight: 17 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  disclosure: { color: colors.smoke, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: space.lg },
})
