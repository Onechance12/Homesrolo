import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type {
  ArtifactRecord,
  ProfessionalOrganization,
  ProjectInvitation,
  ProjectQuote,
  WorkRecord,
} from '../api/model.ts'
import { friendlyError } from '../api/errors.ts'
import { useSession } from '../auth/SessionProvider.tsx'
import { useResource } from '../hooks/useResource.ts'
import {
  formatMoney,
  invitationStatus,
  proposalDecisionLabel,
  PROPOSAL_FIELDS,
  tradeLabel,
} from '../professional/presentation.ts'
import {
  professionalInvitationNotice,
  professionalInvitationTextUrl,
} from '../professional/contact.ts'
import { colors, radius, space } from '../theme.ts'
import { Button, Card, Loading, Notice, SectionTitle, Tag, TextField } from './ui.tsx'

type PendingAttempt = { readonly intent: string; readonly commandRef: string }

export function ProjectProfessionalWorkspace({
  homeId,
  work,
  preselectedOrganizationRef,
}: {
  readonly homeId: string
  readonly work: WorkRecord
  readonly preselectedOrganizationRef?: string
}) {
  const { state: auth, api } = useSession()
  const enabled = auth.kind === 'signed_in'
    && auth.session.capabilities.invitations
    && auth.session.capabilities.projectQuotes
  const loader = useCallback(async () => {
    const [organizations, invitations, quotes, artifacts] = await Promise.all([
      api.listProfessionals({ trade: work.category }),
      api.listProjectInvitations(homeId, work.projectRef),
      api.listProjectQuotes(homeId, work.projectRef),
      api.listArtifacts(homeId),
    ])
    return {
      organizations,
      invitations,
      quotes,
      artifacts: artifacts.filter(artifact => artifact.projectRef === work.projectRef),
    }
  }, [api, homeId, work.category, work.projectRef])
  const resource = useResource(loader, enabled)
  const [composing, setComposing] = useState(Boolean(preselectedOrganizationRef))
  const [selectedOrganizationRef, setSelectedOrganizationRef] = useState(preselectedOrganizationRef ?? '')
  const [message, setMessage] = useState('')
  const [selectedArtifactRefs, setSelectedArtifactRefs] = useState<readonly string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [notificationTarget, setNotificationTarget] = useState<ProfessionalOrganization | null>(null)
  const [notificationBusy, setNotificationBusy] = useState(false)
  const inviteAttempt = useRef<PendingAttempt | null>(null)
  const revokeAttempts = useRef(new Map<string, string>())
  const decisionAttempts = useRef(new Map<string, string>())

  const activeOrganizations = useMemo(() => new Set(
    resource.state.kind === 'ready'
      ? resource.state.value.invitations
        .filter(invitation => invitation.status === 'pending' || invitation.status === 'accepted')
        .map(invitation => invitation.professionalOrganizationRef)
      : [],
  ), [resource.state])
  const readyValue = resource.state.kind === 'ready' ? resource.state.value : null
  const submittedQuotes = readyValue?.quotes.filter(
    quote => quote.source === 'professional_submission',
  ) ?? []

  useEffect(() => {
    if (!readyValue || !selectedOrganizationRef || !activeOrganizations.has(selectedOrganizationRef)) return
    const organization = readyValue.organizations.find(
      item => item.organizationRef === selectedOrganizationRef,
    )
    setSelectedOrganizationRef('')
    setSelectedArtifactRefs([])
    setMessage('')
    setComposing(false)
    setNotice(`${organization?.displayName ?? 'That company'} already has access to this work.`)
  }, [activeOrganizations, readyValue, selectedOrganizationRef])

  if (!enabled) return null

  function clearFeedback() {
    setError(null)
    setNotice(null)
  }

  function toggleArtifact(artifactRef: string) {
    inviteAttempt.current = null
    clearFeedback()
    setSelectedArtifactRefs(current => current.includes(artifactRef)
      ? current.filter(value => value !== artifactRef)
      : [...current, artifactRef])
  }

  async function sendInvitation() {
    if (resource.state.kind !== 'ready' || busy || !selectedOrganizationRef) return
    const organization = resource.state.value.organizations.find(item => item.organizationRef === selectedOrganizationRef)
    if (!organization || activeOrganizations.has(organization.organizationRef)) return
    const input = {
      professionalOrganizationRef: organization.organizationRef,
      message: message.trim(),
      selectedArtifactRefs,
      expiresInDays: 7,
    }
    const intent = JSON.stringify(input)
    setBusy('invite')
    clearFeedback()
    try {
      if (!inviteAttempt.current || inviteAttempt.current.intent !== intent) {
        inviteAttempt.current = { intent, commandRef: await api.newCommandRef() }
      }
      await api.inviteProfessional(homeId, work.projectRef, {
        commandRef: inviteAttempt.current.commandRef,
        professionalOrganizationRef: input.professionalOrganizationRef,
        ...(input.message ? { message: input.message } : {}),
        selectedArtifactRefs: input.selectedArtifactRefs,
        expiresInDays: input.expiresInDays,
      })
      inviteAttempt.current = null
      setSelectedOrganizationRef('')
      setSelectedArtifactRefs([])
      setMessage('')
      setComposing(false)
      setNotificationTarget(organization)
      setNotice(`Private invitation created for ${organization.displayName}. Only this work and the files you checked were shared.`)
      resource.reload()
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      setBusy(null)
    }
  }

  async function shareInvitationNotification() {
    if (notificationBusy) return
    setNotificationBusy(true)
    setError(null)
    try {
      const result = await Share.share(
        { title: 'Homesrolo invitation', message: professionalInvitationNotice() },
        { dialogTitle: 'Let the company know' },
      )
      if (result.action !== Share.dismissedAction) {
        setNotice('Invitation notice shared. No home, address, work details, or files were included.')
      }
    } catch {
      setNotice('This device could not open its share sheet. The private invitation is still saved in Homesrolo.')
    } finally {
      setNotificationBusy(false)
    }
  }

  async function textInvitationNotification(organization: ProfessionalOrganization) {
    if (notificationBusy || !organization.publicPhone) return
    const url = professionalInvitationTextUrl(organization.publicPhone)
    if (!url) {
      setNotice('That company-provided phone number cannot receive a text from this device. You can still share the secure sign-in notice another way.')
      return
    }
    setNotificationBusy(true)
    setError(null)
    try {
      await Linking.openURL(url)
      setNotice('The invitation notice is ready in Messages. Nothing is sent until you send it.')
    } catch {
      setNotice('This device could not open Messages. The private invitation is still saved in Homesrolo.')
    } finally {
      setNotificationBusy(false)
    }
  }

  async function revoke(invitation: ProjectInvitation) {
    if (busy) return
    setBusy(invitation.invitationRef)
    clearFeedback()
    try {
      let commandRef = revokeAttempts.current.get(invitation.invitationRef)
      if (!commandRef) {
        commandRef = await api.newCommandRef()
        revokeAttempts.current.set(invitation.invitationRef, commandRef)
      }
      await api.revokeProjectInvitation(homeId, work.projectRef, invitation.invitationRef, {
        commandRef,
        expectedRevision: invitation.revision,
      })
      revokeAttempts.current.delete(invitation.invitationRef)
      setNotice('Access removed. Your work and files are still here.')
      resource.reload()
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      setBusy(null)
    }
  }

  async function decide(quote: ProjectQuote, decision: 'shortlisted' | 'selected' | 'declined') {
    if (busy || quote.decisionRevision === null) return
    const key = `${quote.quoteRef}:${quote.decisionRevision}:${decision}`
    setBusy(key)
    clearFeedback()
    try {
      let commandRef = decisionAttempts.current.get(key)
      if (!commandRef) {
        commandRef = await api.newCommandRef()
        decisionAttempts.current.set(key, commandRef)
      }
      await api.decideProfessionalProposal(homeId, work.projectRef, quote.quoteRef, {
        commandRef,
        expectedDecisionRevision: quote.decisionRevision,
        decision,
      })
      decisionAttempts.current.delete(key)
      setNotice(decision === 'selected'
        ? `${quote.contractorLabel} selected for this work.`
        : 'Your proposal decision was saved privately.')
      resource.reload()
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      setBusy(null)
    }
  }

  return (
    <View style={styles.wrap}>
      <SectionTitle title="Invite through Homesrolo" detail="Choose a company and exactly which files it may review." />
      {resource.state.kind === 'loading' ? <Loading label="Opening private invitations…" /> : null}
      {resource.state.kind === 'error' ? (
        <Notice message="Invitations and proposals could not load." actionLabel="Try again" onAction={resource.reload} />
      ) : null}
      {notice ? <Notice message={notice} /> : null}
      {error ? <Notice message={error} actionLabel="Reload current details" onAction={resource.reload} /> : null}

      {notificationTarget ? (
        <Card accent>
          <SectionTitle
            title={`Let ${notificationTarget.displayName} know`}
            detail="The private invitation is ready. Send a separate notice without putting home or work details in the message."
          />
          {notificationTarget.publicPhone && professionalInvitationTextUrl(notificationTarget.publicPhone) ? (
            <Button
              label={notificationBusy ? 'Opening Messages…' : 'Text company'}
              icon="chatbubble-outline"
              disabled={notificationBusy}
              accessibilityHint="Opens a ready-to-send text containing only the secure Homesrolo Pro sign-in link."
              onPress={() => void textInvitationNotification(notificationTarget)}
            />
          ) : null}
          <Button
            label={notificationBusy ? 'Opening share sheet…' : 'Share notice another way'}
            icon="share-outline"
            quiet={Boolean(notificationTarget.publicPhone && professionalInvitationTextUrl(notificationTarget.publicPhone))}
            disabled={notificationBusy}
            accessibilityHint="Opens the device share sheet with a non-sensitive invitation notice."
            onPress={() => void shareInvitationNotification()}
          />
          <Button label="Done" quiet disabled={notificationBusy} onPress={() => setNotificationTarget(null)} />
        </Card>
      ) : null}

      {readyValue ? (
        <>
          {readyValue.invitations.map(invitation => {
            const organization = readyValue.organizations.find(
              item => item.organizationRef === invitation.professionalOrganizationRef,
            )

            return (
              <InvitationCard
                key={invitation.invitationRef}
                invitation={invitation}
                {...(organization ? { organization } : {})}
                busy={busy === invitation.invitationRef}
                notifying={notificationBusy}
                onShare={() => void shareInvitationNotification()}
                onRevoke={() => void revoke(invitation)}
              />
            )
          })}

          {!composing ? (
            <Button label="Invite a company" icon="person-add-outline" onPress={() => setComposing(true)} />
          ) : (
            <Card accent>
              <SectionTitle title={`Invite a ${tradeLabel(work.category)} pro`} detail="The invitation expires in seven days. You can remove access sooner." />
              {readyValue.organizations.length === 0 ? (
                <Notice message="No listed companies match this kind of work yet. Your details and photos stay here while the directory grows." />
              ) : (
                <View style={styles.choiceList}>
                  {readyValue.organizations.map(organization => {
                    const unavailable = activeOrganizations.has(organization.organizationRef)
                    const selected = selectedOrganizationRef === organization.organizationRef
                    return (
                      <Pressable
                        key={organization.organizationRef}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected, disabled: unavailable }}
                        disabled={unavailable}
                        onPress={() => {
                          inviteAttempt.current = null
                          clearFeedback()
                          setSelectedOrganizationRef(organization.organizationRef)
                        }}
                        style={[styles.choice, selected && styles.choiceSelected, unavailable && styles.choiceDisabled]}
                      >
                        <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                        <View style={styles.flex}>
                          <Text style={styles.choiceName}>{organization.displayName}</Text>
                          <Text style={styles.meta}>{unavailable ? 'Already invited' : organization.serviceAreas.slice(0, 3).join(' · ')}</Text>
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
              )}
              <TextField
                label="Message (optional)"
                value={message}
                onChangeText={value => { inviteAttempt.current = null; clearFeedback(); setMessage(value) }}
                multiline
                maxLength={1_000}
                placeholder="What would you like the company to review or schedule?"
              />
              <Text style={styles.label}>Files this company may see</Text>
              {readyValue.artifacts.length === 0 ? (
                <Text style={styles.meta}>No files are attached to this work. The company receives only the written summary.</Text>
              ) : readyValue.artifacts.map(artifact => (
                <ArtifactChoice
                  key={artifact.artifactRef}
                  artifact={artifact}
                  selected={selectedArtifactRefs.includes(artifact.artifactRef)}
                  onPress={() => toggleArtifact(artifact.artifactRef)}
                />
              ))}
              <Text style={styles.privacy}>The company receives your written work details and only the files you select. Homesrolo does not automatically add your home address, other work, library, insurance records, or household access.</Text>
              <Button
                label={busy === 'invite' ? 'Sending…' : 'Send private invitation'}
                disabled={busy !== null || !selectedOrganizationRef || activeOrganizations.has(selectedOrganizationRef)}
                onPress={() => void sendInvitation()}
              />
              <Button label="Cancel" quiet disabled={busy !== null} onPress={() => { setComposing(false); clearFeedback() }} />
            </Card>
          )}

          <SectionTitle title="Company proposals" detail="Compare the written scope first. A total without details is not the whole proposal." />
          {submittedQuotes.map(quote => (
            <ProposalCard key={quote.quoteRef} quote={quote} busy={busy} onDecision={decision => void decide(quote, decision)} />
          ))}
          {submittedQuotes.length === 0 ? (
            <Notice message="No proposals have been submitted for this work yet." />
          ) : null}
        </>
      ) : null}
    </View>
  )
}

function InvitationCard({ invitation, organization, busy, notifying, onShare, onRevoke }: {
  readonly invitation: ProjectInvitation
  readonly organization?: ProfessionalOrganization
  readonly busy: boolean
  readonly notifying: boolean
  readonly onShare: () => void
  readonly onRevoke: () => void
}) {
  const active = invitation.status === 'pending' || invitation.status === 'accepted'
  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.choiceName}>{organization?.displayName ?? 'Invited company'}</Text>
          <Text style={styles.meta}>{invitationStatus(invitation)} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</Text>
        </View>
        <Tag tone={invitation.status === 'accepted' ? 'mint' : 'plain'}>{invitation.status}</Tag>
      </View>
      <Text style={styles.meta}>{invitation.disclosure.selectedArtifactRefs.length} selected {invitation.disclosure.selectedArtifactRefs.length === 1 ? 'file' : 'files'} shared.</Text>
      {active ? (
        <>
          <Button
            label={notifying ? 'Opening share sheet…' : 'Notify company'}
            icon="share-outline"
            quiet
            disabled={busy || notifying}
            accessibilityHint="Shares only a secure Homesrolo Pro sign-in notice, not home or work details."
            onPress={onShare}
          />
          <Button label={busy ? 'Removing…' : 'Remove access'} quiet disabled={busy || notifying} onPress={onRevoke} />
        </>
      ) : null}
    </Card>
  )
}

function ArtifactChoice({ artifact, selected, onPress }: {
  readonly artifact: ArtifactRecord
  readonly selected: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.file, selected && styles.fileSelected]}>
      <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={23} color={selected ? colors.lime : colors.slate} />
      <View style={styles.flex}><Text style={styles.choiceName}>{artifact.displayName}</Text><Text style={styles.meta}>{artifact.kind}</Text></View>
    </Pressable>
  )
}

function ProposalCard({ quote, busy, onDecision }: {
  readonly quote: ProjectQuote
  readonly busy: string | null
  readonly onDecision: (decision: 'shortlisted' | 'selected' | 'declined') => void
}) {
  const professional = quote.source === 'professional_submission'
  return (
    <Card style={quote.homeownerDecision === 'selected' ? styles.selectedProposal : undefined}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.proposalCompany}>{quote.contractorLabel}</Text>
          <Text style={styles.proposalTotal}>{formatMoney(quote.totalAmountCents)}</Text>
        </View>
        <Tag tone={quote.homeownerDecision === 'selected' ? 'mint' : quote.homeownerDecision === 'shortlisted' ? 'lime' : 'plain'}>{proposalDecisionLabel(quote.homeownerDecision)}</Tag>
      </View>
      {quote.professionalSummary ? <Text style={styles.summary}>{quote.professionalSummary}</Text> : null}
      <View style={styles.scope}>
        {PROPOSAL_FIELDS.map(([key, label]) => {
          const item = quote.scope[key]
          if (!item?.detail) return null
          return <View key={key}><Text style={styles.label}>{label}</Text><Text style={styles.scopeDetail}>{item.detail}</Text></View>
        })}
      </View>
      {professional && quote.decisionRevision !== null && quote.proposalState === 'submitted' ? (
        <View style={styles.decisionRow}>
          <Button label="Consider" quiet disabled={busy !== null || quote.homeownerDecision === 'shortlisted'} onPress={() => onDecision('shortlisted')} />
          <Button label="Select" disabled={busy !== null || quote.homeownerDecision === 'selected'} onPress={() => onDecision('selected')} />
          <Button label="Pass" quiet disabled={busy !== null || quote.homeownerDecision === 'declined'} onPress={() => onDecision('declined')} />
        </View>
      ) : null}
      <Text style={styles.privacy}>{professional ? 'Submitted through Homesrolo by this company.' : 'Saved by the homeowner for private comparison.'}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  choiceList: { gap: 8 },
  choice: { minHeight: 62, borderWidth: 1, borderColor: colors.line, borderRadius: radius.medium, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.inkRaised },
  choiceSelected: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  choiceDisabled: { opacity: 0.48 },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 2, borderColor: colors.slate, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.lime },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.lime },
  choiceName: { color: colors.cream, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  meta: { color: colors.slate, fontSize: 12, lineHeight: 17 },
  label: { color: colors.slate, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  privacy: { color: colors.smoke, fontSize: 11, lineHeight: 16 },
  file: { minHeight: 58, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileSelected: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  selectedProposal: { borderColor: colors.mint },
  proposalCompany: { color: colors.cream, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  proposalTotal: { color: colors.lime, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  summary: { color: colors.cream, fontSize: 14, lineHeight: 21 },
  scope: { gap: space.sm },
  scopeDetail: { color: colors.cream, fontSize: 14, lineHeight: 20 },
  decisionRow: { gap: 8 },
})
