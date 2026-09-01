import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { NativeApiError } from '../api/client.ts'
import { friendlyError } from '../api/errors.ts'
import type {
  ArtifactContent,
  ArtifactRecord,
  ProjectActivityRecord,
  ProjectQuote,
  QuoteScope,
  QuoteScopeStatus,
  WorkRecord,
} from '../api/model.ts'
import { useSession } from '../auth/SessionProvider.tsx'
import { useResource } from '../hooks/useResource.ts'
import { openCalendarFile } from '../native/calendar-file.ts'
import {
  QUOTE_STATUS_LABEL,
  emptyScopeDraft,
  homeownerEnteredQuotes,
  isCalendarDate,
  projectPdfArtifacts,
  proposalRequestText,
  reviewedScopeCount,
  scopeDraftForQuote,
  scopeFromDraft,
  scopeOutsideRows,
  scopeRowsFor,
  type QuoteDraftStatus,
  type QuoteScopeDraft,
  type QuoteScopeRow,
} from '../proposals/homeowner.ts'
import {
  estimateVisitCalendar,
  estimateVisitMilestone,
  localVisitStart,
  visitCalendarFilename,
  type SavedEstimateVisit,
} from '../proposals/visit.ts'
import { colors, radius, space } from '../theme.ts'
import { ArtifactFileCard } from './ArtifactFileCard.tsx'
import { Button, Card, Chip, Notice, SectionTitle, Tag, TextField } from './ui.tsx'

type PendingAttempt = { readonly intent: string; readonly commandRef: string }

const STATUS_OPTIONS = Object.freeze([
  'unreviewed', 'included', 'excluded', 'allowance', 'not_stated',
] as const satisfies readonly QuoteDraftStatus[])

export function ProjectOutsideProposalWorkspace({
  homeId,
  work,
  canManageProposals,
  canScheduleVisits,
  onVisitSaved,
}: {
  readonly homeId: string
  readonly work: WorkRecord
  readonly canManageProposals: boolean
  readonly canScheduleVisits: boolean
  readonly onVisitSaved?: (entry: ProjectActivityRecord) => void
}) {
  const { state: auth, api } = useSession()
  const enabled = auth.kind === 'signed_in' && auth.session.capabilities.projectQuotes
  const loader = useCallback(async () => {
    const [quotes, artifacts] = await Promise.all([
      api.listProjectQuotes(homeId, work.projectRef),
      api.listArtifacts(homeId),
    ])
    return { quotes, artifacts }
  }, [api, homeId, work.projectRef])
  const resource = useResource(loader, enabled)
  const ready = resource.state.kind === 'ready' ? resource.state.value : null
  const requestDefault = useMemo(
    () => proposalRequestText(work, ready?.artifacts ?? []),
    [ready?.artifacts, work],
  )
  const [requestOverride, setRequestOverride] = useState<string | null>(null)
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  if (!enabled) return null

  const request = requestOverride ?? requestDefault
  const entered = ready ? homeownerEnteredQuotes(ready.quotes) : []
  const pdfs = ready ? projectPdfArtifacts(ready.artifacts, work.projectRef) : []

  async function shareRequest() {
    const text = request.trim()
    if (!text || sharing) return
    setSharing(true)
    setShareNotice(null)
    try {
      const result = await Share.share(
        { title: work.title, message: text },
        { dialogTitle: `Share ${work.title}` },
      )
      if (result.action !== Share.dismissedAction) {
        setShareNotice('Your phone shared only this message. No photo, file, address, or home access was attached.')
      }
    } catch {
      setShareNotice('Sharing is not available here. Press and hold the request text to copy it instead.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <SectionTitle
        title="Ask another company"
        detail="Share a clear request yourself, then save what they send back."
      />

      <Card accent>
        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>Your request</Text>
            <Text style={styles.meta}>Edit every word before you send it.</Text>
          </View>
          <Ionicons name="share-social-outline" size={23} color={colors.lime} />
        </View>
        <TextField
          label="Message to a company"
          value={request}
          onChangeText={value => { setRequestOverride(value); setShareNotice(null) }}
          multiline
          maxLength={4_000}
          accessibilityHint="Only this text is placed in the phone share sheet."
        />
        <Text style={styles.privacy}>
          Nothing from your private Home Record is attached. You decide who receives the message.
        </Text>
        <Button
          label={sharing ? 'Opening share sheet…' : 'Share request'}
          icon="share-outline"
          disabled={sharing || !request.trim()}
          accessibilityHint="Opens the phone or browser share sheet with the exact text above."
          onPress={() => void shareRequest()}
        />
        {requestOverride !== null ? (
          <Button
            label="Restore from work summary"
            quiet
            disabled={sharing}
            onPress={() => { setRequestOverride(null); setShareNotice(null) }}
          />
        ) : null}
        {shareNotice ? <Notice message={shareNotice} /> : null}
      </Card>

      {resource.state.kind === 'loading' ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Opening saved proposals"
          style={styles.compactLoading}
        >
          <ActivityIndicator color={colors.lime} />
          <Text style={styles.meta}>Opening saved proposals…</Text>
        </View>
      ) : null}
      {resource.state.kind === 'error' ? (
        <Notice
          message="Saved proposals could not load."
          actionLabel="Try again"
          onAction={resource.reload}
        />
      ) : null}
      {ready ? (
        <>
          <HomeownerProposalRecords
            api={api}
            homeId={homeId}
            work={work}
            quotes={entered}
            pdfs={pdfs}
            canManage={canManageProposals}
            onReload={resource.reload}
          />
          {canScheduleVisits ? (
            <EstimateVisit
              api={api}
              homeId={homeId}
              work={work}
              {...(onVisitSaved ? { onVisitSaved } : {})}
            />
          ) : null}
        </>
      ) : null}
    </View>
  )
}

function EstimateVisit({ api, homeId, work, onVisitSaved }: {
  readonly api: ReturnType<typeof useSession>['api']
  readonly homeId: string
  readonly work: WorkRecord
  readonly onVisitSaved?: (entry: ProjectActivityRecord) => void
}) {
  const [open, setOpen] = useState(false)
  const [company, setCompany] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [calendarBusy, setCalendarBusy] = useState(false)
  const [saved, setSaved] = useState<SavedEstimateVisit | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const pending = useRef<PendingAttempt | null>(null)
  const saveLock = useRef(false)

  function change(field: 'company' | 'date' | 'time', value: string) {
    pending.current = null
    setSaved(null)
    setError(null)
    setNotice(null)
    if (field === 'company') setCompany(value)
    if (field === 'date') setDate(value)
    if (field === 'time') setTime(value)
  }

  async function saveVisit() {
    const cleanCompany = company.trim()
    const startsAt = localVisitStart(date, time)
    if (saveLock.current || !cleanCompany || !startsAt) return
    const body = estimateVisitMilestone(cleanCompany, startsAt)
    const intent = JSON.stringify({ homeId, projectRef: work.projectRef, body })
    saveLock.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (!pending.current || pending.current.intent !== intent) {
        pending.current = { intent, commandRef: await api.newCommandRef() }
      }
      const commandRef = pending.current.commandRef
      const created = await api.addWorkMilestone(homeId, work.projectRef, body, commandRef)
      pending.current = null
      setSaved({ company: cleanCompany, date, time, startsAt, uid: commandRef })
      setNotice('Visit saved with this work. Your phone calendar has not changed yet.')
      onVisitSaved?.(created)
    } catch (caught) {
      if (caught instanceof NativeApiError && caught.code === 'conflict') pending.current = null
      setError(friendlyError(caught))
    } finally {
      saveLock.current = false
      setBusy(false)
    }
  }

  async function addToCalendar() {
    if (!saved || calendarBusy) return
    setCalendarBusy(true)
    setError(null)
    try {
      const contents = estimateVisitCalendar({
        projectTitle: work.title,
        company: saved.company,
        startsAt: saved.startsAt,
        uid: saved.uid,
        createdAt: new Date(),
      })
      await openCalendarFile(contents, visitCalendarFilename(work.title))
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      setCalendarBusy(false)
    }
  }

  const startsAt = localVisitStart(date, time)
  return (
    <View style={styles.wrap}>
      {!open ? (
        <Button
          label="Save an estimate visit"
          icon="calendar-outline"
          quiet
          onPress={() => setOpen(true)}
        />
      ) : (
        <Card>
          <SectionTitle
            title="Estimate or service visit"
            detail="Save the agreed time with this work. Add it to your phone calendar only if you want to."
          />
          <TextField
            label="Company or person"
            value={company}
            onChangeText={value => change('company', value)}
            maxLength={120}
            placeholder="Who is coming?"
          />
          <View style={styles.visitFields}>
            <View style={styles.flex}>
              <TextField
                label="Date"
                value={date}
                onChangeText={value => change('date', value)}
                maxLength={10}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View style={styles.flex}>
              <TextField
                label="Time"
                value={time}
                onChangeText={value => change('time', value)}
                maxLength={5}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
                placeholder="14:30"
                hint="24-hour time"
              />
            </View>
          </View>
          {(date || time) && !startsAt ? (
            <Text accessibilityRole="alert" style={styles.error}>
              Enter a real date as YYYY-MM-DD and time as HH:MM.
            </Text>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {notice ? <Notice message={notice} /> : null}
          <Button
            label={busy ? 'Saving visit…' : 'Save visit'}
            icon="checkmark"
            disabled={busy || !company.trim() || !startsAt}
            onPress={() => void saveVisit()}
          />
          {saved ? (
            <Button
              label={calendarBusy ? 'Preparing calendar…' : 'Add to phone calendar'}
              icon="calendar-number-outline"
              disabled={calendarBusy}
              accessibilityHint="Creates a local calendar file. Homesrolo does not receive calendar access."
              onPress={() => void addToCalendar()}
            />
          ) : null}
          <Button
            label="Close visit tools"
            quiet
            disabled={busy || calendarBusy}
            onPress={() => setOpen(false)}
          />
          <Text style={styles.privacy}>
            Homesrolo does not book the company or change your calendar automatically.
          </Text>
        </Card>
      )}
    </View>
  )
}

function HomeownerProposalRecords({ api, homeId, work, quotes, pdfs, canManage, onReload }: {
  readonly api: ReturnType<typeof useSession>['api']
  readonly homeId: string
  readonly work: WorkRecord
  readonly quotes: readonly ProjectQuote[]
  readonly pdfs: readonly ArtifactRecord[]
  readonly canManage: boolean
  readonly onReload: () => void
}) {
  const rows = scopeRowsFor(work.category)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectQuote | null>(null)
  const [contractorLabel, setContractorLabel] = useState('')
  const [proposalDate, setProposalDate] = useState('')
  const [artifactRef, setArtifactRef] = useState('')
  const [notes, setNotes] = useState('')
  const [scope, setScope] = useState<QuoteScopeDraft>(() => emptyScopeDraft(rows))
  const [preservedScope, setPreservedScope] = useState<QuoteScope>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const pending = useRef<PendingAttempt | null>(null)
  const saveLock = useRef(false)

  function changed() {
    pending.current = null
    setError(null)
    setNotice(null)
  }

  function resetForm(close = true) {
    pending.current = null
    setEditing(null)
    setContractorLabel('')
    setProposalDate('')
    setArtifactRef('')
    setNotes('')
    setScope(emptyScopeDraft(rows))
    setPreservedScope({})
    setError(null)
    if (close) setOpen(false)
  }

  function startNew() {
    if (!canManage) return
    resetForm(false)
    setNotice(null)
    setOpen(true)
  }

  function startEdit(quote: ProjectQuote) {
    if (!canManage || quote.source !== 'homeowner_entry') return
    pending.current = null
    setEditing(quote)
    setContractorLabel(quote.contractorLabel)
    setProposalDate(quote.proposalDate ?? '')
    setArtifactRef(quote.artifactRef ?? '')
    setNotes(quote.notes)
    setScope(scopeDraftForQuote(quote, rows))
    setPreservedScope(scopeOutsideRows(quote, rows))
    setError(null)
    setNotice(null)
    setOpen(true)
  }

  function updateScope(row: QuoteScopeRow, patch: Partial<{ status: QuoteDraftStatus; detail: string }>) {
    setScope(value => {
      const current = value[row.key] ?? { status: 'unreviewed' as const, detail: '' }
      return { ...value, [row.key]: { ...current, ...patch } }
    })
    changed()
  }

  async function save() {
    const cleanLabel = contractorLabel.trim()
    const cleanNotes = notes.trim()
    const scopePayload = scopeFromDraft(scope, rows, preservedScope)
    if (!canManage || saveLock.current || !cleanLabel || scopePayload === null
      || (proposalDate && !isCalendarDate(proposalDate))) return
    const fields = {
      contractorLabel: cleanLabel,
      ...(proposalDate ? { proposalDate } : {}),
      ...(artifactRef ? { artifactRef } : {}),
      scope: scopePayload,
      ...(cleanNotes ? { notes: cleanNotes } : {}),
    }
    const intent = JSON.stringify({
      quoteRef: editing?.quoteRef ?? null,
      revision: editing?.revision ?? null,
      ...fields,
    })
    saveLock.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (!pending.current || pending.current.intent !== intent) {
        pending.current = { intent, commandRef: await api.newCommandRef() }
      }
      if (editing) {
        await api.saveProjectQuote(homeId, work.projectRef, editing.quoteRef, {
          commandRef: pending.current.commandRef,
          expectedRevision: editing.revision,
          ...fields,
        })
      } else {
        await api.createProjectQuote(homeId, work.projectRef, {
          commandRef: pending.current.commandRef,
          ...fields,
        })
      }
      pending.current = null
      const message = editing ? 'Proposal corrections saved.' : 'Outside proposal saved with this work.'
      resetForm()
      setNotice(message)
      onReload()
    } catch (caught) {
      if (caught instanceof NativeApiError && caught.code === 'conflict') {
        pending.current = null
        resetForm()
        setError('This proposal changed somewhere else. The latest version is loading; reopen it before editing.')
        onReload()
      } else {
        setError(friendlyError(caught))
      }
    } finally {
      saveLock.current = false
      setBusy(false)
    }
  }

  const dateError = proposalDate.length > 0 && !isCalendarDate(proposalDate)
  const scopeError = scopeFromDraft(scope, rows, preservedScope) === null

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={styles.sectionHeading}>Proposals from anywhere</Text>
          <Text style={styles.meta}>Save a PDF you received by email, text, or in person. Company-submitted proposals stay in the private invitation comparison.</Text>
        </View>
        <Tag tone="aqua">{quotes.length}</Tag>
      </View>

      {quotes.map(quote => {
        const linkedPdf = pdfs.find(pdf => pdf.artifactRef === quote.artifactRef)
        return (
          <ManualProposalCard
            key={quote.quoteRef}
            quote={quote}
            {...(linkedPdf ? {
              linkedPdf,
              loadLinkedPdf: () => api.readArtifactContent(homeId, linkedPdf),
            } : {})}
            rows={rows}
            {...(canManage ? { onEdit: () => startEdit(quote) } : {})}
          />
        )
      })}
      {quotes.length === 0 ? (
        <Notice message="No outside proposals saved yet. Company proposals submitted through an invitation appear in the comparison above." />
      ) : null}

      {!canManage ? (
        <Notice message="A Home admin manages saved proposal records and contractor selections. You can review the proposals shared with this work." />
      ) : !open ? (
        <Button label="Save an outside proposal" icon="document-attach-outline" onPress={startNew} />
      ) : (
        <Card>
          <SectionTitle
            title={editing ? `Edit ${editing.contractorLabel}` : 'Save an outside proposal'}
            detail="Record what the proposal actually says. Leave a row as Not reviewed until you check it."
          />
          <TextField
            label="Company or proposal name"
            value={contractorLabel}
            onChangeText={value => { setContractorLabel(value); changed() }}
            maxLength={120}
            placeholder="Name printed on the proposal"
            hint="This is your private label. Homesrolo has not verified it."
          />
          <TextField
            label="Proposal date (optional)"
            value={proposalDate}
            onChangeText={value => { setProposalDate(value); changed() }}
            maxLength={10}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            placeholder="YYYY-MM-DD"
            {...(dateError ? { hint: 'Enter a real date as YYYY-MM-DD.' } : {})}
          />
          {pdfs.length > 0 ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Original proposal PDF (optional)</Text>
              <PdfChoice
                label="No PDF linked"
                selected={!artifactRef}
                onPress={() => { setArtifactRef(''); changed() }}
              />
              {pdfs.map(pdf => (
                <PdfChoice
                  key={pdf.artifactRef}
                  label={pdf.displayName}
                  selected={artifactRef === pdf.artifactRef}
                  onPress={() => { setArtifactRef(pdf.artifactRef); changed() }}
                />
              ))}
              <Text style={styles.hint}>Upload a PDF in this work record first, then link it here.</Text>
              <Button label="Refresh uploaded PDFs" quiet disabled={busy} onPress={onReload} />
            </View>
          ) : (
            <Notice
              message="Want to keep the original PDF? Upload it under Files in this work record, then check again here."
              actionLabel="Check for uploaded PDF"
              onAction={onReload}
            />
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Written scope</Text>
            <Text style={styles.hint}>Classify only what you checked in the original proposal.</Text>
            {rows.map(row => (
              <ScopeRowEditor
                key={row.key}
                row={row}
                value={scope[row.key] ?? { status: 'unreviewed', detail: '' }}
                onChange={patch => updateScope(row, patch)}
              />
            ))}
          </View>

          <TextField
            label="Your notes (optional)"
            value={notes}
            onChangeText={value => { setNotes(value); changed() }}
            multiline
            maxLength={500}
            placeholder="Questions to ask, differences to compare, or a reminder for yourself…"
          />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {scopeError ? <Text accessibilityRole="alert" style={styles.error}>One scope detail is longer than 160 characters.</Text> : null}
          <Button
            label={busy ? 'Saving…' : editing ? 'Save corrections' : 'Save proposal'}
            icon="checkmark"
            disabled={busy || !contractorLabel.trim() || dateError || scopeError}
            onPress={() => void save()}
          />
          <Button label="Cancel" quiet disabled={busy} onPress={() => resetForm()} />
        </Card>
      )}

      {notice ? <Notice message={notice} /> : null}
      {!open ? (
        <Text style={styles.privacy}>
          Homesrolo keeps the record. It does not estimate the work, rank a price, verify an outside company, or choose a contractor for you.
        </Text>
      ) : null}
    </View>
  )
}

function ManualProposalCard({ quote, linkedPdf, loadLinkedPdf, rows, onEdit }: {
  readonly quote: ProjectQuote
  readonly linkedPdf?: ArtifactRecord
  readonly loadLinkedPdf?: () => Promise<ArtifactContent>
  readonly rows: readonly QuoteScopeRow[]
  readonly onEdit?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const reviewed = reviewedScopeCount(quote.scope)
  return (
    <Card>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{quote.contractorLabel}</Text>
          <Text style={styles.meta}>
            {quote.proposalDate ? `Dated ${displayDate(quote.proposalDate)}` : 'Date not recorded'}
            {' · '}{reviewed} {reviewed === 1 ? 'scope row' : 'scope rows'} reviewed
          </Text>
        </View>
        <Tag tone="plain">Outside</Tag>
      </View>
      {linkedPdf && loadLinkedPdf ? (
        <ArtifactFileCard
          title={linkedPdf.displayName}
          detail="Original proposal PDF"
          load={loadLinkedPdf}
        />
      ) : null}
      {quote.notes ? <Text style={styles.notes}>{quote.notes}</Text> : null}
      {expanded ? (
        <View style={styles.savedScope}>
          {rows.map(row => {
            const item = quote.scope[row.key]
            if (!item) return null
            return (
              <View key={row.key} style={styles.savedScopeRow}>
                <View style={styles.titleRow}>
                  <Text style={styles.savedScopeLabel}>{row.label}</Text>
                  <Tag tone={item.status === 'included' ? 'mint' : item.status === 'allowance' ? 'warning' : 'plain'}>
                    {QUOTE_STATUS_LABEL[item.status]}
                  </Tag>
                </View>
                {item.detail ? <Text style={styles.scopeDetail}>{item.detail}</Text> : null}
              </View>
            )
          })}
        </View>
      ) : null}
      <View style={styles.actions}>
        {reviewed > 0 ? (
          <Button
            label={expanded ? 'Hide scope' : 'Review scope'}
            quiet
            onPress={() => setExpanded(value => !value)}
          />
        ) : null}
        {onEdit ? <Button label="Edit record" quiet icon="create-outline" onPress={onEdit} /> : null}
      </View>
    </Card>
  )
}

function PdfChoice({ label, selected, onPress }: {
  readonly label: string
  readonly selected: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pdfChoice,
        selected && styles.pdfChoiceSelected,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={22}
        color={selected ? colors.lime : colors.slate}
      />
      <Text style={[styles.pdfChoiceText, selected && styles.pdfChoiceTextSelected]}>{label}</Text>
    </Pressable>
  )
}

function ScopeRowEditor({ row, value, onChange }: {
  readonly row: QuoteScopeRow
  readonly value: { readonly status: QuoteDraftStatus; readonly detail: string }
  readonly onChange: (patch: Partial<{ status: QuoteDraftStatus; detail: string }>) => void
}) {
  const [expanded, setExpanded] = useState(value.status !== 'unreviewed')
  function choose(status: QuoteDraftStatus) {
    onChange({ status })
    if (status !== 'unreviewed') setExpanded(true)
  }
  return (
    <View style={styles.scopeRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${row.label}. ${QUOTE_STATUS_LABEL[value.status]}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(open => !open)}
        style={({ pressed }) => [styles.scopeHeading, pressed && styles.pressed]}
      >
        <View style={styles.flex}>
          <Text style={styles.scopeLabel}>{row.label}</Text>
          <Text style={styles.scopeStatus}>{QUOTE_STATUS_LABEL[value.status]}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.aqua} />
      </Pressable>
      {expanded ? (
        <View style={styles.scopeBody}>
          <View style={styles.chips}>
            {STATUS_OPTIONS.map(status => (
              <Chip
                key={status}
                label={QUOTE_STATUS_LABEL[status]}
                selected={value.status === status}
                accessibilityHint={`Marks ${row.label} as ${QUOTE_STATUS_LABEL[status]}.`}
                onPress={() => choose(status)}
              />
            ))}
          </View>
          {value.status !== 'unreviewed' ? (
            <TextField
              label={`${row.label} details (optional)`}
              value={value.detail}
              onChangeText={detail => onChange({ detail })}
              maxLength={160}
              placeholder="Exact product, limit, allowance, or wording"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function displayDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  titleRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm,
  },
  cardTitle: { color: colors.cream, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  sectionHeading: { color: colors.cream, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  meta: { color: colors.slate, fontSize: 13, lineHeight: 19 },
  privacy: { color: colors.slate, fontSize: 12, lineHeight: 18 },
  fieldGroup: { gap: 8 },
  fieldLabel: { color: colors.slate, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  hint: { color: colors.slate, fontSize: 12, lineHeight: 17 },
  pdfChoice: {
    minHeight: 52, borderWidth: 1, borderColor: colors.line, borderRadius: radius.medium,
    paddingHorizontal: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  pdfChoiceSelected: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  pdfChoiceText: { flex: 1, color: colors.slate, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  pdfChoiceTextSelected: { color: colors.cream },
  notes: { color: colors.cream, fontSize: 14, lineHeight: 20 },
  actions: { gap: 8 },
  savedScope: { gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm },
  savedScopeRow: { gap: 5, paddingVertical: 5 },
  savedScopeLabel: { flex: 1, color: colors.cream, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  scopeDetail: { color: colors.slate, fontSize: 13, lineHeight: 19 },
  scopeRow: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.medium, overflow: 'hidden' },
  scopeHeading: {
    minHeight: 54, paddingHorizontal: 13, paddingVertical: 9,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  scopeLabel: { color: colors.cream, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  scopeStatus: { color: colors.aqua, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  scopeBody: { gap: 10, padding: 12, paddingTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  visitFields: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pressed: { opacity: 0.68 },
  compactLoading: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, fontWeight: '800' },
})
