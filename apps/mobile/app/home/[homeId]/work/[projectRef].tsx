import { useCallback, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Redirect, router, useGlobalSearchParams, useLocalSearchParams } from 'expo-router'
import { NativeApiError } from '../../../../src/api/client.ts'
import type { HomesroloApi } from '../../../../src/api/contract.ts'
import { friendlyError } from '../../../../src/api/errors.ts'
import type { WorkRecord } from '../../../../src/api/model.ts'
import { useSession } from '../../../../src/auth/SessionProvider.tsx'
import { workDetailReturnPath } from '../../../../src/auth/return-route.ts'
import { HomeHeader } from '../../../../src/components/HomeHeader.tsx'
import {
  Button,
  Card,
  Chip,
  Loading,
  Notice,
  Page,
  SectionTitle,
  Tag,
  TextField,
} from '../../../../src/components/ui.tsx'
import { useResource } from '../../../../src/hooks/useResource.ts'
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
  type WorkDraft,
} from '../../../../src/work/detail.ts'

type PendingCommand = {
  readonly intent: string
  readonly commandRef: string
}

export default function WorkDetailScreen() {
  const { homeId } = useGlobalSearchParams<{ homeId: string }>()
  const { projectRef } = useLocalSearchParams<{ projectRef: string }>()
  const { state: auth, api, refreshSession } = useSession()
  const loader = useCallback(async () => {
    const work = await api.listWork(homeId)
    return findExactWork(work, homeId, projectRef)
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
        <Button label="Back" icon="arrow-back" onPress={() => goBack(homeId)} quiet />
        <Notice message="This work record could not load." actionLabel="Try again" onAction={resource.reload} />
      </Page>
    )
  }
  if (!resource.state.value) {
    return (
      <Page>
        <Button label="Back" icon="arrow-back" onPress={() => goBack(homeId)} quiet />
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
      key={`${resource.state.value.projectRef}:${resource.state.value.revision}`}
      api={api}
      homeId={homeId}
      work={resource.state.value}
      onReload={resource.reload}
    />
  )
}

function WorkDetail({ api, homeId, work, onReload }: {
  readonly api: HomesroloApi
  readonly homeId: string
  readonly work: WorkRecord
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
      await api.addWorkNote(homeId, current.projectRef, body, pendingNote.current.commandRef)
      pendingNote.current = null
      lastCompletedNote.current = intent
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
      <HomeHeader
        section={kindLabel[current.workKind]}
        title={current.title}
        detail={`${categoryLabel[current.category]} · saved to this home`}
      />
      <Button label="Back" icon="arrow-back" onPress={() => goBack(homeId)} quiet />

      <Card accent>
        <View style={styles.headingRow}>
          <Tag tone={current.status === 'completed' ? 'mint' : current.status === 'in_progress' ? 'lime' : 'plain'}>
            {kindLabel[current.workKind]}
          </Tag>
          <Text style={styles.status}>{statusLabel[current.status]}</Text>
        </View>
        <Detail label="Status" value={statusLabel[current.status]} />
        <Detail label="Date" value={current.occurredOn ?? 'Not recorded'} />
        <Detail label="Person or company" value={current.professionalLabel ?? 'Not recorded'} />
        <View style={styles.summaryBlock}>
          <Text style={styles.detailLabel}>What the home remembers</Text>
          <Text style={[styles.summary, !current.summary && styles.emptyValue]}>
            {current.summary || 'No summary saved yet.'}
          </Text>
        </View>
        {!editing ? <Button label="Edit details" icon="create-outline" onPress={() => setEditing(true)} /> : null}
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
            hint="Use YYYY-MM-DD, or leave it blank if you do not know."
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
            disabled={saving || conflicted || !draft.title.trim() || !changed}
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
          title="Add a note"
          detail="Save a decision, update, observation, or reminder to this same record."
        />
        <TextField
          label="Note"
          value={note}
          onChangeText={changeNote}
          multiline
          maxLength={2_000}
          placeholder="The replacement part is ordered and should arrive Friday."
        />
        <Button
          label={addingNote ? 'Adding note…' : 'Add note'}
          icon="chatbubble-ellipses-outline"
          onPress={() => void addNote()}
          disabled={addingNote || !note.trim()}
        />
        {noteError ? <Text accessibilityRole="alert" style={styles.error}>{noteError}</Text> : null}
        {noteSuccess ? <Text accessibilityRole="alert" style={styles.success}>{noteSuccess}</Text> : null}
      </Card>
    </Page>
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

function goBack(homeId: string) {
  if (router.canGoBack()) {
    router.back()
    return
  }
  openWork(homeId)
}

function openWork(homeId: string) {
  router.replace({ pathname: '/home/[homeId]/work', params: { homeId } })
}

const styles = StyleSheet.create({
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
  label: { color: colors.slate, fontSize: 13, fontWeight: '800', marginTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  success: { color: colors.mint, fontSize: 14, lineHeight: 20, fontWeight: '800' },
})
