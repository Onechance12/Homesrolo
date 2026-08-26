import { useCallback, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Redirect, router, useFocusEffect, useGlobalSearchParams } from 'expo-router'
import type { WorkCategory, WorkKind, WorkStatus } from '../../../../src/api/model.ts'
import { friendlyError } from '../../../../src/api/errors.ts'
import { useSession } from '../../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../../src/components/HomeHeader.tsx'
import { WorkCard } from '../../../../src/components/WorkCard.tsx'
import { Button, Card, Chip, Loading, Notice, Page, SectionTitle, TextField } from '../../../../src/components/ui.tsx'
import { useResource } from '../../../../src/hooks/useResource.ts'
import { categoryLabel, colors, kindLabel, space, statusLabel } from '../../../../src/theme.ts'

const KINDS: readonly WorkKind[] = ['project', 'issue', 'repair', 'service', 'incident']
const CATEGORIES: readonly WorkCategory[] = [
  'roofing', 'hvac', 'plumbing', 'electrical', 'interior', 'exterior',
  'appliances', 'landscaping', 'pest', 'pool', 'new_construction', 'other',
]
const STATUSES: readonly WorkStatus[] = ['planned', 'in_progress', 'completed']

export default function WorkScreen() {
  const { homeId } = useGlobalSearchParams<{ homeId: string }>()
  const { state: auth, api, previewMode, refreshSession } = useSession()
  const loader = useCallback(() => api.listWork(homeId), [api, homeId])
  const resource = useResource(loader, auth.kind === 'signed_in')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'open' | 'care'>('open')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [professional, setProfessional] = useState('')
  const [occurredOn, setOccurredOn] = useState('')
  const [kind, setKind] = useState<WorkKind>('project')
  const [category, setCategory] = useState<WorkCategory>('other')
  const [status, setStatus] = useState<WorkStatus>('planned')
  const pendingCreate = useRef<{ readonly intent: string; readonly commandRef: string } | null>(null)
  const hasFocused = useRef(false)

  useFocusEffect(useCallback(() => {
    if (hasFocused.current) resource.reload()
    else hasFocused.current = true
  }, [resource.reload]))

  const visible = useMemo(() => resource.state.kind !== 'ready' ? []
    : resource.state.value.filter(item => !item.archived).filter(item => {
      if (filter === 'open') return item.status === 'planned' || item.status === 'in_progress'
      if (filter === 'care') return ['issue', 'repair', 'service'].includes(item.workKind)
      return true
    }), [filter, resource.state])

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }

  function reset() {
    pendingCreate.current = null
    setTitle(''); setSummary(''); setProfessional(''); setOccurredOn('')
    setKind('project'); setCategory('other'); setStatus('planned'); setCreating(false)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const createFields = {
        title: title.trim(), workKind: kind,
        category, status, ...(occurredOn.trim() ? { occurredOn: occurredOn.trim() } : {}),
        ...(summary.trim() ? { summary: summary.trim() } : {}),
        ...(professional.trim() ? { professionalLabel: professional.trim() } : {}),
      }
      const intent = JSON.stringify(createFields)
      if (!pendingCreate.current || pendingCreate.current.intent !== intent) {
        pendingCreate.current = { intent, commandRef: await api.newCommandRef() }
      }
      await api.createWork(homeId, {
        commandRef: pendingCreate.current.commandRef,
        ...createFields,
      })
      pendingCreate.current = null
      reset()
      resource.reload()
    } catch (caught) { setError(friendlyError(caught)) } finally { setBusy(false) }
  }

  return (
    <Page>
      <HomeHeader
        section="Plans"
        title="Keep work moving."
        detail="Projects, repairs, and routine help stay together here from the first idea through the finished work."
      />
      {!creating ? (
        <>
          <Card accent>
            <Text style={styles.formTitle}>Start with what you want done.</Text>
            <Text style={styles.formCopy}>Tell Rolo about the problem, project, or service. It will ask the useful questions and let you approve the plan before anything is saved.</Text>
            <Button
              label="Start a plan with Rolo"
              icon="sparkles-outline"
              onPress={() => router.push({
                pathname: '/home/[homeId]/rolo',
                params: {
                  homeId,
                  prompt: 'Help me start a plan for work at my home. Ask what I need done, why, when, and the details a professional would need to understand it.',
                },
              })}
            />
          </Card>
          <Button label="Add details myself" icon="create-outline" quiet onPress={() => setCreating(true)} />
        </>
      ) : null}
      {creating ? (
        <Card accent>
          <Text style={styles.formTitle}>What happened—or needs to happen?</Text>
          <TextField label="A clear name" value={title} onChangeText={setTitle} placeholder="Upstairs AC stopped cooling" />
          <Text style={styles.label}>What kind of entry is it?</Text>
          <View style={styles.chips}>{KINDS.map(value => <Chip key={value} label={kindLabel[value]} selected={kind === value} onPress={() => setKind(value)} />)}</View>
          <Text style={styles.label}>Where in the home?</Text>
          <View style={styles.chips}>{CATEGORIES.map(value => <Chip key={value} label={categoryLabel[value]} selected={category === value} onPress={() => setCategory(value)} />)}</View>
          <Text style={styles.label}>Where does it stand?</Text>
          <View style={styles.chips}>{STATUSES.map(value => <Chip key={value} label={statusLabel[value]} selected={status === value} onPress={() => setStatus(value)} />)}</View>
          <TextField label="Date (optional)" value={occurredOn} onChangeText={setOccurredOn} placeholder="2026-08-25" keyboardType="numbers-and-punctuation" hint="Use YYYY-MM-DD, or leave it blank if you do not know." />
          <TextField label="What should the home remember?" value={summary} onChangeText={setSummary} multiline placeholder="What you saw, what was decided, materials, or anything useful later…" />
          <TextField label="Person or company (optional)" value={professional} onChangeText={setProfessional} placeholder="ABC Heating & Air" hint="This also adds them to the People Rolodex." />
          <Button label={busy ? 'Saving…' : 'Save to this home'} onPress={() => void save()} disabled={busy || !title.trim()} />
          <Button label="Cancel" onPress={reset} disabled={busy} quiet />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>
      ) : null}

      <SectionTitle title="Your plans" detail="One place for open work, care, and finished history." />
      <View style={styles.chips}>
        <Chip label="Active" selected={filter === 'open'} onPress={() => setFilter('open')} />
        <Chip label="Everything" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Care & repairs" selected={filter === 'care'} onPress={() => setFilter('care')} />
      </View>
      {resource.state.kind === 'loading' ? <Loading label="Opening work…" /> : null}
      {resource.state.kind === 'error' ? (
        <Notice
          message={`Work could not load.${previewMode ? ` (${resource.state.message})` : ''}`}
          actionLabel="Try again"
          onAction={resource.reload}
        />
      ) : null}
      {visible.map(item => <WorkCard key={item.projectRef} work={item} />)}
      {resource.state.kind === 'ready' && visible.length === 0 ? (
        <Notice message={filter === 'open'
          ? 'No active plans yet. Start with Rolo or add the details yourself.'
          : 'Nothing matches this view yet.'} />
      ) : null}
    </Page>
  )
}

const styles = StyleSheet.create({
  formTitle: { color: colors.cream, fontSize: 22, lineHeight: 27, fontWeight: '900' },
  formCopy: { color: colors.slate, fontSize: 14, lineHeight: 21 },
  label: { color: colors.slate, fontSize: 13, fontWeight: '800', marginTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' },
})
