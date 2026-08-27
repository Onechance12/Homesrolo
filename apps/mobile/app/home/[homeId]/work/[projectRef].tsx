import { useCallback, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { NativeApiError } from '../../../../src/api/client.ts'
import type { HomesroloApi } from '../../../../src/api/contract.ts'
import { friendlyError } from '../../../../src/api/errors.ts'
import type { ProjectActivityRecord, WorkRecord } from '../../../../src/api/model.ts'
import { useSession } from '../../../../src/auth/SessionProvider.tsx'
import { workDetailReturnPath } from '../../../../src/auth/return-route.ts'
import { HomeHeader } from '../../../../src/components/HomeHeader.tsx'
import { ProjectFiles } from '../../../../src/components/ProjectFiles.tsx'
import { ProjectChoices } from '../../../../src/components/ProjectChoices.tsx'
import { ProjectOutsideProposalWorkspace } from '../../../../src/components/ProjectOutsideProposalWorkspace.tsx'
import { ProjectProfessionalWorkspace } from '../../../../src/components/ProjectProfessionalWorkspace.tsx'
import {
  Button,
  Card,
  Chip,
  Divider,
  Loading,
  Notice,
  Page,
  SectionTitle,
  Tag,
  TextField,
} from '../../../../src/components/ui.tsx'
import { useResource } from '../../../../src/hooks/useResource.ts'
import { useHomeId } from '../../../../src/home/HomeRouteProvider.tsx'
import { categoryLabel, colors, kindLabel, space, statusLabel } from '../../../../src/theme.ts'
import {
  WORK_CATEGORIES,
  WORK_KINDS,
  WORK_STATUSES,
  draftFromWork,
  fieldsFromDraft,
  findExactWork,
  workHasChanges,
  workNoteIntent,
  workUpdateIntent,
  validOptionalWorkDate,
  type WorkDraft,
} from '../../../../src/work/detail.ts'

type PendingCommand = {
  readonly intent: string
  readonly commandRef: string
}

export default function WorkDetailScreen() {
  const homeId = useHomeId()
  const { projectRef, professional } = useLocalSearchParams<{
    projectRef: string
    professional?: string
  }>()
  const { state: auth, api, refreshSession } = useSession()
  const loader = useCallback(async () => {
    const work = await api.listWork(homeId)
    const current = findExactWork(work, homeId, projectRef)
    if (!current) return { work: null, activity: [] as readonly ProjectActivityRecord[] }
    const activity = await api.listProjectActivity(homeId, projectRef)
    return { work: current, activity }
  }, [api, homeId, projectRef])
  const resource = useResource(loader, auth.kind === 'signed_in')

  if (auth.kind === 'signed_out') {
    const returnTo = workDetailReturnPath(homeId, projectRef)
    return (
      <Redirect href={returnTo
        ? { pathname: '/sign-in', params: { returnTo } }
        : '/sign-in'} />
    )
  }
  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }
  if (resource.state.kind === 'loading') return <Loading label="Opening this work record…" />
  if (resource.state.kind === 'error') {
    return (
      <Page>
        <ProjectBack onPress={() => goBack(homeId)} />
        <Notice message="This work record could not load." actionLabel="Try again" onAction={resource.reload} />
      </Page>
    )
  }
  if (!resource.state.value.work) {
    return (
      <Page>
        <ProjectBack onPress={() => goBack(homeId)} />
        <HomeHeader
          section="Work"
          title="That record is not here."
          detail="It may have been removed, or it may belong to a different home."
        />
        <Notice message="Open Work to choose a record from this home." actionLabel="Open Work" onAction={() => openWork(homeId)} />
      </Page>
    )
  }

  return (
    <WorkDetail
      key={`${resource.state.value.work.projectRef}:${resource.state.value.work.revision}:${resource.state.value.activity.at(-1)?.activityRef ?? 'none'}`}
      api={api}
      homeId={homeId}
      work={resource.state.value.work}
      initialActivity={resource.state.value.activity}
      {...(professional ? { preselectedOrganizationRef: professional } : {})}
      onReload={resource.reload}
    />
  )
}

function WorkDetail({ api, homeId, work, initialActivity, preselectedOrganizationRef, onReload }: {
  readonly api: HomesroloApi
  readonly homeId: string
  readonly work: WorkRecord
  readonly initialActivity: readonly ProjectActivityRecord[]
  readonly preselectedOrganizationRef?: string
  readonly onReload: () => void
}) {
  const [current, setCurrent] = useState(work)
  const [draft, setDraft] = useState<WorkDraft>(() => draftFromWork(work))
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [conflicted, setConflicted] = useState(false)
  const [note, setNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [noteSuccess, setNoteSuccess] = useState<string | null>(null)
  const [activity, setActivity] = useState<readonly ProjectActivityRecord[]>(initialActivity)
  const pendingSave = useRef<PendingCommand | null>(null)
  const pendingNote = useRef<PendingCommand | null>(null)
  const saveLock = useRef(false)
  const noteLock = useRef(false)
  const lastCompletedNote = useRef<string | null>(null)
  const changed = useMemo(() => workHasChanges(current, draft), [current, draft])

  function setDraftField<Key extends keyof WorkDraft>(key: Key, value: WorkDraft[Key]) {
    setDraft(previous => ({ ...previous, [key]: value }))
    setSaveError(null)
    setSaveSuccess(null)
  }

  function cancelEdit() {
    pendingSave.current = null
    setDraft(draftFromWork(current))
    setEditing(false)
    setSaveError(null)
    setConflicted(false)
  }

  async function save() {
    if (saveLock.current || conflicted || !draft.title.trim() || !changed) return
    if (!validOptionalWorkDate(draft.occurredOn)) {
      setSaveError('Use a real date as YYYY-MM-DD, or leave it blank.')
      return
    }
    saveLock.current = true
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(null)
    try {
      const fields = fieldsFromDraft(draft)
      const intent = workUpdateIntent(current.projectRef, current.revision, fields)
      if (!pendingSave.current || pendingSave.current.intent !== intent) {
        pendingSave.current = { intent, commandRef: await api.newCommandRef() }
      }
      const updated = await api.updateWork(homeId, current.projectRef, {
        commandRef: pendingSave.current.commandRef,
        expectedRevision: current.revision,
        ...fields,
      })
      if (updated.homeRef !== homeId || updated.projectRef !== current.projectRef) {
        throw new NativeApiError(200, 'invalid_response')
      }
      pendingSave.current = null
      setCurrent(updated)
      setDraft(draftFromWork(updated))
      setEditing(false)
      setSaveSuccess('Changes saved to this home.')
    } catch (caught) {
      if (caught instanceof NativeApiError && caught.code === 'conflict') {
        pendingSave.current = null
        setConflicted(true)
      } else {
        setSaveError(friendlyError(caught))
      }
    } finally {
      saveLock.current = false
      setSaving(false)
    }
  }

  function reloadAfterConflict() {
    pendingSave.current = null
    setSaveError(null)
    setSaveSuccess(null)
    onReload()
  }

  function changeNote(value: string) {
    lastCompletedNote.current = null
    setNote(value)
    setNoteError(null)
    setNoteSuccess(null)
  }

  async function addNote() {
    const body = note.trim()
    if (noteLock.current || !body) return
    const intent = workNoteIntent(current.projectRef, body)
    if (lastCompletedNote.current === intent) return
    noteLock.current = true
    setAddingNote(true)
    setNoteError(null)
    setNoteSuccess(null)
    try {
      if (!pendingNote.current || pendingNote.current.intent !== intent) {
        pendingNote.current = { intent, commandRef: await api.newCommandRef() }
      }
      const created = await api.addWorkNote(
        homeId,
        current.projectRef,
        body,
        pendingNote.current.commandRef,
      )
      pendingNote.current = null
      lastCompletedNote.current = intent
      setActivity(entries => [...entries.filter(entry => entry.activityRef !== created.activityRef), created]
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)))
      setNote('')
      setNoteSuccess('Note added to this work record.')
    } catch (caught) {
      setNoteError(friendlyError(caught))
    } finally {
      noteLock.current = false
      setAddingNote(false)
    }
  }

  return (
    <Page>
      <ProjectBack onPress={() => goBack(homeId)} />
      <HomeHeader
        section={kindLabel[current.workKind]}
        title={current.title}
        detail={`${categoryLabel[current.category]} · saved to this home`}
      />

      <Card accent>
        <View style={styles.headingRow}>
          <Tag tone={current.status === 'completed' ? 'mint' : current.status === 'in_progress' ? 'lime' : 'plain'}>
            {kindLabel[current.workKind]}
          </Tag>
          <Text style={styles.status}>{statusLabel[current.status]}</Text>
        </View>
        <Detail label="Date" value={displayDate(current.occurredOn)} />
        <Detail label="Person or company" value={current.professionalLabel ?? 'Not recorded'} />
        <View style={styles.summaryBlock}>
          <Text style={styles.detailLabel}>What the home remembers</Text>
          <Text style={[styles.summary, !current.summary && styles.emptyValue]}>
            {current.summary || 'No summary saved yet.'}
          </Text>
        </View>
        {!editing ? (
          <>
            <Button
              label="Ask Rolo about this work"
              icon="chatbubble-ellipses-outline"
              onPress={() => openProjectRolo(homeId, current.projectRef)}
            />
            <Button label="Edit details" icon="create-outline" onPress={() => setEditing(true)} quiet />
          </>
        ) : null}
      </Card>

      {editing ? (
        <Card>
          <SectionTitle title="Edit this record" detail="These changes update the existing entry." />
          <TextField
            label="A clear name"
            value={draft.title}
            onChangeText={value => setDraftField('title', value)}
            maxLength={120}
          />
          <Text style={styles.label}>What kind of entry is it?</Text>
          <View style={styles.chips}>
            {WORK_KINDS.map(value => (
              <Chip
                key={value}
                label={kindLabel[value]}
                selected={draft.workKind === value}
                onPress={() => setDraftField('workKind', value)}
              />
            ))}
          </View>
          <Text style={styles.label}>Where in the home?</Text>
          <View style={styles.chips}>
            {WORK_CATEGORIES.map(value => (
              <Chip
                key={value}
                label={categoryLabel[value]}
                selected={draft.category === value}
                onPress={() => setDraftField('category', value)}
              />
            ))}
          </View>
          <Text style={styles.label}>Where does it stand?</Text>
          <View style={styles.chips}>
            {WORK_STATUSES.map(value => (
              <Chip
                key={value}
                label={statusLabel[value]}
                selected={draft.status === value}
                onPress={() => setDraftField('status', value)}
              />
            ))}
          </View>
          <TextField
            label="Date (optional)"
            value={draft.occurredOn}
            onChangeText={value => setDraftField('occurredOn', value)}
            placeholder="2026-08-25"
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
            maxLength={10}
            hint={validOptionalWorkDate(draft.occurredOn)
              ? 'Use YYYY-MM-DD, or leave it blank if you do not know.'
              : 'Enter a real date as YYYY-MM-DD.'}
          />
          <TextField
            label="What should the home remember?"
            value={draft.summary}
            onChangeText={value => setDraftField('summary', value)}
            multiline
            maxLength={2_000}
            placeholder="What happened, what was decided, materials, or anything useful later…"
          />
          <TextField
            label="Person or company (optional)"
            value={draft.professionalLabel}
            onChangeText={value => setDraftField('professionalLabel', value)}
            maxLength={160}
            placeholder="ABC Heating & Air"
          />
          <Button
            label={saving ? 'Saving…' : 'Save changes'}
            icon="checkmark"
            onPress={() => void save()}
            disabled={saving || conflicted || !draft.title.trim() || !changed || !validOptionalWorkDate(draft.occurredOn)}
          />
          <Button label="Cancel" onPress={cancelEdit} disabled={saving} quiet />
          {conflicted ? (
            <Notice
              message="This record changed somewhere else. Load the latest version before editing it again; your unsaved edits will be replaced."
              actionLabel="Load latest version"
              onAction={reloadAfterConflict}
            />
          ) : null}
          {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}
        </Card>
      ) : null}
      {saveSuccess ? <Text accessibilityRole="alert" style={styles.success}>{saveSuccess}</Text> : null}

      <Card>
        <SectionTitle
          title="Updates"
          detail="Notes and milestones stay with this work."
        />
        {activity.length > 0 ? (
          <View style={styles.timeline}>
            {activity.map((entry, index) => (
              <View key={entry.activityRef} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, entry.kind === 'milestone' && styles.milestoneDot]}>
                    <Ionicons
                      name={entry.kind === 'milestone' ? 'flag' : 'chatbubble'}
                      size={11}
                      color={colors.ink}
                    />
                  </View>
                  {index < activity.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.timelineCopy}>
                  <Text style={styles.timelineMeta}>
                    {entry.kind === 'milestone' ? 'Milestone' : 'Note'} · {displayActivityDate(entry.createdAt)}
                  </Text>
                  <Text style={styles.timelineBody}>{entry.body}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyActivity}>No updates yet. Add the first decision, visit, or reminder.</Text>
        )}
        <Divider />
        <TextField
          label="Add an update"
          value={note}
          onChangeText={changeNote}
          multiline
          maxLength={2_000}
          placeholder="The replacement part is ordered and should arrive Friday."
        />
        <Button
          label={addingNote ? 'Saving…' : 'Save note'}
          icon="chatbubble-ellipses-outline"
          onPress={() => void addNote()}
          disabled={addingNote || !note.trim()}
        />
        {noteError ? <Text accessibilityRole="alert" style={styles.error}>{noteError}</Text> : null}
        {noteSuccess ? <Text accessibilityRole="alert" style={styles.success}>{noteSuccess}</Text> : null}
      </Card>

      <ProjectChoices homeId={homeId} projectRef={current.projectRef} />

      <ProjectFiles homeId={homeId} projectRef={current.projectRef} />

      <SectionTitle
        title="Proposals"
        detail="Invite a company here, or keep a written proposal you received somewhere else."
      />

      <ProjectProfessionalWorkspace
        homeId={homeId}
        work={current}
        {...(preselectedOrganizationRef ? { preselectedOrganizationRef } : {})}
      />

      <ProjectOutsideProposalWorkspace
        homeId={homeId}
        work={current}
        onVisitSaved={created => setActivity(entries => [
          ...entries.filter(entry => entry.activityRef !== created.activityRef),
          created,
        ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)))}
      />

    </Page>
  )
}

function ProjectBack({ onPress }: { readonly onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to Work"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
    >
      <Ionicons name="chevron-back" size={21} color={colors.aqua} />
      <Text style={styles.backText}>Work</Text>
    </Pressable>
  )
}

function Detail({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, value === 'Not recorded' && styles.emptyValue]}>{value}</Text>
    </View>
  )
}

function displayDate(value: string | null): string {
  if (!value) return 'Not recorded'
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function displayActivityDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function goBack(homeId: string) {
  openWork(homeId)
}

function openWork(homeId: string) {
  router.replace({ pathname: '/home/[homeId]/work', params: { homeId } })
}

function openProjectRolo(homeId: string, projectRef: string) {
  router.push({
    pathname: '/home/[homeId]/rolo',
    params: {
      homeId,
      projectRef,
      prompt: 'Help me review this work record. What looks incomplete or worth deciding next?',
    },
  })
}

const styles = StyleSheet.create({
  back: {
    alignSelf: 'flex-start', minHeight: 44, marginLeft: -7, paddingHorizontal: 7,
    flexDirection: 'row', alignItems: 'center', gap: 2,
  },
  backPressed: { opacity: 0.6 },
  backText: { color: colors.aqua, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  status: { color: colors.lime, fontSize: 13, fontWeight: '900' },
  detailRow: { gap: 3 },
  detailLabel: { color: colors.slate, fontSize: 12, fontWeight: '800' },
  detailValue: { color: colors.cream, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  summaryBlock: { gap: 5, paddingTop: space.xs },
  summary: { color: colors.cream, fontSize: 15, lineHeight: 22 },
  emptyValue: { color: colors.smoke, fontStyle: 'italic' },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: 'row', alignItems: 'stretch', gap: 11 },
  timelineRail: { width: 24, alignItems: 'center' },
  timelineDot: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.aqua,
    alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  milestoneDot: { backgroundColor: colors.lime },
  timelineLine: { flex: 1, width: 1, minHeight: 18, backgroundColor: colors.line },
  timelineCopy: { flex: 1, gap: 4, paddingBottom: space.md },
  timelineMeta: { color: colors.aqua, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  timelineBody: { color: colors.cream, fontSize: 14, lineHeight: 20 },
  emptyActivity: { color: colors.slate, fontSize: 13, lineHeight: 19 },
  label: { color: colors.slate, fontSize: 13, fontWeight: '800', marginTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  success: { color: colors.mint, fontSize: 14, lineHeight: 20, fontWeight: '800' },
})
