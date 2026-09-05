import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router } from 'expo-router'
import { NativeApiError } from '../api/client.ts'
import type { HomesroloApi } from '../api/contract.ts'
import type {
  ProfessionalMembership,
  ProfessionalOrganization,
  ProfessionalProposal,
  ProfessionalTrade,
  ProjectInvitation,
} from '../api/model.ts'
import { friendlyError } from '../api/errors.ts'
import { useResource } from '../hooks/useResource.ts'
import {
  cleanServiceAreas,
  formatMoney,
  invitationStatus,
  localToday,
  PROFESSIONAL_TRADES,
  PROPOSAL_FIELDS,
  proposalDecisionLabel,
  proposalScopeDraft,
  proposalScopePayload,
  tradeLabel,
  type ProposalScopeDraft,
} from '../professional/presentation.ts'
import { colors, kindLabel, radius, space, statusLabel } from '../theme.ts'
import { ArtifactFileCard } from './ArtifactFileCard.tsx'
import {
  Body,
  Brand,
  Button,
  Card,
  Chip,
  Divider,
  Eyebrow,
  Loading,
  Notice,
  Page,
  SectionTitle,
  Tag,
  TextField,
} from './ui.tsx'

type HubTab = 'today' | 'invitations' | 'workspaces' | 'company'
type CommandAttempt = { readonly intent: string; readonly commandRef: string }

function isConflict(error: unknown): boolean {
  return error instanceof NativeApiError && error.code === 'conflict'
}

function displayDate(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : value
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function displayCalendarDate(value: string): string {
  return validCalendarDate(value)
    ? new Date(`${value}T12:00:00`).toLocaleDateString()
    : value
}

function validHttpsUrlOrEmpty(value: string): boolean {
  if (!value.trim()) return true
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash
  } catch {
    return false
  }
}

function invitationTone(status: ProjectInvitation['status']): 'plain' | 'mint' | 'warning' {
  if (status === 'accepted') return 'mint'
  if (status === 'pending') return 'warning'
  return 'plain'
}

function proposalTone(
  decision: ProfessionalProposal['homeownerDecision'],
): 'plain' | 'aqua' | 'lime' | 'warning' {
  if (decision === 'selected') return 'lime'
  if (decision === 'shortlisted') return 'aqua'
  if (decision === 'declined') return 'warning'
  return 'plain'
}

function Header({ organization }: {
  readonly organization: ProfessionalOrganization | undefined
}) {
  return (
    <>
      <View style={styles.topRow}>
        <Brand compact />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open account"
          onPress={() => router.push('/account')}
          style={({ pressed }) => [styles.accountButton, pressed && styles.pressed]}
        >
          <Ionicons name="person-circle-outline" size={25} color={colors.cream} />
          <Text style={styles.accountButtonText}>Account</Text>
        </Pressable>
      </View>
      <View style={styles.workspaceIdentity}>
        <View style={styles.flexCopy}>
          <Eyebrow>Pro workspace</Eyebrow>
          <Text style={styles.workspaceName}>
            {organization?.displayName ?? 'Homesrolo Pro'}
          </Text>
        </View>
        {organization ? (
          <Tag tone={organization.publicationState === 'published' ? 'lime' : 'plain'}>
            {organization.publicationState === 'published'
              ? 'Listed'
              : organization.publicationState === 'suspended' ? 'Paused' : 'Draft'}
          </Tag>
        ) : null}
      </View>
    </>
  )
}

const HUB_TABS: readonly {
  readonly value: HubTab
  readonly label: string
  readonly icon: keyof typeof Ionicons.glyphMap
}[] = [
  { value: 'today', label: 'Today', icon: 'today-outline' },
  { value: 'invitations', label: 'Invites', icon: 'mail-outline' },
  { value: 'workspaces', label: 'Workspaces', icon: 'briefcase-outline' },
  { value: 'company', label: 'Company', icon: 'business-outline' },
]

function HubTabs({ selected, invitationCount, workspaceCount, onSelect }: {
  readonly selected: HubTab
  readonly invitationCount: number
  readonly workspaceCount: number
  readonly onSelect: (tab: HubTab) => void
}) {
  return (
    <View accessibilityRole="tablist" style={styles.tabs}>
      {HUB_TABS.map(item => {
        const active = selected === item.value
        const count = item.value === 'invitations'
          ? invitationCount
          : item.value === 'workspaces' ? workspaceCount : 0
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${item.label}${count > 0 ? `, ${count}` : ''}`}
            onPress={() => onSelect(item.value)}
            style={[styles.tab, active && styles.tabSelected]}
          >
            <View style={styles.tabIconWrap}>
              <Ionicons name={item.icon} size={19} color={active ? colors.ink : colors.slate} />
              {count > 0 ? (
                <View style={[styles.tabBadge, active && styles.tabBadgeSelected]}>
                  <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextSelected]}>
                    {count > 99 ? '99+' : count}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.tabText, active && styles.tabTextSelected]}>{item.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function WorkspaceHeading({ title, detail }: {
  readonly title: string
  readonly detail: string
}) {
  return (
    <View style={styles.screenHeading}>
      <Text accessibilityRole="header" style={styles.screenTitle}>{title}</Text>
      <Text style={styles.screenDetail}>{detail}</Text>
    </View>
  )
}

function CountTile({ icon, value, label, active, onPress }: {
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly value: number
  readonly label: string
  readonly active?: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.countTile,
        active && styles.countTileActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.countTileTop}>
        <Ionicons name={icon} size={20} color={active ? colors.lime : colors.aqua} />
        <Ionicons name="chevron-forward" size={17} color={colors.smoke} />
      </View>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </Pressable>
  )
}

function InvitationPreview({ invitation, action, onPress }: {
  readonly invitation: ProjectInvitation
  readonly action: string
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${action}: ${invitation.disclosure.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.previewRow, pressed && styles.pressed]}
    >
      <View style={[styles.previewIcon, invitation.status === 'pending' && styles.previewIconPending]}>
        <Ionicons
          name={invitation.status === 'pending' ? 'mail-unread-outline' : 'hammer-outline'}
          size={20}
          color={invitation.status === 'pending' ? colors.warning : colors.mint}
        />
      </View>
      <View style={styles.flexCopy}>
        <Text numberOfLines={1} style={styles.previewTitle}>{invitation.disclosure.title}</Text>
        <Text numberOfLines={1} style={styles.previewMeta}>
          {tradeLabel(invitation.disclosure.category)} · {action}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color={colors.smoke} />
    </Pressable>
  )
}

function ClosedInvitationRow({ invitation }: { readonly invitation: ProjectInvitation }) {
  return (
    <View style={styles.closedRow}>
      <View style={styles.flexCopy}>
        <Text numberOfLines={1} style={styles.closedTitle}>{invitation.disclosure.title}</Text>
        <Text style={styles.previewMeta}>
          {tradeLabel(invitation.disclosure.category)} · {displayDate(invitation.createdAt)}
        </Text>
      </View>
      <Tag tone={invitationTone(invitation.status)}>{invitation.status}</Tag>
    </View>
  )
}

function OrganizationSummary({ organization, reason }: {
  readonly organization: ProfessionalOrganization
  readonly reason: string
}) {
  return (
    <Card>
      <View style={styles.cardHeadingRow}>
        <View style={styles.flexCopy}>
          <Eyebrow>Company card</Eyebrow>
          <Text style={styles.cardTitle}>{organization.displayName}</Text>
        </View>
        <Tag tone={organization.publicationState === 'published' ? 'lime' : 'plain'}>
          {organization.publicationState}
        </Tag>
      </View>
      <Notice message={reason} />
      {organization.description ? <Body muted>{organization.description}</Body> : null}
      <View style={styles.chipWrap}>
        {organization.trades.map(trade => <Tag key={trade}>{tradeLabel(trade)}</Tag>)}
      </View>
      {organization.serviceAreas.length > 0 ? (
        <Text style={styles.meta}>{organization.serviceAreas.join(' · ')}</Text>
      ) : null}
    </Card>
  )
}

function OrganizationProfileForm({ api, organization, membership, onSaved }: {
  readonly api: HomesroloApi
  readonly organization: ProfessionalOrganization
  readonly membership: ProfessionalMembership | undefined
  readonly onSaved: (message: string) => void
}) {
  const [displayName, setDisplayName] = useState(organization.displayName)
  const [legalName, setLegalName] = useState(organization.legalName ?? '')
  const [description, setDescription] = useState(organization.description ?? '')
  const [phone, setPhone] = useState(organization.publicPhone ?? '')
  const [email, setEmail] = useState(organization.publicEmail ?? '')
  const [website, setWebsite] = useState(organization.websiteUrl ?? '')
  const [logo, setLogo] = useState(organization.logoUrl ?? '')
  const [trades, setTrades] = useState<readonly ProfessionalTrade[]>(organization.trades)
  const [serviceAreas, setServiceAreas] = useState(organization.serviceAreas.join('\n'))
  const [published, setPublished] = useState(organization.publicationState === 'published')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attempt = useRef<CommandAttempt | null>(null)
  const canManage = membership?.state === 'active'
    && (membership.role === 'owner' || membership.role === 'admin')

  if (organization.publicationState === 'suspended') {
    return (
      <OrganizationSummary
        organization={organization}
        reason="Homesrolo has paused this listing. Its facts remain visible here, but publication cannot be changed from this screen."
      />
    )
  }
  if (!canManage) {
    return (
      <OrganizationSummary
        organization={organization}
        reason="Your company membership can view this card but cannot change its public facts."
      />
    )
  }

  function changed() {
    attempt.current = null
    setError(null)
  }

  function update(setter: (value: string) => void, value: string) {
    changed()
    setter(value)
  }

  function toggleTrade(trade: ProfessionalTrade) {
    changed()
    setTrades(current => current.includes(trade)
      ? current.filter(value => value !== trade)
      : [...current, trade])
  }

  async function save() {
    const areas = cleanServiceAreas(serviceAreas)
    const cleanEmail = email.trim()
    const cleanPhone = phone.trim()
    if (!displayName.trim()) {
      setError('Enter the company name homeowners should see.')
      return
    }
    if (published && (trades.length === 0 || areas.length === 0)) {
      setError('Choose at least one service and one service area before listing the card.')
      return
    }
    if (areas.some(area => area.length > 80)) {
      setError('Keep each service area to 80 characters or fewer.')
      return
    }
    if (cleanPhone && cleanPhone.length < 7) {
      setError('Enter a complete public phone number or leave it blank.')
      return
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter a complete public email address or leave it blank.')
      return
    }
    if (!validHttpsUrlOrEmpty(website) || !validHttpsUrlOrEmpty(logo)) {
      setError('Website and logo links must be complete secure links beginning with https://.')
      return
    }

    const input = {
      organizationRef: organization.organizationRef,
      expectedRevision: organization.revision,
      displayName: displayName.trim(),
      legalName: legalName.trim() || null,
      description: description.trim() || null,
      publicPhone: cleanPhone || null,
      publicEmail: cleanEmail || null,
      websiteUrl: website.trim() || null,
      logoUrl: logo.trim() || null,
      trades,
      serviceAreas: areas,
      publicationState: published ? 'published' as const : 'draft' as const,
    }
    setBusy(true)
    setError(null)
    try {
      const intent = JSON.stringify(input)
      if (!attempt.current || attempt.current.intent !== intent) {
        attempt.current = { intent, commandRef: await api.newCommandRef() }
      }
      const saved = await api.saveProfessionalProfile({
        commandRef: attempt.current.commandRef,
        ...input,
      })
      attempt.current = null
      onSaved(saved.publicationState === 'published'
        ? 'Company card saved and listed for homeowners.'
        : 'Company card saved as a private draft.')
    } catch (caught) {
      if (isConflict(caught)) {
        onSaved('This company card changed in another session. Its current version was reloaded.')
      } else {
        setError(friendlyError(caught))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <View style={styles.cardHeadingRow}>
        <View style={styles.flexCopy}>
          <Eyebrow>Public company card</Eyebrow>
          <Text style={styles.cardTitle}>{organization.displayName}</Text>
          <Text style={styles.meta}>homesrolo.com/pros/{organization.slug}</Text>
        </View>
        <Tag tone={published ? 'lime' : 'plain'}>{published ? 'Listed' : 'Draft'}</Tag>
      </View>
      <Body muted>
        Tell homeowners who you are and where you work. Listing this company-supplied
        profile never grants access to a home or job.
      </Body>
      <Divider />
      <TextField
        label="Public company name"
        value={displayName}
        onChangeText={value => update(setDisplayName, value)}
        maxLength={120}
      />
      <TextField
        label="Legal name, optional"
        value={legalName}
        onChangeText={value => update(setLegalName, value)}
        maxLength={160}
      />
      <TextField
        label="What you do"
        value={description}
        onChangeText={value => update(setDescription, value)}
        placeholder="Explain the work you handle in plain language."
        multiline
        maxLength={1_200}
      />
      <Text style={styles.fieldLabel}>Services</Text>
      <View style={styles.chipWrap}>
        {PROFESSIONAL_TRADES.map(([value, label]) => (
          <Chip key={value} label={label} selected={trades.includes(value)} onPress={() => toggleTrade(value)} />
        ))}
      </View>
      <TextField
        label="Service areas"
        value={serviceAreas}
        onChangeText={value => update(setServiceAreas, value)}
        placeholder={'Fort Worth, Texas\nTulsa, Oklahoma'}
        hint="One city, county, metro, or region per line. Up to 40."
        multiline
      />
      <View style={styles.twoColumn}>
        <View style={styles.column}>
          <TextField
            label="Public phone"
            value={phone}
            onChangeText={value => update(setPhone, value)}
            keyboardType="phone-pad"
            maxLength={32}
          />
        </View>
        <View style={styles.column}>
          <TextField
            label="Public email"
            value={email}
            onChangeText={value => update(setEmail, value)}
            keyboardType="email-address"
            autoCapitalize="none"
            maxLength={254}
          />
        </View>
      </View>
      <TextField
        label="Website"
        value={website}
        onChangeText={value => update(setWebsite, value)}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://"
      />
      <TextField
        label="Logo link, optional"
        value={logo}
        onChangeText={value => update(setLogo, value)}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://"
        hint="Use a direct secure image link."
      />
      <Text style={styles.fieldLabel}>Visibility</Text>
      <View style={styles.chipWrap}>
        <Chip label="Private draft" selected={!published} onPress={() => { changed(); setPublished(false) }} />
        <Chip label="Listed for homeowners" selected={published} onPress={() => { changed(); setPublished(true) }} />
      </View>
      <Text style={styles.helper}>
        Homeowners still choose your company and send a separate invitation for each job.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={busy ? 'Saving…' : 'Save company card'}
        onPress={() => void save()}
        disabled={busy || !displayName.trim()}
      />
    </Card>
  )
}

function SharedArtifactPreview({ api, invitationRef, artifactRef, index }: {
  readonly api: HomesroloApi
  readonly invitationRef: string
  readonly artifactRef: string
  readonly index: number
}) {
  return (
    <ArtifactFileCard
      title={`Shared file ${index + 1}`}
      detail="Homeowner-selected · protected"
      load={() => api.readProfessionalArtifactContent(invitationRef, artifactRef)}
    />
  )
}

function ProposalReadOnly({ proposal }: { readonly proposal: ProfessionalProposal }) {
  return (
    <Card accent>
      <View style={styles.cardHeadingRow}>
        <View style={styles.flexCopy}>
          <Eyebrow>Selected proposal</Eyebrow>
          <Text style={styles.proposalTotal}>{formatMoney(proposal.totalAmountCents)}</Text>
        </View>
        <Tag tone="lime">Selected</Tag>
      </View>
      <Text style={styles.meta}>Dated {displayCalendarDate(proposal.proposalDate)}</Text>
      {proposal.summary ? <Body>{proposal.summary}</Body> : null}
      <Divider />
      {PROPOSAL_FIELDS.map(([key, label]) => {
        const item = proposal.scope[key]
        return item?.detail ? (
          <View key={key} style={styles.readOnlyRow}>
            <Text style={styles.readOnlyLabel}>{label}</Text>
            <Text style={styles.readOnlyValue}>{item.detail}</Text>
          </View>
        ) : null
      })}
      <Notice message="The homeowner selected this proposal. This version is locked and read-only so its agreed facts do not change underneath the decision." />
    </Card>
  )
}

function ProposalEditor({ api, invitation, proposal, onChanged }: {
  readonly api: HomesroloApi
  readonly invitation: ProjectInvitation
  readonly proposal: ProfessionalProposal | null
  readonly onChanged: (message: string, reload: boolean) => void
}) {
  const [proposalDate, setProposalDate] = useState(proposal?.proposalDate ?? localToday())
  const [amount, setAmount] = useState(proposal?.totalAmountCents === undefined
    ? ''
    : (proposal.totalAmountCents / 100).toFixed(2))
  const [summary, setSummary] = useState(proposal?.summary ?? '')
  const [scope, setScope] = useState<ProposalScopeDraft>(() => proposalScopeDraft(proposal))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attempt = useRef<CommandAttempt | null>(null)

  function changed() {
    attempt.current = null
    setError(null)
  }

  function updateScope(key: (typeof PROPOSAL_FIELDS)[number][0], value: string) {
    changed()
    setScope(current => ({ ...current, [key]: value }))
  }

  async function save() {
    const projectScope = scope.project_scope?.trim()
    if (!projectScope) {
      setError('Describe the work included before sending the proposal.')
      return
    }
    if (!validCalendarDate(proposalDate)) {
      setError('Enter the proposal date as YYYY-MM-DD.')
      return
    }
    const amountText = amount.trim().replace(/[$,\s]/g, '')
    const amountNumber = amountText ? Number(amountText) : null
    if (amountNumber !== null && (!Number.isFinite(amountNumber)
      || amountNumber < 0 || amountNumber > 10_000_000)) {
      setError('Enter a total from $0 through $10,000,000, or leave it blank.')
      return
    }
    const input = {
      proposalDate,
      ...(amountNumber === null ? {} : { totalAmountCents: Math.round(amountNumber * 100) }),
      ...(summary.trim() ? { summary: summary.trim() } : {}),
      scope: proposalScopePayload(scope),
    }
    setBusy(true)
    setError(null)
    try {
      const intent = JSON.stringify({ ...input, expectedRevision: proposal?.revision ?? null })
      if (!attempt.current || attempt.current.intent !== intent) {
        attempt.current = { intent, commandRef: await api.newCommandRef() }
      }
      if (proposal) {
        await api.reviseProfessionalProposal(invitation.invitationRef, proposal.quoteRef, {
          commandRef: attempt.current.commandRef,
          ...input,
          expectedRevision: proposal.revision,
        })
      } else {
        await api.submitProfessionalProposal(invitation.invitationRef, {
          commandRef: attempt.current.commandRef,
          ...input,
        })
      }
      attempt.current = null
      onChanged(proposal
        ? 'Proposal revision saved. The homeowner can see the current written version.'
        : 'Proposal sent. The homeowner can review it with any others.', true)
    } catch (caught) {
      if (isConflict(caught)) {
        onChanged('This proposal changed or already exists. Its current version was reloaded.', true)
      } else {
        setError(friendlyError(caught))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <View style={styles.cardHeadingRow}>
        <View style={styles.flexCopy}>
          <Eyebrow>{proposal ? 'Proposal revision' : 'Write the proposal'}</Eyebrow>
          <Text style={styles.cardTitle}>Put the work in writing.</Text>
        </View>
        {proposal ? <Tag tone={proposalTone(proposal.homeownerDecision)}>{proposalDecisionLabel(proposal.homeownerDecision)}</Tag> : null}
      </View>
      <Body muted>
        Start with the scope. A price can help the homeowner compare, but a standalone number
        does not explain what is included.
      </Body>
      <TextField
        label="Work included *"
        value={scope.project_scope ?? ''}
        onChangeText={value => updateScope('project_scope', value)}
        placeholder="Describe the work this proposal covers."
        multiline
        maxLength={160}
      />
      <View style={styles.twoColumn}>
        <View style={styles.column}>
          <TextField
            label="Proposal date"
            value={proposalDate}
            onChangeText={value => { changed(); setProposalDate(value) }}
            placeholder="YYYY-MM-DD"
            maxLength={10}
          />
        </View>
        <View style={styles.column}>
          <TextField
            label="Total, optional"
            value={amount}
            onChangeText={value => { changed(); setAmount(value) }}
            keyboardType="decimal-pad"
            placeholder="12500.00"
            hint="Scope first; total second."
          />
        </View>
      </View>
      <TextField
        label="Short explanation, optional"
        value={summary}
        onChangeText={value => { changed(); setSummary(value) }}
        placeholder="Explain the approach or an important assumption."
        multiline
        maxLength={2_000}
      />
      <SectionTitle title="Proposal details" detail="Plain language is easier for a homeowner to compare." />
      {PROPOSAL_FIELDS.slice(1).map(([key, label]) => (
        <TextField
          key={key}
          label={label}
          value={scope[key] ?? ''}
          onChangeText={value => updateScope(key, value)}
          multiline
          maxLength={160}
        />
      ))}
      {proposal && proposal.homeownerDecision !== 'undecided' ? (
        <Notice message={`Homeowner decision: ${proposalDecisionLabel(proposal.homeownerDecision)}. A revision updates the proposal facts; it does not change that decision.`} />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={busy ? 'Saving…' : proposal ? 'Save revised proposal' : 'Submit proposal'}
        onPress={() => void save()}
        disabled={busy || !scope.project_scope?.trim()}
      />
    </Card>
  )
}

function ProfessionalInvitationCard({ api, invitation, organization, onInvitationChanged }: {
  readonly api: HomesroloApi
  readonly invitation: ProjectInvitation
  readonly organization: ProfessionalOrganization | undefined
  readonly onInvitationChanged: () => void
}) {
  const proposalLoader = useCallback(
    () => api.getProfessionalProposal(invitation.invitationRef),
    [api, invitation.invitationRef],
  )
  const currentProposal = useResource(proposalLoader, invitation.status === 'accepted')
  const [responding, setResponding] = useState<'accepted' | 'declined' | null>(null)
  const [responseError, setResponseError] = useState<string | null>(null)
  const [proposalNotice, setProposalNotice] = useState<string | null>(null)
  const responseAttempts = useRef(new Map<'accepted' | 'declined', string>())

  async function respond(response: 'accepted' | 'declined') {
    if (responding) return
    setResponding(response)
    setResponseError(null)
    try {
      let commandRef = responseAttempts.current.get(response)
      if (!commandRef) {
        commandRef = await api.newCommandRef()
        responseAttempts.current.set(response, commandRef)
      }
      await api.respondToProjectInvitation(invitation.invitationRef, {
        commandRef,
        expectedRevision: invitation.revision,
        response,
      })
      responseAttempts.current.delete(response)
      onInvitationChanged()
    } catch (caught) {
      if (isConflict(caught)) {
        setResponseError('This invitation changed. Its current status is reloading.')
        onInvitationChanged()
      } else {
        setResponseError('Homesrolo could not save your response. No project access changed.')
      }
    } finally {
      setResponding(null)
    }
  }

  const fileCount = invitation.disclosure.selectedArtifactRefs.length

  return (
    <Card style={styles.invitationCard}>
      <View style={styles.cardHeadingRow}>
        <View style={styles.flexCopy}>
          <Eyebrow>{`${tradeLabel(invitation.disclosure.category)} · ${invitation.status === 'accepted'
            ? 'Project workspace'
            : 'Homeowner invitation'}`}</Eyebrow>
          <Text style={styles.cardTitle}>{invitation.disclosure.title}</Text>
          <Text style={styles.meta}>
            {organization?.displayName ?? 'Your company'} · {invitationStatus(invitation)}
          </Text>
        </View>
        <Tag tone={invitationTone(invitation.status)}>{invitationStatus(invitation)}</Tag>
      </View>
      <Body>{invitation.disclosure.summary || 'The homeowner did not add a written summary.'}</Body>
      {invitation.message ? (
        <View style={styles.messageBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={19} color={colors.aqua} />
          <Text style={styles.messageText}>{invitation.message}</Text>
        </View>
      ) : null}
      <View style={styles.detailTags}>
        <Tag>{kindLabel[invitation.disclosure.workKind]}</Tag>
        <Tag>{statusLabel[invitation.disclosure.status]}</Tag>
        {fileCount > 0 ? <Tag tone="aqua">{fileCount} shared {fileCount === 1 ? 'file' : 'files'}</Tag> : null}
      </View>
      <View style={styles.factGrid}>
        <View style={styles.fact}>
          <Text style={styles.factLabel}>Invitation expires</Text>
          <Text style={styles.factValue}>{displayDate(invitation.expiresAt)}</Text>
        </View>
      </View>

      {invitation.status === 'accepted' && fileCount > 0 ? (
        <>
          <Divider />
          <SectionTitle
            title="Homeowner-selected files"
            detail="These protected previews are available only through this accepted invitation."
          />
          <View style={styles.fileGrid}>
            {invitation.disclosure.selectedArtifactRefs.map((artifactRef, index) => (
              <SharedArtifactPreview
                key={artifactRef}
                api={api}
                invitationRef={invitation.invitationRef}
                artifactRef={artifactRef}
                index={index}
              />
            ))}
          </View>
        </>
      ) : null}

      {invitation.status === 'pending' ? (
        <View style={styles.responseBlock}>
          <Body muted>
            Accept to review the shared project and submit a proposal. Accepting does
            not expand what the homeowner shared. The homeowner chooses a proposal separately.
          </Body>
          {responseError ? <Text style={styles.error}>{responseError}</Text> : null}
          <Button
            label={responding === 'accepted' ? 'Accepting…' : 'Accept invitation'}
            onPress={() => void respond('accepted')}
            disabled={responding !== null}
          />
          <Button
            label={responding === 'declined' ? 'Declining…' : 'Decline'}
            onPress={() => void respond('declined')}
            disabled={responding !== null}
            quiet
          />
        </View>
      ) : null}

      {invitation.status === 'accepted' ? (
        <View style={styles.proposalBlock}>
          <Divider />
          {proposalNotice ? <Notice message={proposalNotice} /> : null}
          {currentProposal.state.kind === 'loading' ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color={colors.lime} />
              <Text style={styles.meta}>Opening proposal…</Text>
            </View>
          ) : null}
          {currentProposal.state.kind === 'error' ? (
            <Notice
              message="Homesrolo could not load the proposal for this invitation."
              actionLabel="Try again"
              onAction={currentProposal.reload}
            />
          ) : null}
          {currentProposal.state.kind === 'ready' && currentProposal.state.value?.homeownerDecision === 'selected' ? (
            <ProposalReadOnly proposal={currentProposal.state.value} />
          ) : null}
          {currentProposal.state.kind === 'ready'
            && currentProposal.state.value?.homeownerDecision !== 'selected' ? (
              <ProposalEditor
                key={currentProposal.state.value
                  ? `${currentProposal.state.value.quoteRef}:${currentProposal.state.value.revision}:${currentProposal.state.value.decisionRevision}`
                  : 'new'}
                api={api}
                invitation={invitation}
                proposal={currentProposal.state.value}
                onChanged={(message, reload) => {
                  setProposalNotice(message)
                  if (reload) currentProposal.reload()
                }}
              />
            ) : null}
        </View>
      ) : null}
    </Card>
  )
}

export function NativeProfessionalHub({ api }: { readonly api: HomesroloApi }) {
  const workspaceLoader = useCallback(() => api.getProfessionalProfile(), [api])
  const invitationLoader = useCallback(() => api.listProfessionalInvitations(), [api])
  const workspace = useResource(workspaceLoader)
  const invitations = useResource(invitationLoader)
  const [tab, setTab] = useState<HubTab>('today')
  const [companyNotice, setCompanyNotice] = useState<string | null>(null)
  const organizations = workspace.state.kind === 'ready' ? workspace.state.value.organizations : []
  const memberships = workspace.state.kind === 'ready' ? workspace.state.value.memberships : []
  const primaryOrganization = organizations[0]
  const organizationByRef = useMemo(
    () => new Map(organizations.map(organization => [organization.organizationRef, organization])),
    [organizations],
  )
  const membershipByOrganization = useMemo(
    () => new Map(memberships.map(membership => [membership.organizationRef, membership])),
    [memberships],
  )
  const sortedInvitations = useMemo(() => {
    if (invitations.state.kind !== 'ready') return []
    const rank: Readonly<Record<ProjectInvitation['status'], number>> = {
      pending: 0, accepted: 1, declined: 2, revoked: 3, expired: 4,
    }
    return [...invitations.state.value].sort((a, b) => rank[a.status] - rank[b.status]
      || b.createdAt.localeCompare(a.createdAt))
  }, [invitations.state])
  const pendingInvitations = sortedInvitations.filter(invitation => invitation.status === 'pending')
  const acceptedInvitations = sortedInvitations.filter(invitation => invitation.status === 'accepted')
  const closedInvitations = sortedInvitations.filter(invitation =>
    invitation.status !== 'pending' && invitation.status !== 'accepted')

  function reloadWorkspace(message: string) {
    setCompanyNotice(message)
    workspace.reload()
  }

  if (workspace.state.kind === 'ready' && organizations.length === 0) {
    return <Redirect href={{ pathname: '/onboarding', params: { mode: 'pro' } }} />
  }

  return (
    <Page key={tab}>
      <Header organization={primaryOrganization} />

      {workspace.state.kind === 'loading' ? <Loading label="Opening your company…" /> : null}
      {workspace.state.kind === 'error' ? (
        <Notice
          message="Homesrolo could not load your company."
          actionLabel="Try again"
          onAction={workspace.reload}
        />
      ) : null}

      {workspace.state.kind === 'ready' && organizations.length > 0 ? (
        <>
          <HubTabs
            selected={tab}
            invitationCount={pendingInvitations.length}
            workspaceCount={acceptedInvitations.length}
            onSelect={setTab}
          />

          {tab === 'today' ? (
            <>
              <WorkspaceHeading
                title="Today"
                detail={pendingInvitations.length > 0
                  ? `${pendingInvitations.length} ${pendingInvitations.length === 1 ? 'invitation needs' : 'invitations need'} a response.`
                  : 'Your invitations, project workspaces, and company status at a glance.'}
              />
              <View style={styles.countGrid}>
                <CountTile
                  icon="mail-unread-outline"
                  value={pendingInvitations.length}
                  label={pendingInvitations.length === 1 ? 'invitation' : 'invitations'}
                  active={pendingInvitations.length > 0}
                  onPress={() => setTab('invitations')}
                />
                <CountTile
                  icon="briefcase-outline"
                  value={acceptedInvitations.length}
                  label={acceptedInvitations.length === 1 ? 'accepted invitation' : 'accepted invitations'}
                  onPress={() => setTab('workspaces')}
                />
              </View>

              {primaryOrganization?.publicationState === 'draft' ? (
                <Card accent style={styles.profilePrompt}>
                  <View style={styles.promptRow}>
                    <View style={styles.promptIcon}>
                      <Ionicons name="storefront-outline" size={21} color={colors.lime} />
                    </View>
                    <View style={styles.flexCopy}>
                      <Text style={styles.promptTitle}>Finish your company card</Text>
                      <Text style={styles.previewMeta}>Add services and service areas before listing it.</Text>
                    </View>
                  </View>
                  <Button label="Open company" onPress={() => setTab('company')} quiet />
                </Card>
              ) : null}

              {invitations.state.kind === 'loading' ? <Loading label="Checking today…" /> : null}
              {invitations.state.kind === 'error' ? (
                <Notice
                  message="Homesrolo could not load your invitations and project workspaces."
                  actionLabel="Try again"
                  onAction={invitations.reload}
                />
              ) : null}
              {invitations.state.kind === 'ready' && pendingInvitations.length > 0 ? (
                <>
                  <SectionTitle title="Needs a response" />
                  <Card style={styles.previewList}>
                    {pendingInvitations.slice(0, 3).map(invitation => (
                      <InvitationPreview
                        key={invitation.invitationRef}
                        invitation={invitation}
                        action="Review invitation"
                        onPress={() => setTab('invitations')}
                      />
                    ))}
                    {pendingInvitations.length > 3 ? (
                      <Button
                        label={`View all ${pendingInvitations.length} invitations`}
                        onPress={() => setTab('invitations')}
                        quiet
                      />
                    ) : null}
                  </Card>
                </>
              ) : null}
              {invitations.state.kind === 'ready' && acceptedInvitations.length > 0 ? (
                <>
                  <SectionTitle title="Accepted invitations" />
                  <Card style={styles.previewList}>
                    {acceptedInvitations.slice(0, 3).map(invitation => (
                      <InvitationPreview
                        key={invitation.invitationRef}
                        invitation={invitation}
                        action="Open workspace"
                        onPress={() => setTab('workspaces')}
                      />
                    ))}
                    {acceptedInvitations.length > 3 ? (
                      <Button
                        label={`View all ${acceptedInvitations.length} workspaces`}
                        onPress={() => setTab('workspaces')}
                        quiet
                      />
                    ) : null}
                  </Card>
                </>
              ) : null}
              {invitations.state.kind === 'ready'
                && pendingInvitations.length === 0
                && acceptedInvitations.length === 0 ? (
                  <Card style={styles.emptyCompact}>
                    <View style={styles.emptyIcon}>
                      <Ionicons name="checkmark-outline" size={28} color={colors.lime} />
                    </View>
                    <View style={styles.flexCopy}>
                      <Text style={styles.cardTitle}>You’re caught up.</Text>
                      <Body muted>New homeowner invitations will appear here.</Body>
                    </View>
                  </Card>
                ) : null}
            </>
          ) : null}

          {tab === 'invitations' ? (
            <>
              <WorkspaceHeading
                title="Invitations"
                detail="Review the project invitation, then accept or decline. Acceptance opens the shared files and proposal workspace."
              />
              {invitations.state.kind === 'loading' ? <Loading label="Checking invitations…" /> : null}
              {invitations.state.kind === 'error' ? (
                <Notice
                  message="Homesrolo could not load your project invitations."
                  actionLabel="Try again"
                  onAction={invitations.reload}
                />
              ) : null}
              {invitations.state.kind === 'ready' && pendingInvitations.length === 0 ? (
                <Card style={styles.emptyCompact}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="mail-open-outline" size={28} color={colors.lime} />
                  </View>
                  <View style={styles.flexCopy}>
                    <Text style={styles.cardTitle}>No invitations waiting.</Text>
                    <Body muted>New invitations sent to your company will show up here.</Body>
                  </View>
                </Card>
              ) : null}
              {invitations.state.kind === 'ready' ? pendingInvitations.map(invitation => (
                <ProfessionalInvitationCard
                  key={`${invitation.invitationRef}:${invitation.revision}`}
                  api={api}
                  invitation={invitation}
                  organization={organizationByRef.get(invitation.professionalOrganizationRef)}
                  onInvitationChanged={invitations.reload}
                />
              )) : null}
              {invitations.state.kind === 'ready' && closedInvitations.length > 0 ? (
                <>
                  <SectionTitle title="Past invitations" />
                  <Card style={styles.closedList}>
                    {closedInvitations.map(invitation => (
                      <ClosedInvitationRow key={invitation.invitationRef} invitation={invitation} />
                    ))}
                  </Card>
                </>
              ) : null}
            </>
          ) : null}

          {tab === 'workspaces' ? (
            <>
              <WorkspaceHeading
                title="Project workspaces"
                detail="Accepted invitations stay here with their shared files and written proposals. The homeowner selects a proposal separately."
              />
              {invitations.state.kind === 'loading' ? <Loading label="Opening project workspaces…" /> : null}
              {invitations.state.kind === 'error' ? (
                <Notice
                  message="Homesrolo could not load your project workspaces."
                  actionLabel="Try again"
                  onAction={invitations.reload}
                />
              ) : null}
              {invitations.state.kind === 'ready' && acceptedInvitations.length === 0 ? (
                <Card style={styles.emptyCompact}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="briefcase-outline" size={28} color={colors.lime} />
                  </View>
                  <View style={styles.flexCopy}>
                    <Text style={styles.cardTitle}>No accepted invitations yet.</Text>
                    <Body muted>Accept an invitation to review the shared project and prepare a proposal.</Body>
                  </View>
                </Card>
              ) : null}
              {invitations.state.kind === 'ready' ? acceptedInvitations.map(invitation => (
                <ProfessionalInvitationCard
                  key={`${invitation.invitationRef}:${invitation.revision}`}
                  api={api}
                  invitation={invitation}
                  organization={organizationByRef.get(invitation.professionalOrganizationRef)}
                  onInvitationChanged={invitations.reload}
                />
              )) : null}
            </>
          ) : null}

          {tab === 'company' ? (
            <>
              <WorkspaceHeading
                title="Company"
                detail="Manage the facts homeowners see when they choose who to invite."
              />
              {companyNotice ? <Notice message={companyNotice} /> : null}
              {organizations.map(organization => (
                <OrganizationProfileForm
                  key={`${organization.organizationRef}:${organization.revision}`}
                  api={api}
                  organization={organization}
                  membership={membershipByOrganization.get(organization.organizationRef)}
                  onSaved={reloadWorkspace}
                />
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </Page>
  )
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  accountButton: {
    minHeight: 42, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 7,
  },
  accountButtonText: { color: colors.cream, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  workspaceIdentity: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.xs,
  },
  workspaceName: {
    color: colors.cream, fontSize: 20, lineHeight: 24, fontWeight: '900', letterSpacing: -0.3,
  },
  tabs: {
    flexDirection: 'row', gap: 4, padding: 5, borderRadius: radius.large,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkRaised,
  },
  tab: {
    flex: 1, minHeight: 58, borderRadius: radius.medium,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  tabSelected: { backgroundColor: colors.lime },
  tabIconWrap: { position: 'relative' },
  tabText: { color: colors.slate, fontSize: 10, fontWeight: '800' },
  tabTextSelected: { color: colors.ink },
  tabBadge: {
    position: 'absolute', top: -8, right: -13, minWidth: 17, height: 17, borderRadius: 9,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime,
  },
  tabBadgeSelected: { backgroundColor: colors.ink },
  tabBadgeText: { color: colors.ink, fontSize: 9, fontWeight: '900' },
  tabBadgeTextSelected: { color: colors.lime },
  screenHeading: { gap: 5, paddingTop: space.xs },
  screenTitle: {
    color: colors.cream, fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -0.9,
  },
  screenDetail: { color: colors.slate, fontSize: 14, lineHeight: 20 },
  countGrid: { flexDirection: 'row', gap: space.sm },
  countTile: {
    flex: 1, minHeight: 130, padding: space.md, borderRadius: radius.large,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkRaised, gap: 4,
  },
  countTileActive: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  countTileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countValue: { color: colors.cream, fontSize: 34, lineHeight: 39, fontWeight: '900' },
  countLabel: { color: colors.slate, fontSize: 12, fontWeight: '800' },
  profilePrompt: { gap: space.sm },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  promptIcon: {
    width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.inkSoft,
  },
  promptTitle: { color: colors.cream, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  previewList: { paddingVertical: 2, gap: 0 },
  previewRow: {
    minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  previewIcon: {
    width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#153c32',
  },
  previewIconPending: { backgroundColor: '#41351b' },
  previewTitle: { color: colors.cream, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  previewMeta: { color: colors.slate, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  emptyCompact: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  closedList: { paddingVertical: 2, gap: 0 },
  closedRow: {
    minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  closedTitle: { color: colors.cream, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  cardTitle: { color: colors.cream, fontSize: 22, lineHeight: 27, fontWeight: '900', letterSpacing: -0.4 },
  cardHeadingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  flexCopy: { flex: 1, gap: 5 },
  meta: { color: colors.slate, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  helper: { color: colors.smoke, fontSize: 12, lineHeight: 18 },
  fieldLabel: { color: colors.slate, fontSize: 13, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  twoColumn: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 140, minWidth: 140 },
  invitationCard: { gap: space.md },
  messageBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderLeftWidth: 2,
    borderLeftColor: colors.aqua, backgroundColor: colors.inkSoft,
    borderRadius: radius.medium, padding: space.md,
  },
  messageText: { flex: 1, color: colors.cream, fontSize: 15, lineHeight: 21 },
  detailTags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fact: {
    minWidth: 120, flexGrow: 1, flexBasis: '30%', padding: space.sm,
    borderRadius: radius.medium, backgroundColor: colors.inkSoft, gap: 4,
  },
  factLabel: { color: colors.smoke, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  factValue: { color: colors.cream, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  fileGrid: { gap: space.sm },
  responseBlock: { gap: space.sm },
  proposalBlock: { gap: space.md },
  inlineLoading: { minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 10 },
  proposalTotal: { color: colors.lime, fontSize: 27, lineHeight: 31, fontWeight: '900' },
  readOnlyRow: { gap: 4 },
  readOnlyLabel: { color: colors.aqua, fontSize: 12, fontWeight: '800' },
  readOnlyValue: { color: colors.cream, fontSize: 15, lineHeight: 22 },
  emptyIcon: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: colors.lime,
  },
})
