import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import type {
  HouseholdInvitation,
  HouseholdInvitableRole,
  HouseholdMember,
  HouseholdRoster,
  ProfessionalOrganization,
  ProjectInvitation,
  WorkCategory,
} from '../../../src/api/model.ts'
import { friendlyError } from '../../../src/api/errors.ts'
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
type PeopleMode = 'household' | 'pros'

export default function PeopleScreen() {
  const homeId = useHomeId()
  const {
    professionalSlug: rawProfessionalSlug,
    trade: rawTrade,
    section: rawPeopleSection,
  } = useLocalSearchParams<{
    professionalSlug?: string | string[]
    trade?: string | string[]
    section?: string | string[]
  }>()
  const requestedProfessionalSlug = legacyProfessionalSlug(rawProfessionalSlug)
  const requestedTrade = legacyProfessionalTrade(rawTrade)
  const { state: auth, api, refreshSession } = useSession()
  const professionalFeaturesEnabled = auth.kind === 'signed_in'
    && auth.session.capabilities.invitations
    && auth.session.capabilities.projectQuotes
  const householdSharingEnabled = auth.kind === 'signed_in'
    && auth.session.capabilities.sharing
  const loader = useCallback(async () => {
    const [work, directory, householdResult] = await Promise.all([
      api.listWork(homeId),
      professionalFeaturesEnabled ? api.listProfessionals() : Promise.resolve([]),
      householdSharingEnabled
        ? api.getHousehold(homeId).then(
            household => ({ household, failed: false as const }),
            () => ({ household: null, failed: true as const }),
          )
        : Promise.resolve({ household: null, failed: false as const }),
    ])
    const invitationResults = professionalFeaturesEnabled
      ? await Promise.allSettled(work.map(item => api.listProjectInvitations(homeId, item.projectRef)))
      : []
    const invitations = invitationResults.flatMap(result => (
      result.status === 'fulfilled' ? result.value : []
    ))
    const invitationLoadFailures = invitationResults.filter(result => result.status === 'rejected').length
    return {
      work,
      directory,
      invitations,
      invitationLoadFailures,
      household: householdResult.household,
      householdLoadFailed: householdResult.failed,
    }
  }, [api, homeId, householdSharingEnabled, professionalFeaturesEnabled])
  const resource = useResource(loader, auth.kind === 'signed_in')
  const [query, setQuery] = useState('')
  const [trade, setTrade] = useState<WorkCategory | 'all'>(requestedTrade ?? 'all')
  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [contactError, setContactError] = useState<string | null>(null)
  const [knownShareNotice, setKnownShareNotice] = useState<string | null>(null)
  const [sharingKnownProfessional, setSharingKnownProfessional] = useState(false)
  const [section, setSection] = useState<ProsSection>('find')
  const [mode, setMode] = useState<PeopleMode>(
    rawPeopleSection === 'pros' || requestedProfessionalSlug || requestedTrade ? 'pros' : 'household',
  )
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<HouseholdInvitableRole>('member')
  const [householdBusy, setHouseholdBusy] = useState(false)
  const [sharingHouseholdInvitationRef, setSharingHouseholdInvitationRef] = useState<string | null>(null)
  const [householdError, setHouseholdError] = useState<string | null>(null)
  const [householdNotice, setHouseholdNotice] = useState<string | null>(null)
  const pendingHouseholdCommand = useRef<{ intent: string; commandRef: string } | null>(null)

  useEffect(() => {
    if (!requestedTrade) return
    setTrade(requestedTrade)
    setSection('find')
    setMode('pros')
  }, [requestedTrade])

  useEffect(() => {
    const requested = typeof rawPeopleSection === 'string' ? rawPeopleSection : null
    if (requested === 'household' || requested === 'pros') setMode(requested)
  }, [rawPeopleSection])

  useEffect(() => {
    if (!requestedProfessionalSlug || resource.state.kind !== 'ready') return
    const organization = resource.state.value.directory.find(item => item.slug === requestedProfessionalSlug)
    if (organization) {
      setSelectedRef(organization.organizationRef)
      setSection('find')
      setMode('pros')
    }
  }, [requestedProfessionalSlug, resource.state])

  const view = useMemo(() => {
    if (resource.state.kind !== 'ready') {
      return {
        saved: [] as readonly SavedPerson[],
        directory: [] as readonly ProfessionalOrganization[],
        invitations: [] as readonly ProjectInvitation[],
        openWork: [],
        household: null as HouseholdRoster | null,
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
      household: resource.state.value.household,
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
  const currentHouseholdMember = view.household?.members.find(member => member.isCurrentPrincipal) ?? null
  const canManageHousehold = currentHouseholdMember?.role === 'workspace_controller'

  function assignmentsFor(member: HouseholdMember) {
    return view.openWork.filter(work => work.assignedMembershipRef === member.membershipRef)
  }

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

  async function inviteHouseholdMember() {
    if (householdBusy || !canManageHousehold) return
    const cleanName = inviteName.trim()
    const cleanEmail = inviteEmail.trim().toLocaleLowerCase('en-US')
    const intent = JSON.stringify({ cleanName, cleanEmail, inviteRole })
    setHouseholdBusy(true)
    setHouseholdError(null)
    setHouseholdNotice(null)
    try {
      if (!pendingHouseholdCommand.current || pendingHouseholdCommand.current.intent !== intent) {
        pendingHouseholdCommand.current = { intent, commandRef: await api.newCommandRef() }
      }
      const invitation = await api.createHouseholdInvitation(homeId, {
        commandRef: pendingHouseholdCommand.current.commandRef,
        inviteeEmail: cleanEmail,
        inviteeDisplayLabel: cleanName,
        desiredRole: inviteRole,
        expiresInDays: 7,
      })
      pendingHouseholdCommand.current = null
      await openHouseholdInvitationShare(invitation)
      setInviteName('')
      setInviteEmail('')
      setInviteRole('member')
      setInviteOpen(false)
      resource.reload()
    } catch (caught) {
      setHouseholdError(friendlyError(caught))
    } finally {
      setHouseholdBusy(false)
    }
  }

  async function shareHouseholdInvitation(invitation: HouseholdInvitation) {
    if (sharingHouseholdInvitationRef || !canManageHousehold) return
    setSharingHouseholdInvitationRef(invitation.invitationRef)
    setHouseholdError(null)
    setHouseholdNotice(null)
    try {
      await openHouseholdInvitationShare(invitation)
    } finally {
      setSharingHouseholdInvitationRef(null)
    }
  }

  async function openHouseholdInvitationShare(invitation: HouseholdInvitation) {
    const link = householdInvitationLink(invitation)
    try {
      const result = await Share.share({
        title: 'Join my Home Rolo',
        message: `${invitation.inviteeDisplayLabel}, I invited you to share our home in Homesrolo. Sign in with the email this invitation was sent to, then open this link: ${link}`,
      }, { dialogTitle: 'Invite someone to this Home Rolo' })
      setHouseholdNotice(result.action === Share.dismissedAction
        ? `${invitation.inviteeDisplayLabel}’s invitation is still pending. Tap Share again whenever you’re ready.`
        : `Invitation shared with ${invitation.inviteeDisplayLabel}. It works only after the invited email signs in.`)
    } catch {
      setHouseholdNotice('This device could not open its share sheet. The invitation is still pending, so you can tap Share again to retry.')
    }
  }

  async function revokeHouseholdInvitation(invitation: HouseholdInvitation) {
    if (householdBusy || !canManageHousehold) return
    setHouseholdBusy(true)
    setHouseholdError(null)
    setHouseholdNotice(null)
    try {
      await api.revokeHouseholdInvitation(homeId, invitation.invitationRef, {
        commandRef: await api.newCommandRef(),
        expectedRevision: invitation.revision,
      })
      setHouseholdNotice(`${invitation.inviteeDisplayLabel}’s pending invitation was revoked.`)
      resource.reload()
    } catch (caught) {
      setHouseholdError(friendlyError(caught))
    } finally {
      setHouseholdBusy(false)
    }
  }

  async function changeHouseholdRole(
    member: HouseholdMember,
    desiredRole: HouseholdMember['role'],
  ) {
    if (householdBusy || !canManageHousehold) return
    setHouseholdBusy(true)
    setHouseholdError(null)
    setHouseholdNotice(null)
    try {
      await api.setHouseholdMemberRole(homeId, member.membershipRef, {
        commandRef: await api.newCommandRef(),
        expectedRevision: member.revision,
        desiredRole,
      })
      setHouseholdNotice(`${member.displayLabel} is now ${householdRoleLabel(desiredRole).toLocaleLowerCase('en-US')}.`)
      resource.reload()
    } catch (caught) {
      setHouseholdError(friendlyError(caught))
    } finally {
      setHouseholdBusy(false)
    }
  }

  async function removeHouseholdMember(member: HouseholdMember) {
    if (householdBusy || !canManageHousehold || member.isCurrentPrincipal) return
    setHouseholdBusy(true)
    setHouseholdError(null)
    setHouseholdNotice(null)
    try {
      await api.removeHouseholdMember(homeId, member.membershipRef, {
        commandRef: await api.newCommandRef(),
        expectedRevision: member.revision,
      })
      setHouseholdNotice(`${member.displayLabel} no longer has access to this Home Rolo.`)
      resource.reload()
    } catch (caught) {
      setHouseholdError(friendlyError(caught))
    } finally {
      setHouseholdBusy(false)
    }
  }

  return (
    <Page>
      <HomeHeader
        section="People"
        title={mode === 'household' ? 'The people who share this home' : 'Your home-service Rolodex'}
        detail={mode === 'household'
          ? 'One Home Rolo, separate sign-ins, and a shared view of the work that keeps life moving.'
          : 'Find a company, follow private invitations, and keep the people this home already knows.'}
      />

      <View style={styles.modeTabs} accessibilityRole="tablist">
        <PeopleModeTab label="Household" icon="people-outline" selected={mode === 'household'} onPress={() => setMode('household')} />
        <PeopleModeTab label="Home pros" icon="construct-outline" selected={mode === 'pros'} onPress={() => setMode('pros')} />
      </View>

      {mode === 'pros' ? (
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
      ) : null}

      {resource.state.kind === 'loading' ? <Loading label="Opening your Rolodex…" /> : null}
      {resource.state.kind === 'error' ? <Notice message="The people connected to this home could not load." actionLabel="Try again" onAction={resource.reload} /> : null}
      {resource.state.kind === 'ready' && mode === 'pros' && resource.state.value.invitationLoadFailures > 0 ? (
        <Notice
          message={`Homesrolo couldn’t check ${resource.state.value.invitationLoadFailures === 1 ? 'one work record' : `${resource.state.value.invitationLoadFailures} work records`} for invitations. Some company access may be missing from this view.`}
          actionLabel="Try again"
          onAction={resource.reload}
        />
      ) : null}

      {resource.state.kind === 'ready' && mode === 'household' ? (
        <HouseholdPanel
          roster={view.household}
          sharingEnabled={householdSharingEnabled}
          loadFailed={resource.state.value.householdLoadFailed}
          canManage={canManageHousehold}
          inviteOpen={inviteOpen}
          inviteName={inviteName}
          inviteEmail={inviteEmail}
          inviteRole={inviteRole}
          busy={householdBusy}
          sharingInvitationRef={sharingHouseholdInvitationRef}
          error={householdError}
          notice={householdNotice}
          assignmentCountFor={member => assignmentsFor(member).length}
          onOpenInvite={() => { setInviteOpen(true); setHouseholdError(null); setHouseholdNotice(null) }}
          onCloseInvite={() => setInviteOpen(false)}
          onInviteNameChange={setInviteName}
          onInviteEmailChange={setInviteEmail}
          onInviteRoleChange={setInviteRole}
          onInvite={() => void inviteHouseholdMember()}
          onShare={invitation => void shareHouseholdInvitation(invitation)}
          onSetRole={(member, role) => void changeHouseholdRole(member, role)}
          onRemove={member => void removeHouseholdMember(member)}
          onRevoke={invitation => void revokeHouseholdInvitation(invitation)}
          onRetry={resource.reload}
        />
      ) : null}

      {resource.state.kind === 'ready' && mode === 'pros' && section === 'find' && professionalFeaturesEnabled ? (
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
                    {canManageHousehold ? (
                      <>
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
                      </>
                    ) : (
                      <Notice message="A Home admin manages company invitations. You can still review this public profile and its contact details." />
                    )}
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

      {resource.state.kind === 'ready' && mode === 'pros' && section === 'find' && !professionalFeaturesEnabled ? (
        <Notice message="Homesrolo couldn’t open company discovery or private invitations right now." />
      ) : null}

      {resource.state.kind === 'ready' && mode === 'pros' && section === 'invited' ? (
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
                  accessibilityLabel={`Open ${invitation.disclosure.title} invitation for ${invitation.professionalDisplayLabel ?? organization?.displayName ?? 'invited company'}`}
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
                      <Text style={styles.profileName}>{invitation.professionalDisplayLabel ?? organization?.displayName ?? 'Invited company'}</Text>
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

      {resource.state.kind === 'ready' && mode === 'pros' && section === 'saved' ? (
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
      {mode === 'pros' ? (
        <Text style={styles.disclosure}>You choose every invitation. A listing is not an endorsement, and no company receives your address or Home Record by browsing this directory.</Text>
      ) : null}
    </Page>
  )
}

function HouseholdPanel({
  roster,
  sharingEnabled,
  loadFailed,
  canManage,
  inviteOpen,
  inviteName,
  inviteEmail,
  inviteRole,
  busy,
  sharingInvitationRef,
  error,
  notice,
  assignmentCountFor,
  onOpenInvite,
  onCloseInvite,
  onInviteNameChange,
  onInviteEmailChange,
  onInviteRoleChange,
  onInvite,
  onShare,
  onSetRole,
  onRemove,
  onRevoke,
  onRetry,
}: {
  readonly roster: HouseholdRoster | null
  readonly sharingEnabled: boolean
  readonly loadFailed: boolean
  readonly canManage: boolean
  readonly inviteOpen: boolean
  readonly inviteName: string
  readonly inviteEmail: string
  readonly inviteRole: HouseholdInvitableRole
  readonly busy: boolean
  readonly sharingInvitationRef: string | null
  readonly error: string | null
  readonly notice: string | null
  readonly assignmentCountFor: (member: HouseholdMember) => number
  readonly onOpenInvite: () => void
  readonly onCloseInvite: () => void
  readonly onInviteNameChange: (value: string) => void
  readonly onInviteEmailChange: (value: string) => void
  readonly onInviteRoleChange: (value: HouseholdInvitableRole) => void
  readonly onInvite: () => void
  readonly onShare: (invitation: HouseholdInvitation) => void
  readonly onSetRole: (member: HouseholdMember, role: HouseholdMember['role']) => void
  readonly onRemove: (member: HouseholdMember) => void
  readonly onRevoke: (invitation: HouseholdInvitation) => void
  readonly onRetry: () => void
}) {
  if (!sharingEnabled) {
    return <Notice message="Household sharing is unavailable right now. Nothing about your home has been shared." />
  }
  if (loadFailed || !roster) {
    return <Notice message="Your household could not load. Existing access was not changed." actionLabel="Try again" onAction={onRetry} />
  }

  const members = roster.members.filter(member => member.state === 'active')
  const pendingInvitations = roster.invitations.filter(invitation => invitation.status === 'pending')
  const inviteReady = inviteName.trim().length > 0 && inviteEmail.trim().length > 0

  return (
    <>
      <Card accent>
        <View style={styles.householdHero}>
          <View style={styles.householdHeroIcon}>
            <Ionicons name="home" size={26} color={colors.ink} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>One home, kept together.</Text>
            <Text style={styles.copy}>Invite your spouse, partner, or another trusted adult. Everyone uses their own sign-in while sharing the same work, photos, and Home Rolo.</Text>
          </View>
        </View>
        {canManage && !inviteOpen ? (
          <Button label="Invite someone to this home" icon="person-add-outline" onPress={onOpenInvite} />
        ) : null}
        {!canManage ? (
          <Text style={styles.selfReported}>A Home admin manages household access. You can still see the people and shared work connected to this home.</Text>
        ) : null}
      </Card>

      {inviteOpen ? (
        <Card>
          <SectionTitle title="Invite to this Home Rolo" detail="Use the email they will use to sign in. The private link will not work for a different account." />
          <TextField
            label="Their name"
            value={inviteName}
            onChangeText={onInviteNameChange}
            placeholder="Alex"
            autoCapitalize="words"
            autoComplete="name"
          />
          <TextField
            label="Their email"
            value={inviteEmail}
            onChangeText={onInviteEmailChange}
            placeholder="alex@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />
          <View style={styles.chips}>
            <Chip label="Can add and update" selected={inviteRole === 'member'} disabled={busy} onPress={() => onInviteRoleChange('member')} />
            <Chip label="View only" selected={inviteRole === 'viewer'} disabled={busy} onPress={() => onInviteRoleChange('viewer')} />
          </View>
          <Text style={styles.selfReported}>“Can add and update” is the right choice for a spouse or partner. View only can open the shared record but cannot change it.</Text>
          <Button label={busy ? 'Creating invitation…' : 'Create and share invitation'} icon="share-outline" disabled={busy || !inviteReady} onPress={onInvite} />
          <Button label="Cancel" quiet disabled={busy} onPress={onCloseInvite} />
        </Card>
      ) : null}

      {notice ? <Notice message={notice} /> : null}
      {error ? <Notice message={error} /> : null}

      <SectionTitle
        title="Your household"
        detail={`${members.length} ${members.length === 1 ? 'person has' : 'people have'} access to this exact home.`}
      />
      {members.map(member => {
        const assignmentCount = assignmentCountFor(member)
        return (
          <Card key={member.membershipRef} style={styles.householdMemberCard}>
            <View style={styles.profileTop}>
              <View style={[styles.avatar, member.isCurrentPrincipal && styles.currentAvatar]}>
                <Text style={styles.initial}>{member.displayLabel.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.profileName}>{member.displayLabel}</Text>
                <Text style={styles.profileMeta}>
                  {householdRoleLabel(member.role)} · {assignmentCount === 0 ? 'No open assignments' : `${assignmentCount} open ${assignmentCount === 1 ? 'assignment' : 'assignments'}`}
                </Text>
              </View>
              {member.isCurrentPrincipal ? <Tag tone="lime">You</Tag> : null}
            </View>
            {canManage && !member.isCurrentPrincipal ? (
              <View style={styles.memberControls}>
                <Text style={styles.controlLabel}>Access</Text>
                <View style={styles.chips}>
                  <Chip label="Home admin" selected={member.role === 'workspace_controller'} disabled={busy} onPress={() => onSetRole(member, 'workspace_controller')} />
                  <Chip label="Can update" selected={member.role === 'member'} disabled={busy} onPress={() => onSetRole(member, 'member')} />
                  <Chip label="View only" selected={member.role === 'viewer'} disabled={busy} onPress={() => onSetRole(member, 'viewer')} />
                </View>
                <Button label="Remove access" icon="person-remove-outline" quiet disabled={busy} onPress={() => onRemove(member)} />
              </View>
            ) : null}
          </Card>
        )
      })}

      {pendingInvitations.length > 0 ? (
        <>
          <SectionTitle title="Waiting to join" detail="Pending links expire automatically after seven days." />
          {pendingInvitations.map(invitation => (
            <Card key={invitation.invitationRef}>
              <View style={styles.profileTop}>
                <View style={styles.pendingAvatar}><Ionicons name="mail-unread-outline" size={21} color={colors.aqua} /></View>
                <View style={styles.flex}>
                  <Text style={styles.profileName}>{invitation.inviteeDisplayLabel}</Text>
                  <Text style={styles.profileMeta}>{householdRoleLabel(invitation.desiredRole)} · expires {friendlyDate(invitation.expiresAt)}</Text>
                </View>
                <Tag tone="aqua">Invited</Tag>
              </View>
              {canManage ? (
                <View style={styles.memberControls}>
                  <Button
                    label={sharingInvitationRef === invitation.invitationRef ? 'Opening share sheet…' : 'Share invitation again'}
                    icon="share-outline"
                    disabled={busy || sharingInvitationRef !== null}
                    onPress={() => onShare(invitation)}
                  />
                  <Button
                    label="Revoke invitation"
                    quiet
                    disabled={busy || sharingInvitationRef !== null}
                    onPress={() => onRevoke(invitation)}
                  />
                </View>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}

      <View style={styles.householdPrivacy}>
        <Ionicons name="lock-closed-outline" size={17} color={colors.aqua} />
        <Text style={styles.householdPrivacyText}>Raw Rolo conversations stay private to the person chatting. Work, tasks, photos, and home details become shared only when someone saves them to this Home Rolo.</Text>
      </View>
    </>
  )
}

function PeopleModeTab({ label, icon, selected, onPress }: {
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
      style={({ pressed }) => [styles.modeTab, selected && styles.modeTabSelected, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={selected ? colors.ink : colors.slate} />
      <Text style={[styles.modeTabText, selected && styles.modeTabTextSelected]}>{label}</Text>
    </Pressable>
  )
}

function householdInvitationLink(invitation: HouseholdInvitation): string {
  return `https://app.homesrolo.com/join-household?invitation=${encodeURIComponent(invitation.invitationRef)}`
}

function householdRoleLabel(role: HouseholdMember['role'] | HouseholdInvitableRole): string {
  if (role === 'workspace_controller') return 'Home admin'
  if (role === 'member') return 'Can add and update'
  return 'View only'
}

function friendlyDate(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'soon'
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
  modeTabs: {
    flexDirection: 'row', gap: 7, padding: 5, borderRadius: radius.large,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkSoft,
  },
  modeTab: {
    flex: 1, minHeight: 50, borderRadius: radius.medium, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  modeTabSelected: { backgroundColor: colors.lime },
  modeTabText: { color: colors.slate, fontSize: 13, lineHeight: 17, fontWeight: '900' },
  modeTabTextSelected: { color: colors.ink },
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
  householdHero: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  householdHeroIcon: {
    width: 52, height: 52, borderRadius: 18, backgroundColor: colors.lime,
    alignItems: 'center', justifyContent: 'center',
  },
  householdMemberCard: { gap: space.md },
  currentAvatar: { borderWidth: 1, borderColor: colors.lime, backgroundColor: colors.limeSoft },
  pendingAvatar: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.aqua,
    backgroundColor: colors.inkSoft, alignItems: 'center', justifyContent: 'center',
  },
  memberControls: { paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.line, gap: space.sm },
  controlLabel: { color: colors.slate, fontSize: 11, lineHeight: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.1 },
  householdPrivacy: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: space.md,
    borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkSoft,
  },
  householdPrivacyText: { flex: 1, color: colors.slate, fontSize: 11, lineHeight: 17 },
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
