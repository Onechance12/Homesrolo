import { useCallback, useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import type { ProfessionalOrganization, ProjectInvitation, WorkCategory } from '../../../src/api/model.ts'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import {
  Button, Card, Chip, Loading, Notice, Page, SectionTitle, Tag, TextField,
} from '../../../src/components/ui.tsx'
import { useHomeId } from '../../../src/home/HomeRouteProvider.tsx'
import { legacyProfessionalSlug, legacyProfessionalTrade } from '../../../src/home/legacy-route.ts'
import { useResource } from '../../../src/hooks/useResource.ts'
import {
  PROFESSIONAL_TRADES, invitationStatus, matchesProfessional, tradeLabel,
} from '../../../src/professional/presentation.ts'
import {
  professionalSignupRequest,
  publicEmailUrl,
  publicPhoneUrl,
} from '../../../src/professional/contact.ts'
import { categoryLabel, colors, radius, space } from '../../../src/theme.ts'

type SavedPerson = {
  readonly name: string
  readonly count: number
  readonly areas: ReadonlySet<string>
  readonly latest: string | null
}

type ProsSection = 'find' | 'invited' | 'saved'

export default function PeopleScreen() {
  const homeId = useHomeId()
  const { professionalSlug: rawProfessionalSlug, trade: rawTrade } = useLocalSearchParams<{
    professionalSlug?: string | string[]
    trade?: string | string[]
  }>()
  const requestedProfessionalSlug = legacyProfessionalSlug(rawProfessionalSlug)
  const requestedTrade = legacyProfessionalTrade(rawTrade)
  const { state: auth, api, refreshSession } = useSession()
  const professionalFeaturesEnabled = auth.kind === 'signed_in'
    && auth.session.capabilities.invitations
    && auth.session.capabilities.projectQuotes
  const loader = useCallback(async () => {
    const [work, directory] = await Promise.all([
      api.listWork(homeId),
      professionalFeaturesEnabled ? api.listProfessionals() : Promise.resolve([]),
    ])
    const invitationResults = professionalFeaturesEnabled
      ? await Promise.allSettled(work.map(item => api.listProjectInvitations(homeId, item.projectRef)))
      : []
    const invitations = invitationResults.flatMap(result => (
      result.status === 'fulfilled' ? result.value : []
    ))
    const invitationLoadFailures = invitationResults.filter(result => result.status === 'rejected').length
    return { work, directory, invitations, invitationLoadFailures }
  }, [api, homeId, professionalFeaturesEnabled])
  const resource = useResource(loader, auth.kind === 'signed_in')
  const [query, setQuery] = useState('')
  const [trade, setTrade] = useState<WorkCategory | 'all'>(requestedTrade ?? 'all')
  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [contactError, setContactError] = useState<string | null>(null)
  const [knownShareNotice, setKnownShareNotice] = useState<string | null>(null)
  const [sharingKnownProfessional, setSharingKnownProfessional] = useState(false)
  const [section, setSection] = useState<ProsSection>('find')

  useEffect(() => {
    if (!requestedTrade) return
    setTrade(requestedTrade)
    setSection('find')
  }, [requestedTrade])

  useEffect(() => {
    if (!requestedProfessionalSlug || resource.state.kind !== 'ready') return
    const organization = resource.state.value.directory.find(item => item.slug === requestedProfessionalSlug)
    if (organization) {
      setSelectedRef(organization.organizationRef)
      setSection('find')
    }
  }, [requestedProfessionalSlug, resource.state])

  const view = useMemo(() => {
    if (resource.state.kind !== 'ready') {
      return {
        saved: [] as readonly SavedPerson[],
        directory: [] as readonly ProfessionalOrganization[],
        invitations: [] as readonly ProjectInvitation[],
        openWork: [],
      }
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
      invitations: [...resource.state.value.invitations].sort((left, right) => {
        const active = (value: ProjectInvitation) => value.status === 'pending' || value.status === 'accepted' ? 1 : 0
        return active(right) - active(left) || right.createdAt.localeCompare(left.createdAt)
      }),
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
  const allOrganizations = resource.state.kind === 'ready' ? resource.state.value.directory : []
  const matchingWork = selected ? view.openWork.filter(work => selected.trades.includes(work.category)) : []

  function openInvitation(projectRef: string, organizationRef: string) {
    router.push({
      pathname: '/home/[homeId]/work/[projectRef]',
      params: { homeId, projectRef, professional: organizationRef, tab: 'bids' },
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

  async function shareProfessionalSignup() {
    if (sharingKnownProfessional) return
    setSharingKnownProfessional(true)
    setKnownShareNotice(null)
    try {
      const result = await Share.share(
        { title: 'Join my Homesrolo Rolodex', message: professionalSignupRequest() },
        { dialogTitle: 'Ask a company to join Homesrolo' },
      )
      if (result.action !== Share.dismissedAction) {
        setKnownShareNotice('Signup link shared. No home, work, address, photo, or project invitation was included.')
      }
    } catch {
      setKnownShareNotice('This device could not open its share sheet. Nothing from your home was shared.')
    } finally {
      setSharingKnownProfessional(false)
    }
  }

  return (
    <Page>
      <HomeHeader
        section="Pros"
        title="Your home-service Rolodex"
        detail="Find a company, follow private invitations, and keep the people this home already knows."
      />

      <View style={styles.sectionTabs} accessibilityRole="tablist">
        <ProsTab label="Find" icon="search-outline" selected={section === 'find'} onPress={() => setSection('find')} />
        <ProsTab
          label={view.invitations.length > 0 ? `Invited · ${view.invitations.length}` : 'Invited'}
          icon="paper-plane-outline"
          selected={section === 'invited'}
          onPress={() => setSection('invited')}
        />
        <ProsTab
          label={view.saved.length > 0 ? `Saved · ${view.saved.length}` : 'Saved'}
          icon="bookmark-outline"
          selected={section === 'saved'}
          onPress={() => setSection('saved')}
        />
      </View>

      {resource.state.kind === 'loading' ? <Loading label="Opening your Rolodex…" /> : null}
      {resource.state.kind === 'error' ? <Notice message="Your home-service Rolodex could not load." actionLabel="Try again" onAction={resource.reload} /> : null}
      {resource.state.kind === 'ready' && resource.state.value.invitationLoadFailures > 0 ? (
        <Notice
          message={`Homesrolo couldn’t check ${resource.state.value.invitationLoadFailures === 1 ? 'one work record' : `${resource.state.value.invitationLoadFailures} work records`} for invitations. Some company access may be missing from this view.`}
          actionLabel="Try again"
          onAction={resource.reload}
        />
      ) : null}

      {resource.state.kind === 'ready' && section === 'find' && professionalFeaturesEnabled ? (
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

          <Card>
            <View style={styles.findHead}>
              <View style={styles.knownIcon}><Ionicons name="person-add-outline" size={23} color={colors.lime} /></View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Invite someone I already know</Text>
                <Text style={styles.copy}>Send a company the Pro signup link. After its profile appears here, you can choose a specific job and exactly what it may see.</Text>
              </View>
            </View>
            <Button
              label={sharingKnownProfessional ? 'Opening share sheet…' : 'Ask them to join'}
              icon="share-outline"
              disabled={sharingKnownProfessional}
              accessibilityHint="Shares only the Homesrolo Pro signup message. It does not create a project invitation."
              onPress={() => void shareProfessionalSignup()}
            />
            <Text style={styles.selfReported}>This signup action does not share your home or create a project invitation.</Text>
            {knownShareNotice ? <Notice message={knownShareNotice} /> : null}
          </Card>

          <SectionTitle
            title="Companies"
            detail={`${view.directory.length} ${view.directory.length === 1 ? 'company' : 'companies'} found.`}
          />
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
      ) : null}

      {resource.state.kind === 'ready' && section === 'find' && !professionalFeaturesEnabled ? (
        <Notice message="Homesrolo couldn’t open company discovery or private invitations right now." />
      ) : null}

      {resource.state.kind === 'ready' && section === 'invited' ? (
        professionalFeaturesEnabled ? (
          <>
            <SectionTitle title="Invited to your work" detail="Only the work and files you chose are shared with each company." />
            {view.invitations.map(invitation => {
              const organization = allOrganizations.find(item => (
                item.organizationRef === invitation.professionalOrganizationRef
              ))
              return (
                <Pressable
                  key={invitation.invitationRef}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${invitation.disclosure.title} invitation for ${organization?.displayName ?? 'invited company'}`}
                  accessibilityHint="Opens the work room where you can review or change this invitation"
                  onPress={() => router.push({
                    pathname: '/home/[homeId]/work/[projectRef]',
                    params: { homeId, projectRef: invitation.projectRef, tab: 'bids' },
                  })}
                  style={({ pressed }) => [styles.invitation, pressed && styles.pressed]}
                >
                  <View style={styles.profileTop}>
                    <View style={styles.invitationIcon}><Ionicons name="paper-plane" size={20} color={colors.ink} /></View>
                    <View style={styles.flex}>
                      <Text style={styles.profileName}>{organization?.displayName ?? 'Invited company'}</Text>
                      <Text style={styles.profileMeta} numberOfLines={1}>{invitation.disclosure.title}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={19} color={colors.slate} />
                  </View>
                  <View style={styles.tags}>
                    <Tag tone={invitation.status === 'accepted' ? 'mint' : invitation.status === 'pending' ? 'lime' : 'plain'}>
                      {invitationStatus(invitation)}
                    </Tag>
                    <Tag tone="aqua">{tradeLabel(invitation.disclosure.category)}</Tag>
                  </View>
                  <Text style={styles.selfReported}>
                    {invitation.disclosure.selectedArtifactRefs.length} selected {invitation.disclosure.selectedArtifactRefs.length === 1 ? 'file' : 'files'} shared · Open the work room to review access.
                  </Text>
                </Pressable>
              )
            })}
            {view.invitations.length === 0 && resource.state.value.invitationLoadFailures === 0 ? (
              <Notice message="No companies have been invited yet. Find a company, then choose the exact work you want them to see." />
            ) : null}
          </>
        ) : <Notice message="Homesrolo couldn’t open private invitations right now." />
      ) : null}

      {resource.state.kind === 'ready' && section === 'saved' ? (
        <>
          <SectionTitle title="People this home knows" detail="Built from names saved on real work—not purchased rankings or anonymous leads." />
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
          {view.saved.length === 0 ? (
            <Notice message="No past pros are saved yet. Add a company to real work and this home’s Rolodex builds itself." />
          ) : null}
        </>
      ) : null}
      <Text style={styles.disclosure}>You choose every invitation. A listing is not an endorsement, and no company receives your address or Home Record by browsing this directory.</Text>
    </Page>
  )
}

function ProsTab({ label, icon, selected, onPress }: {
  readonly label: string
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly selected: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.sectionTab, selected && styles.sectionTabSelected, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={17} color={selected ? colors.ink : colors.slate} />
      <Text style={[styles.sectionTabText, selected && styles.sectionTabTextSelected]} numberOfLines={1}>{label}</Text>
    </Pressable>
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
  sectionTabs: {
    flexDirection: 'row', gap: 6, padding: 5, borderRadius: radius.medium,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkSoft,
  },
  sectionTab: {
    flex: 1, minWidth: 0, minHeight: 44, borderRadius: radius.small,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6,
  },
  sectionTabSelected: { backgroundColor: colors.lime },
  sectionTabText: { color: colors.slate, flexShrink: 1, fontSize: 11, lineHeight: 15, fontWeight: '900' },
  sectionTabTextSelected: { color: colors.ink },
  findHead: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  findIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  knownIcon: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.cream, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  copy: { color: colors.slate, fontSize: 13, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  profileGroup: { gap: space.sm },
  profile: { backgroundColor: colors.inkRaised, borderColor: colors.line, borderWidth: 1, borderRadius: radius.large, padding: space.md, gap: space.sm },
  profileSelected: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  invitation: { backgroundColor: colors.inkRaised, borderColor: colors.line, borderWidth: 1, borderRadius: radius.large, padding: space.md, gap: space.sm },
  invitationIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
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
