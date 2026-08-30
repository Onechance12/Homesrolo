import { useCallback, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router, useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { WorkCategory, WorkKind, WorkStatus } from '../../../../src/api/model.ts'
import { friendlyError } from '../../../../src/api/errors.ts'
import { useSession } from '../../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../../src/components/HomeHeader.tsx'
import { RoloDeck, type RoloDeckDivider } from '../../../../src/components/RoloDeck.tsx'
import { Button, Card, Chip, Loading, Notice, Page, TextField } from '../../../../src/components/ui.tsx'
import { useHomeId } from '../../../../src/home/HomeRouteProvider.tsx'
import { workRecordCards, type HomesroloCard } from '../../../../src/home/rolodex.ts'
import { useResource } from '../../../../src/hooks/useResource.ts'
import { categoryLabel, colors, kindLabel, space, statusLabel } from '../../../../src/theme.ts'
import { validOptionalWorkDate } from '../../../../src/work/detail.ts'

const KINDS: readonly WorkKind[] = ['project', 'issue', 'repair', 'service', 'incident']
const CATEGORIES: readonly WorkCategory[] = [
  'roofing', 'hvac', 'plumbing', 'electrical', 'interior', 'exterior',
  'appliances', 'landscaping', 'pest', 'pool', 'new_construction', 'other',
]
const STATUSES: readonly WorkStatus[] = ['planned', 'in_progress', 'completed']
type WorkFilter = 'all' | 'open' | 'care' | 'completed'

const WORK_DIVIDERS: readonly RoloDeckDivider[] = [
  {
    id: 'open',
    label: 'Active',
    includes: card => card.kind === 'work'
      && (card.data.status === 'planned' || card.data.status === 'in_progress'),
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

export default function WorkScreen() {
  const homeId = useHomeId()
  const window = useWindowDimensions()
  const { state: auth, api, previewMode, refreshSession } = useSession()
  const loader = useCallback(() => api.listWork(homeId), [api, homeId])
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
  const [kind, setKind] = useState<WorkKind>('project')
  const [category, setCategory] = useState<WorkCategory>('other')
  const [status, setStatus] = useState<WorkStatus>('planned')
  const pendingCreate = useRef<{ readonly intent: string; readonly commandRef: string } | null>(null)
  const hasFocused = useRef(false)

  useFocusEffect(useCallback(() => {
    if (hasFocused.current) resource.reload()
    else hasFocused.current = true
  }, [resource.reload]))

  const cards = useMemo(() => {
    if (resource.state.kind !== 'ready') return []
    const statusRank = { in_progress: 0, planned: 1, completed: 2, cancelled: 3 } as const
    const ordered = [...resource.state.value].sort((left, right) => statusRank[left.status] - statusRank[right.status]
      || right.updatedAt.localeCompare(left.updatedAt))
    return workRecordCards(ordered)
  }, [resource.state])
  const compactDeck = window.width < 600 || window.height < 780

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Page><Loading /></Page>
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }

  function reset() {
    pendingCreate.current = null
    setTitle(''); setSummary(''); setProfessional(''); setOccurredOn('')
    setKind('project'); setCategory('other'); setStatus('planned'); setCreating(false)
  }

  async function save() {
    if (!validOptionalWorkDate(occurredOn)) {
      setError('Use a real date as YYYY-MM-DD, or leave it blank.')
      return
    }
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

  if (creating) {
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
          <View style={styles.chips}>{KINDS.map(value => <Chip key={value} label={kindLabel[value]} selected={kind === value} onPress={() => setKind(value)} />)}</View>
          <Text style={styles.label}>What part of the home?</Text>
          <View style={styles.chips}>{CATEGORIES.map(value => <Chip key={value} label={categoryLabel[value]} selected={category === value} onPress={() => setCategory(value)} />)}</View>
          <Text style={styles.label}>Where does it stand?</Text>
          <View style={styles.chips}>{STATUSES.map(value => <Chip key={value} label={statusLabel[value]} selected={status === value} onPress={() => setStatus(value)} />)}</View>
          <TextField label="Date (optional)" value={occurredOn} onChangeText={value => { setOccurredOn(value); setError(null) }} placeholder="2026-08-25" keyboardType="numbers-and-punctuation" hint={validOptionalWorkDate(occurredOn) ? 'Use YYYY-MM-DD, or leave it blank if you do not know.' : 'Enter a real date as YYYY-MM-DD.'} />
          <TextField label="What should the home remember?" value={summary} onChangeText={setSummary} multiline placeholder="What you saw, what was decided, materials, or anything useful later…" />
          <TextField label="Person or company (optional)" value={professional} onChangeText={setProfessional} placeholder="ABC Heating & Air" hint="This also adds them to the People Rolodex." />
          <Button label={busy ? 'Saving…' : 'Save to this home'} onPress={() => void save()} disabled={busy || !title.trim() || !validOptionalWorkDate(occurredOn)} />
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
            <HeaderAction
              accessibilityHint="Opens the manual work form"
              icon="add"
              label="Add work"
              onPress={() => setCreating(true)}
            />
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
        {resource.state.kind === 'ready' ? (
          <RoloDeck
            cards={cards}
            variant={compactDeck ? 'compact' : 'full'}
            query={query}
            onQueryChange={setQuery}
            dividers={WORK_DIVIDERS}
            selectedDivider={filter}
            onSelectedDividerChange={selectWorkFilter}
            searchPlaceholder="Find a project, repair, service, or company"
            emptyTitle={emptyDeckTitle(filter, query)}
            emptyDetail="Try another tab, clear the search, or add work with Rolo."
            fillAvailable
            peekSize={compactDeck ? 24 : 38}
            onOpen={openWorkCard}
            onAskRolo={askRoloAboutWork}
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
  return value === 'all' || value === 'open' || value === 'care' || value === 'completed'
}

function emptyDeckTitle(filter: WorkFilter, query: string): string {
  if (query.trim()) return 'No work matches that search'
  if (filter === 'open') return 'Nothing is open right now'
  if (filter === 'completed') return 'No finished work here yet'
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
