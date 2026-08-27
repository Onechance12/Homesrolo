import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, router } from 'expo-router'
import type { ProfessionalOrganization, WorkCategory } from '../../../src/api/model.ts'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import {
  Button, Card, Chip, Loading, Notice, Page, SectionTitle, Tag, TextField,
} from '../../../src/components/ui.tsx'
import { useHomeId } from '../../../src/home/HomeRouteProvider.tsx'
import { useResource } from '../../../src/hooks/useResource.ts'
import {
  PROFESSIONAL_TRADES, matchesProfessional, tradeLabel,
} from '../../../src/professional/presentation.ts'
import { categoryLabel, colors, radius, space } from '../../../src/theme.ts'

type SavedPerson = {
  readonly name: string
  readonly count: number
  readonly areas: ReadonlySet<string>
  readonly latest: string | null
}

export default function PeopleScreen() {
  const homeId = useHomeId()
  const { state: auth, api, refreshSession } = useSession()
  const invitationsEnabled = auth.kind === 'signed_in' && auth.session.capabilities.invitations
  const loader = useCallback(async () => {
    const [work, directory] = await Promise.all([
      api.listWork(homeId),
      invitationsEnabled ? api.listProfessionals() : Promise.resolve([]),
    ])
    return { work, directory }
  }, [api, homeId, invitationsEnabled])
  const resource = useResource(loader, auth.kind === 'signed_in')
  const [query, setQuery] = useState('')
  const [trade, setTrade] = useState<WorkCategory | 'all'>('all')
  const [selectedRef, setSelectedRef] = useState<string | null>(null)

  const view = useMemo(() => {
    if (resource.state.kind !== 'ready') {
      return { saved: [] as readonly SavedPerson[], directory: [] as readonly ProfessionalOrganization[], openWork: [] }
    }
    const byName = new Map<string, { name: string; count: number; areas: Set<string>; latest: string | null }>()
    for (const work of resource.state.value.work) {
      const name = work.professionalLabel?.trim()
      if (!name || work.archived) continue
      const key = name.toLocaleLowerCase('en-US')
      const entry = byName.get(key) ?? { name, count: 0, areas: new Set<string>(), latest: null }
      entry.count += 1
      entry.areas.add(categoryLabel[work.category])
      if (work.occurredOn && (!entry.latest || work.occurredOn > entry.latest)) entry.latest = work.occurredOn
      byName.set(key, entry)
    }
    return {
      saved: [...byName.values()].sort((left, right) => right.count - left.count),
      directory: resource.state.value.directory.filter(organization => matchesProfessional(organization, query, trade)),
      openWork: resource.state.value.work.filter(work => !work.archived
        && (work.status === 'planned' || work.status === 'in_progress')),
    }
  }, [query, resource.state, trade])

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }

  const selected = resource.state.kind === 'ready'
    ? resource.state.value.directory.find(item => item.organizationRef === selectedRef) ?? null
    : null
  const matchingWork = selected ? view.openWork.filter(work => selected.trades.includes(work.category)) : []

  function openInvitation(projectRef: string, organizationRef: string) {
    router.push({
      pathname: '/home/[homeId]/work/[projectRef]',
      params: { homeId, projectRef, professional: organizationRef },
    })
  }

  return (
    <Page>
      <HomeHeader
        section="Pros"
        title="Find help. Keep the good ones."
        detail="Invite a company to one plan, share only what you choose, and keep the people who worked on this home close."
      />

      {invitationsEnabled ? (
        <>
          <Card accent>
            <View style={styles.findHead}>
              <View style={styles.findIcon}><Ionicons name="search" size={23} color={colors.ink} /></View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Find a home pro</Text>
                <Text style={styles.copy}>Search company-provided profiles, then choose the exact plan they may review.</Text>
              </View>
            </View>
            <TextField
              label="Search"
              value={query}
              onChangeText={setQuery}
              placeholder="Company, service, or area"
              autoCorrect={false}
              returnKeyType="search"
            />
            <View style={styles.chips}>
              <Chip label="All" selected={trade === 'all'} onPress={() => setTrade('all')} />
              {PROFESSIONAL_TRADES.map(([value, label]) => (
                <Chip key={value} label={label} selected={trade === value} onPress={() => setTrade(value)} />
              ))}
            </View>
          </Card>

          <View style={styles.directoryHead}>
            <SectionTitle
              title="Companies"
              detail={`${view.directory.length} ${view.directory.length === 1 ? 'profile' : 'profiles'} match this view.`}
            />
            <Button label="I’m a pro" icon="briefcase-outline" quiet onPress={() => router.push('/pro')} />
          </View>
          {resource.state.kind === 'loading' ? <Loading label="Finding home pros…" /> : null}
          {resource.state.kind === 'error' ? <Notice message="The professional directory could not load." actionLabel="Try again" onAction={resource.reload} /> : null}
          {view.directory.map(organization => {
            const active = selectedRef === organization.organizationRef
            return (
              <View key={organization.organizationRef} style={styles.profileGroup}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: active }}
                  onPress={() => setSelectedRef(active ? null : organization.organizationRef)}
                  style={({ pressed }) => [styles.profile, active && styles.profileSelected, pressed && styles.pressed]}
                >
                  <View style={styles.profileTop}>
                    <View style={styles.avatar}><Text style={styles.initial}>{organization.displayName.slice(0, 1).toUpperCase()}</Text></View>
                    <View style={styles.flex}>
                      <Text style={styles.profileName}>{organization.displayName}</Text>
                      <Text style={styles.profileMeta}>{organization.serviceAreas.slice(0, 3).join(' · ') || 'Service area provided on request'}</Text>
                    </View>
                    <Ionicons name={active ? 'chevron-up' : 'chevron-down'} size={19} color={colors.slate} />
                  </View>
                  <View style={styles.tags}>{organization.trades.slice(0, 4).map(value => <Tag key={value} tone="aqua">{tradeLabel(value)}</Tag>)}</View>
                  {organization.description ? <Text style={styles.copy}>{organization.description}</Text> : null}
                  <Text style={styles.selfReported}>Company-provided profile · Homesrolo has not independently verified these facts.</Text>
                </Pressable>

                {active ? (
                  <Card accent>
                    <SectionTitle title={`Invite ${organization.displayName}`} detail="Choose one plan. The company will not see the rest of your home." />
                    {matchingWork.map(work => (
                      <Button
                        key={work.projectRef}
                        label={work.title}
                        icon="arrow-forward"
                        onPress={() => openInvitation(work.projectRef, organization.organizationRef)}
                      />
                    ))}
                    {matchingWork.length === 0 ? (
                      <>
                        <Text style={styles.copy}>There is no open matching plan to share yet.</Text>
                        <Button
                          label="Start the plan first"
                          icon="add"
                          onPress={() => router.push({ pathname: '/home/[homeId]/work', params: { homeId } })}
                        />
                      </>
                    ) : null}
                    <Button label="Close" quiet onPress={() => setSelectedRef(null)} />
                  </Card>
                ) : null}
              </View>
            )
          })}
          {resource.state.kind === 'ready' && view.directory.length === 0 ? (
            <Notice message="No company profiles match that search yet. Your plan stays saved while the directory grows." />
          ) : null}
        </>
      ) : <Notice message="Private professional invitations are not enabled for this account." />}

      <SectionTitle title="People this home knows" detail="Built from the names saved on completed work—not purchased rankings or anonymous leads." />
      {view.saved.map(person => (
        <Card key={person.name.toLocaleLowerCase()}>
          <View style={styles.profileTop}>
            <View style={[styles.avatar, styles.savedAvatar]}><Ionicons name="checkmark" size={22} color={colors.mint} /></View>
            <View style={styles.flex}>
              <Text style={styles.profileName}>{person.name}</Text>
              <Text style={styles.profileMeta}>{person.count} saved {person.count === 1 ? 'record' : 'records'}{person.latest ? ` · latest ${person.latest}` : ''}</Text>
            </View>
          </View>
          <View style={styles.tags}>{[...person.areas].map(area => <Tag key={area} tone="mint">{area}</Tag>)}</View>
        </Card>
      ))}
      {resource.state.kind === 'ready' && view.saved.length === 0 ? (
        <Notice message="No past pros are saved yet. Add a company to real work and this home’s Rolodex builds itself." />
      ) : null}
      <Text style={styles.disclosure}>You choose every invitation. A listing is not an endorsement, and no company receives your address or Home Record by browsing this directory.</Text>
    </Page>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  findHead: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  findIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.cream, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  copy: { color: colors.slate, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  directoryHead: { gap: space.sm },
  profileGroup: { gap: space.sm },
  profile: { backgroundColor: colors.inkRaised, borderColor: colors.line, borderWidth: 1, borderRadius: radius.large, padding: space.md, gap: space.sm },
  profileSelected: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.inkSoft, alignItems: 'center', justifyContent: 'center' },
  savedAvatar: { borderWidth: 1, borderColor: colors.mint },
  initial: { color: colors.lime, fontSize: 20, fontWeight: '900' },
  profileName: { color: colors.cream, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  profileMeta: { color: colors.slate, fontSize: 12, lineHeight: 17 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  selfReported: { color: colors.smoke, fontSize: 11, lineHeight: 16 },
  disclosure: { color: colors.smoke, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: space.md },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
})
