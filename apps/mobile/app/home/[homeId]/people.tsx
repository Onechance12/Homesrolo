import { useCallback, useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import type { ProfessionalOrganization, WorkCategory } from '../../../src/api/model.ts'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import {
  Button, Card, Chip, Loading, Notice, Page, SectionTitle, Tag, TextField,
} from '../../../src/components/ui.tsx'
import { useHomeId } from '../../../src/home/HomeRouteProvider.tsx'
import { legacyProfessionalSlug, legacyProfessionalTrade } from '../../../src/home/legacy-route.ts'
import { useResource } from '../../../src/hooks/useResource.ts'
import {
  PROFESSIONAL_TRADES, matchesProfessional, tradeLabel,
} from '../../../src/professional/presentation.ts'
import { publicEmailUrl, publicPhoneUrl } from '../../../src/professional/contact.ts'
import { categoryLabel, colors, radius, space } from '../../../src/theme.ts'

type SavedPerson = {
  readonly name: string
  readonly count: number
  readonly areas: ReadonlySet<string>
  readonly latest: string | null
}

export default function PeopleScreen() {
  const homeId = useHomeId()
  const { professionalSlug: rawProfessionalSlug, trade: rawTrade } = useLocalSearchParams<{
    professionalSlug?: string | string[]
    trade?: string | string[]
  }>()
  const requestedProfessionalSlug = legacyProfessionalSlug(rawProfessionalSlug)
  const requestedTrade = legacyProfessionalTrade(rawTrade)
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
  const [trade, setTrade] = useState<WorkCategory | 'all'>(requestedTrade ?? 'all')
  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [contactError, setContactError] = useState<string | null>(null)

  useEffect(() => { if (requestedTrade) setTrade(requestedTrade) }, [requestedTrade])

  useEffect(() => {
    if (!requestedProfessionalSlug || resource.state.kind !== 'ready') return
    const organization = resource.state.value.directory.find(item => item.slug === requestedProfessionalSlug)
    if (organization) setSelectedRef(organization.organizationRef)
  }, [requestedProfessionalSlug, resource.state])

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

  async function openContact(url: string) {
    setContactError(null)
    try {
      await Linking.openURL(url)
    } catch {
      setContactError('This device could not open that contact option. You can still copy the company-provided detail shown here.')
    }
  }

  return (
    <Page>
      <HomeHeader
        section="Pros"
        title="Find help. Keep the good ones."
        detail="Invite a company to specific work, share only what you choose, and keep the people who worked on this home close."
      />

      {invitationsEnabled ? (
        <>
          <Card accent>
            <View style={styles.findHead}>
              <View style={styles.findIcon}><Ionicons name="search" size={23} color={colors.ink} /></View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Find a home pro</Text>
                <Text style={styles.copy}>Search company-provided profiles, then choose exactly what they may review.</Text>
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
              detail={`${view.directory.length} ${view.directory.length === 1 ? 'company' : 'companies'} found.`}
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
                  accessibilityLabel={`${active ? 'Close' : 'Open'} ${organization.displayName} profile`}
                  accessibilityHint="Shows public contact details and invitation choices"
                  accessibilityState={{ expanded: active }}
                  onPress={() => { setSelectedRef(active ? null : organization.organizationRef); setContactError(null) }}
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
                    {organization.publicPhone || organization.publicEmail || organization.websiteUrl ? (
                      <View style={styles.contactList}>
                        <Text style={styles.contactHeading}>Contact details</Text>
                        {organization.publicPhone ? (
                          <ContactAction
                            icon="call-outline"
                            label={organization.publicPhone}
                            accessibilityLabel={`Call ${organization.displayName} at ${organization.publicPhone}`}
                            accessibilityHint="Opens this device’s phone app"
                            onPress={() => {
                              const url = publicPhoneUrl(organization.publicPhone!)
                              if (url) void openContact(url)
                              else setContactError('That company-provided phone number cannot be opened on this device.')
                            }}
                          />
                        ) : null}
                        {organization.publicEmail ? (
                          <ContactAction
                            icon="mail-outline"
                            label={organization.publicEmail}
                            accessibilityLabel={`Email ${organization.displayName} at ${organization.publicEmail}`}
                            accessibilityHint="Opens a new message in this device’s email app"
                            onPress={() => {
                              const url = publicEmailUrl(organization.publicEmail!)
                              if (url) void openContact(url)
                              else setContactError('That company-provided email cannot be opened on this device.')
                            }}
                          />
                        ) : null}
                        {organization.websiteUrl ? (
                          <ContactAction
                            icon="globe-outline"
                            label="Open company website"
                            accessibilityLabel={`Open ${organization.displayName} website`}
                            accessibilityHint="Opens the company-provided public website"
                            onPress={() => void openContact(organization.websiteUrl!)}
                          />
                        ) : null}
                        <Text style={styles.selfReported}>These public contact details were provided by the company.</Text>
                      </View>
                    ) : null}
                    {contactError ? <Notice message={contactError} /> : null}
                    <SectionTitle title={`Invite ${organization.displayName}`} detail="Choose one job. The company will not see the rest of your home." />
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
                        <Text style={styles.copy}>You don’t have open work that matches what this company does yet.</Text>
                        <Button
                          label="Add the work first"
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
            <Notice message="No companies match that search. Your work is still saved, so you can check again later." />
          ) : null}
        </>
      ) : <Notice message="Homesrolo couldn’t open private invitations right now." />}

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

function ContactAction({ icon, label, accessibilityLabel, accessibilityHint, onPress }: {
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly label: string
  readonly accessibilityLabel: string
  readonly accessibilityHint: string
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.contactAction, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={colors.lime} />
      <Text style={styles.contactText} numberOfLines={2}>{label}</Text>
      <Ionicons name="open-outline" size={16} color={colors.slate} />
    </Pressable>
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
  contactList: { gap: 7 },
  contactHeading: { color: colors.cream, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  contactAction: { minHeight: 50, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkSoft, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  contactText: { flex: 1, color: colors.cream, fontSize: 12, lineHeight: 17, fontWeight: '800' },
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
