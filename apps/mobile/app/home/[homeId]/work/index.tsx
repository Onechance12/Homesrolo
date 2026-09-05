import { useCallback, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router, useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { HouseholdMember, WorkCategory, WorkKind, WorkStatus } from '../../../../src/api/model.ts'
import { friendlyError } from '../../../../src/api/errors.ts'
import {
  activeHouseholdMembers,
  assignableHouseholdMembers,
  canCurrentHouseholdMemberUpdate,
  currentHouseholdMembershipRef,
} from '../../../../src/api/household.ts'
import { useSession } from '../../../../src/auth/SessionProvider.tsx'
import { SessionCheckRequired } from '../../../../src/auth/session-fence.ts'
import { HomeHeader } from '../../../../src/components/HomeHeader.tsx'
import { RoloDeck, type RoloDeckDivider } from '../../../../src/components/RoloDeck.tsx'
import { Button, Card, Chip, Loading, Notice, Page, TextField } from '../../../../src/components/ui.tsx'
import { useHomeId } from '../../../../src/home/HomeRouteProvider.tsx'
import { workRecordCards, type HomesroloCard } from '../../../../src/home/rolodex.ts'
import { useResource } from '../../../../src/hooks/useResource.ts'
import { categoryLabel, colors, kindLabel, space, statusLabel } from '../../../../src/theme.ts'
import { validOptionalWorkDate } from '../../../../src/work/detail.ts'

const KINDS: readonly WorkKind[] = ['project', 'issue', 'repair', 'service', 'incident', 'task']
const CATEGORIES: readonly WorkCategory[] = [
  'roofing', 'hvac', 'plumbing', 'electrical', 'interior', 'exterior',
  'appliances', 'landscaping', 'pest', 'pool', 'new_construction', 'other',
]
const STATUSES: readonly WorkStatus[] = ['planned', 'in_progress', 'completed']
type WorkFilter = 'all' | 'open' | 'household' | 'assigned_to_me' | 'care' | 'completed'

function workDividers(currentMembershipRef: string | null): readonly RoloDeckDivider[] {
  const assigned: readonly RoloDeckDivider[] = currentMembershipRef ? [{
    id: 'assigned_to_me',
    label: 'Assigned to me',
    includes: card => card.kind === 'work'
      && card.data.assignedMembershipRef === currentMembershipRef
      && card.data.status !== 'completed' && card.data.status !== 'cancelled',
  }] : []
  return [
  {
    id: 'open',
    label: 'Active',
    includes: card => card.kind === 'work'
      && (card.data.status === 'planned' || card.data.status === 'in_progress'),
  },
  ...assigned,
  {
    id: 'household',
    label: 'Household',
    includes: card => card.kind === 'work' && card.data.workKind === 'task',
  },
  {
    id: 'care',
    label: 'Care',
    includes: card => card.kind === 'work'
      && (card.data.workKind === 'issue' || card.data.workKind === 'repair' || card.data.workKind === 'service'),
  },
  { id: 'completed', label: 'Completed', includes: card => card.kind === 'work' && card.data.status === 'completed' },
  { id: 'all', label: 'All' },
  ]
}

export default function WorkScreen() {
  const homeId = useHomeId()
  const window = useWindowDimensions()
  const { state: auth, api, previewMode, refreshSession } = useSession()
  const loader = useCallback(async () => {
    const work = await api.listWork(homeId)
    // Older or restricted household routes fail closed to an empty roster.
    // Session checks must reach the read-recovery hook before showing a fallback.
    const members = await api.getHousehold(homeId)
      .then(household => household.members)
      .catch(error => {
        if (error instanceof SessionCheckRequired) throw error
        return [] as readonly HouseholdMember[]
      })
    return { work, members }
  }, [api, homeId])
  const resource = useResource(loader, auth.kind === 'signed_in')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<WorkFilter>('open')
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [professional, setProfessional] = useState('')
  const [occurredOn, setOccurredOn] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [assignedMembershipRef, setAssignedMembershipRef] = useState<string | null>(null)
  const [kind, setKind] = useState<WorkKind>('project')
  const [category, setCategory] = useState<WorkCategory>('other')
  const [status, setStatus] = useState<WorkStatus>('planned')
  const pendingCreate = useRef<{ readonly intent: string; readonly commandRef: string } | null>(null)
  const completingTaskRefs = useRef(new Set<string>())
  const hasFocused = useRef(false)

  useFocusEffect(useCallback(() => {
    if (hasFocused.current) resource.reload()
    else hasFocused.current = true
  }, [resource.reload]))

  const cards = useMemo(() => {
    if (resource.state.kind !== 'ready') return []
    const statusRank = { in_progress: 0, planned: 1, completed: 2, cancelled: 3 } as const
    const ordered = [...resource.state.value.work].sort((left, right) => statusRank[left.status] - statusRank[right.status]
      || right.updatedAt.localeCompare(left.updatedAt))
    return workRecordCards(ordered, resource.state.value.members)
  }, [resource.state])
  const householdMembers = resource.state.kind === 'ready'
    ? activeHouseholdMembers(resource.state.value.members)
    : []
  const assignableMembers = resource.state.kind === 'ready'
    ? assignableHouseholdMembers(resource.state.value.members)
    : []
  const canChangeWork = resource.state.kind === 'ready'
    && canCurrentHouseholdMemberUpdate(resource.state.value.members)
  const currentMembershipRef = currentHouseholdMembershipRef(householdMembers)
  const dividers = useMemo(() => workDividers(currentMembershipRef), [currentMembershipRef])
  const compactDeck = window.width < 600 || window.height < 780

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Page><Loading /></Page>
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }

  function reset() {
    pendingCreate.current = null
    setTitle(''); setSummary(''); setProfessional(''); setOccurredOn(''); setDueOn('')
    setAssignedMembershipRef(null)
    setKind('project'); setCategory('other'); setStatus('planned'); setCreating(false)
  }

  async function save() {
    if (!validOptionalWorkDate(occurredOn) || !validOptionalWorkDate(dueOn)) {
      setError('Use a real date as YYYY-MM-DD, or leave it blank.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const createFields = {
        title: title.trim(), workKind: kind,
        category, status, ...(occurredOn.trim() ? { occurredOn: occurredOn.trim() } : {}),
        ...(kind === 'task' && assignedMembershipRef ? { assignedMembershipRef } : {}),
        ...(kind === 'task' && dueOn.trim() ? { dueOn: dueOn.trim() } : {}),
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

  if (creating && canChangeWork) {
    return (
      <Page>
        <HomeHeader
          section="Work"
          title="Add work to this home."
          detail="Enter it directly, or cancel and let Rolo help you shape it first."
        />
        <Card accent>
          <Text style={styles.formTitle}>What happened—or needs to happen?</Text>
          <TextField label="A clear name" value={title} onChangeText={setTitle} placeholder="Upstairs AC stopped cooling" />
          <Text style={styles.label}>What kind of entry is it?</Text>
          <View style={styles.chips}>{KINDS.map(value => <Chip key={value} label={kindLabel[value]} selected={kind === value} onPress={() => selectKind(value)} />)}</View>
          <Text style={styles.label}>What part of the home?</Text>
          <View style={styles.chips}>{CATEGORIES.map(value => <Chip key={value} label={categoryLabel[value]} selected={category === value} onPress={() => setCategory(value)} />)}</View>
          <Text style={styles.label}>Where does it stand?</Text>
          <View style={styles.chips}>{STATUSES.map(value => <Chip key={value} label={statusLabel[value]} selected={status === value} onPress={() => setStatus(value)} />)}</View>
          <TextField label="Date (optional)" value={occurredOn} onChangeText={value => { setOccurredOn(value); setError(null) }} placeholder="2026-08-25" keyboardType="numbers-and-punctuation" hint={validOptionalWorkDate(occurredOn) ? 'Use YYYY-MM-DD, or leave it blank if you do not know.' : 'Enter a real date as YYYY-MM-DD.'} />
          {kind === 'task' ? (
            <>
              <Text style={styles.label}>Who is responsible?</Text>
              <View style={styles.chips}>
                <Chip label="Unassigned" selected={assignedMembershipRef === null} onPress={() => setAssignedMembershipRef(null)} />
                {assignableMembers.map(member => (
                  <Chip
                    key={member.membershipRef}
                    label={member.isCurrentPrincipal ? 'Me' : member.displayLabel}
                    selected={assignedMembershipRef === member.membershipRef}
                    onPress={() => setAssignedMembershipRef(member.membershipRef)}
                  />
                ))}
              </View>
              <TextField
                label="Due date (optional)"
                value={dueOn}
                onChangeText={value => { setDueOn(value); setError(null) }}
                placeholder="2026-09-05"
                keyboardType="numbers-and-punctuation"
                hint={validOptionalWorkDate(dueOn) ? 'Use YYYY-MM-DD, or leave it open.' : 'Enter a real date as YYYY-MM-DD.'}
              />
            </>
          ) : null}
          <TextField label="What should the home remember?" value={summary} onChangeText={setSummary} multiline placeholder="What you saw, what was decided, materials, or anything useful later…" />
          <TextField label="Person or company (optional)" value={professional} onChangeText={setProfessional} placeholder="ABC Heating & Air" hint="This also adds them to the People Rolodex." />
          <Button label={busy ? 'Saving…' : 'Save to this home'} onPress={() => void save()} disabled={busy || !title.trim() || !validOptionalWorkDate(occurredOn) || !validOptionalWorkDate(dueOn)} />
          <Button label="Cancel" onPress={reset} disabled={busy} quiet />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>
      </Page>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.deckPage}>
        <View style={styles.deckHeader}>
          <View style={styles.deckHeading}>
            <Text style={styles.deckEyebrow}>Work Rolo</Text>
            <Text accessibilityRole="header" style={styles.deckTitle}>What’s happening at home</Text>
          </View>
          <View style={styles.deckActions}>
            <HeaderAction
              accessibilityHint="Starts a conversation to plan or record work"
              icon="chatbubble-ellipses-outline"
              label="Tell Rolo"
              onPress={() => router.push({
                pathname: '/home/[homeId]/rolo',
                params: { homeId, prompt: 'I need help planning some work at my home.' },
              })}
            />
            {canChangeWork ? (
              <HeaderAction
                accessibilityHint="Opens the manual work form"
                icon="add"
                label="Add work"
                onPress={() => setCreating(true)}
              />
            ) : null}
          </View>
        </View>
        {resource.state.kind === 'loading' ? <Loading label="Opening work…" /> : null}
        {resource.state.kind === 'error' ? (
          <Notice
            message={`Work could not load.${previewMode ? ` (${resource.state.message})` : ''}`}
            actionLabel="Try again"
            onAction={resource.reload}
          />
        ) : null}
        {resource.state.kind === 'ready' && error ? (
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
        ) : null}
        {resource.state.kind === 'ready' ? (
          <RoloDeck
            cards={cards}
            variant={compactDeck ? 'compact' : 'full'}
            query={query}
            onQueryChange={setQuery}
            dividers={dividers}
            selectedDivider={filter}
            onSelectedDividerChange={selectWorkFilter}
            searchPlaceholder="Find a project, repair, service, or company"
            emptyTitle={emptyDeckTitle(filter, query)}
            emptyDetail="Try another tab, clear the search, or add work with Rolo."
            fillAvailable
            peekSize={compactDeck ? 24 : 38}
            onOpen={openWorkCard}
            onAskRolo={askRoloAboutWork}
            canAskRolo={card => card.kind !== 'work' || card.data.workKind !== 'task'
              || card.data.status === 'completed' || card.data.status === 'cancelled'}
            onQuickComplete={completeTaskCard}
            canQuickComplete={card => canChangeWork && card.kind === 'work'
              && card.data.workKind === 'task'
              && card.data.status !== 'completed'
              && card.data.status !== 'cancelled'}
          />
        ) : null}
      </View>
    </SafeAreaView>
  )

  function openWorkCard(card: HomesroloCard) {
    if (card.destination.kind !== 'work') return
    router.push({
      pathname: '/home/[homeId]/work/[projectRef]',
      params: {
        homeId: card.destination.homeRef,
        projectRef: card.destination.projectRef,
        tab: card.destination.section,
      },
    })
  }

  function askRoloAboutWork(card: HomesroloCard) {
    if (card.kind !== 'work') return
    router.push({
      pathname: '/home/[homeId]/rolo',
      params: {
        homeId: card.homeRef,
        projectRef: card.data.projectRef,
        prompt: 'Help me with this saved work record.',
      },
    })
  }

  function selectWorkFilter(value: string) {
    if (isWorkFilter(value)) setFilter(value)
  }

  function selectKind(value: WorkKind) {
    setKind(value)
    if (value === 'task') {
      setAssignedMembershipRef(previous => previous ?? currentMembershipRef)
    } else {
      setAssignedMembershipRef(null)
      setDueOn('')
    }
  }

  async function completeTaskCard(card: HomesroloCard) {
    if (!canChangeWork || card.kind !== 'work' || card.data.workKind !== 'task'
      || resource.state.kind !== 'ready' || completingTaskRefs.current.has(card.data.projectRef)) return
    const current = resource.state.value.work.find(item => item.projectRef === card.data.projectRef)
    if (!current || current.homeRef !== homeId || current.status === 'completed') return
    completingTaskRefs.current.add(current.projectRef)
    setError(null)
    try {
      await api.updateWork(homeId, current.projectRef, {
        commandRef: await api.newCommandRef(),
        expectedRevision: current.revision,
        status: 'completed',
      })
      resource.reload()
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      completingTaskRefs.current.delete(current.projectRef)
    }
  }
}

function HeaderAction({ label, icon, accessibilityHint, onPress }: {
  readonly label: string
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly accessibilityHint: string
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.headerAction, pressed && styles.headerActionPressed]}
    >
      <Ionicons name={icon} size={20} color={colors.cream} />
    </Pressable>
  )
}

function isWorkFilter(value: string): value is WorkFilter {
  return value === 'all' || value === 'open' || value === 'household'
    || value === 'assigned_to_me' || value === 'care' || value === 'completed'
}

function emptyDeckTitle(filter: WorkFilter, query: string): string {
  if (query.trim()) return 'No work matches that search'
  if (filter === 'open') return 'Nothing is open right now'
  if (filter === 'completed') return 'No finished work here yet'
  if (filter === 'assigned_to_me') return 'Nothing is assigned to you'
  if (filter === 'household') return 'No household to-dos here yet'
  if (filter === 'care') return 'No repairs or service here yet'
  return 'This Work Rolo is empty'
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ink },
  deckPage: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xs, gap: space.sm },
  deckHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  deckHeading: { flex: 1, minWidth: 0, gap: 2 },
  deckEyebrow: { color: colors.lime, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase' },
  deckTitle: { color: colors.cream, fontSize: 20, lineHeight: 24, fontWeight: '900', letterSpacing: -0.4 },
  deckActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerAction: {
    width: 44, height: 44, borderRadius: 15, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.inkRaised,
  },
  headerActionPressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  formTitle: { color: colors.cream, fontSize: 22, lineHeight: 27, fontWeight: '900' },
  label: { color: colors.slate, fontSize: 13, fontWeight: '800', marginTop: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' },
})
