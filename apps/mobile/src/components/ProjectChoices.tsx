import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { NativeApiError } from '../api/client.ts'
import { friendlyError } from '../api/errors.ts'
import type {
  ProjectItem,
  ProjectItemKind,
  ProjectItemState,
  SaveProjectItemInput,
} from '../api/model.ts'
import {
  PROJECT_ITEM_KINDS,
  PROJECT_ITEM_KIND_LABELS,
  PROJECT_ITEM_STATES,
  PROJECT_ITEM_STATE_LABELS,
  projectItemIntent,
} from '../api/project-item.ts'
import { useSession } from '../auth/SessionProvider.tsx'
import { useResource } from '../hooks/useResource.ts'
import { colors, radius, space } from '../theme.ts'
import { Button, Card, Chip, Notice, SectionTitle, Tag, TextField } from './ui.tsx'

type PendingCommand = { readonly intent: string; readonly commandRef: string }

const INITIAL_VISIBLE_ITEMS = 8

export function ProjectChoices({ homeId, projectRef, readOnly = false }: {
  readonly homeId: string
  readonly projectRef: string
  readonly readOnly?: boolean
}) {
  const { state: auth, api } = useSession()
  const loader = useCallback(
    () => api.listProjectItems(homeId, projectRef),
    [api, homeId, projectRef],
  )
  const resource = useResource(loader, auth.kind === 'signed_in')
  const [localItems, setLocalItems] = useState<readonly ProjectItem[] | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectItem | null>(null)
  const [kind, setKind] = useState<ProjectItemKind>('material')
  const [state, setState] = useState<ProjectItemState>('considering')
  const [label, setLabel] = useState('')
  const [detail, setDetail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ITEMS)
  const pending = useRef<PendingCommand | null>(null)
  const saveLock = useRef(false)

  useEffect(() => {
    pending.current = null
    setLocalItems(null)
    setFormOpen(false)
    setEditing(null)
    setVisibleCount(INITIAL_VISIBLE_ITEMS)
  }, [homeId, projectRef])

  const items = resource.state.kind === 'ready'
    ? (localItems ?? resource.state.value)
    : []
  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount])

  if (auth.kind !== 'signed_in') return null

  function change<Value>(setter: (value: Value) => void, value: Value) {
    pending.current = null
    setError(null)
    setSuccess(null)
    setter(value)
  }

  function resetForm() {
    pending.current = null
    setEditing(null)
    setKind('material')
    setState('considering')
    setLabel('')
    setDetail('')
    setError(null)
  }

  function closeForm() {
    resetForm()
    setFormOpen(false)
  }

  function startNew() {
    if (readOnly) return
    resetForm()
    setSuccess(null)
    setFormOpen(true)
  }

  function startEditing(item: ProjectItem) {
    if (readOnly) return
    pending.current = null
    setEditing(item)
    setKind(item.kind)
    setState(item.state)
    setLabel(item.label)
    setDetail(item.detail)
    setError(null)
    setSuccess(null)
    setFormOpen(true)
  }

  async function save() {
    const cleanLabel = label.trim()
    const cleanDetail = detail.trim()
    if (readOnly || saveLock.current || !cleanLabel) return
    const fields: Omit<SaveProjectItemInput, 'commandRef'> = {
      ...(editing ? {
        itemRef: editing.itemRef,
        expectedRevision: editing.revision,
      } : {}),
      kind,
      label: cleanLabel,
      ...(cleanDetail ? { detail: cleanDetail } : {}),
      state,
    }
    const intent = projectItemIntent(projectRef, fields)
    saveLock.current = true
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      if (!pending.current || pending.current.intent !== intent) {
        pending.current = { intent, commandRef: await api.newCommandRef() }
      }
      const saved = await api.saveProjectItem(homeId, projectRef, {
        commandRef: pending.current.commandRef,
        ...fields,
      })
      pending.current = null
      setLocalItems(current => {
        const base = current ?? (resource.state.kind === 'ready' ? resource.state.value : [])
        const index = base.findIndex(item => item.itemRef === saved.itemRef)
        if (index === -1) return [saved, ...base]
        return base.map(item => item.itemRef === saved.itemRef ? saved : item)
      })
      closeForm()
      setSuccess(editing ? 'Choice updated.' : 'Choice saved with this work.')
    } catch (caught) {
      const code = caught instanceof NativeApiError
        ? caught.code
        : caught instanceof Error ? caught.message : 'unavailable'
      if (code === 'conflict') {
        pending.current = null
        setLocalItems(null)
        closeForm()
        resource.reload()
        setError('This choice changed somewhere else. The latest list is loading; tap Edit again to review it.')
      } else {
        setError(friendlyError(caught))
      }
    } finally {
      saveLock.current = false
      setSaving(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <SectionTitle
        title="Plans & picks"
        detail="Keep products, colors, links, and final choices with this work."
      />

      {resource.state.kind === 'loading' ? (
        <Card style={styles.loadingCard}>
          <ActivityIndicator color={colors.lime} />
          <Text style={styles.loadingText}>Opening saved choices…</Text>
        </Card>
      ) : null}
      {resource.state.kind === 'error' ? (
        <Notice
          message="Saved choices could not load."
          actionLabel="Try again"
          onAction={resource.reload}
        />
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}

      {resource.state.kind === 'ready' && !readOnly && !formOpen ? (
        <Button label="Add a product or decision" icon="add" onPress={startNew} />
      ) : null}

      {resource.state.kind === 'ready' && !readOnly && formOpen ? (
        <Card accent>
          <View style={styles.formHeading}>
            <View style={styles.flex}>
              <Text accessibilityRole="header" style={styles.formTitle}>
                {editing ? 'Edit this choice' : 'Add to this plan'}
              </Text>
              <Text style={styles.formDetail}>Save enough detail to recognize it later.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close choice form"
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={closeForm}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={22} color={colors.cream} />
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>What are you saving?</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {PROJECT_ITEM_KINDS.map(value => (
              <Chip
                key={value}
                label={PROJECT_ITEM_KIND_LABELS[value]}
                selected={kind === value}
                accessibilityHint={`Use ${PROJECT_ITEM_KIND_LABELS[value]} for this choice`}
                onPress={() => change(setKind, value)}
              />
            ))}
          </View>

          <Text style={styles.fieldLabel}>Where does it stand?</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {PROJECT_ITEM_STATES.map(value => (
              <Chip
                key={value}
                label={PROJECT_ITEM_STATE_LABELS[value]}
                selected={state === value}
                accessibilityHint={`Mark this choice as ${PROJECT_ITEM_STATE_LABELS[value]}`}
                onPress={() => change(setState, value)}
              />
            ))}
          </View>

          <TextField
            label="Name"
            value={label}
            onChangeText={value => change(setLabel, value)}
            maxLength={160}
            placeholder="Paint color, faucet, shingle, sofa…"
          />
          <TextField
            label="Model, color, link, or note (optional)"
            value={detail}
            onChangeText={value => change(setDetail, value)}
            multiline
            maxLength={2_000}
            placeholder="Add the product link, model number, finish, room, or why you chose it."
          />
          <Button
            label={saving ? 'Saving…' : editing ? 'Update choice' : 'Save choice'}
            icon="checkmark"
            onPress={() => void save()}
            disabled={saving || !label.trim()}
          />
          <Button label="Cancel" onPress={closeForm} disabled={saving} quiet />
        </Card>
      ) : null}

      {resource.state.kind === 'ready' && items.length === 0 && !formOpen ? (
        <Card>
          <Text style={styles.emptyTitle}>Nothing picked yet</Text>
          <Text style={styles.emptyDetail}>{readOnly
            ? 'No products or decisions have been shared with this work yet.'
            : 'Save a product, final decision, or idea you want to revisit.'}</Text>
        </Card>
      ) : null}

      {resource.state.kind === 'ready' && readOnly && items.length > 0 ? (
        <Notice message="You have view-only access to this work. A household member can add or edit its plans and picks." />
      ) : null}

      {visibleItems.map(item => (
        <Card key={item.itemRef} style={item.state === 'declined' && styles.declinedCard}>
          <View style={styles.itemHeading}>
            <Tag tone={item.kind === 'material' ? 'aqua' : item.kind === 'wishlist' ? 'plain' : 'lime'}>
              {PROJECT_ITEM_KIND_LABELS[item.kind]}
            </Tag>
            <Tag tone={stateTone(item.state)}>{PROJECT_ITEM_STATE_LABELS[item.state]}</Tag>
          </View>
          <Text style={styles.itemLabel}>{item.label}</Text>
          {item.detail ? <Text style={styles.itemDetail}>{item.detail}</Text> : null}
          {!readOnly ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${item.label}`}
              onPress={() => startEditing(item)}
              style={({ pressed }) => [styles.edit, pressed && styles.pressed]}
            >
              <Ionicons name="create-outline" size={18} color={colors.aqua} />
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
          ) : null}
        </Card>
      ))}

      {items.length > visibleItems.length ? (
        <Button
          label={`Show ${Math.min(INITIAL_VISIBLE_ITEMS, items.length - visibleItems.length)} more`}
          onPress={() => setVisibleCount(count => count + INITIAL_VISIBLE_ITEMS)}
          quiet
        />
      ) : null}
    </View>
  )
}

function stateTone(state: ProjectItemState): 'plain' | 'lime' | 'mint' | 'warning' {
  if (state === 'chosen') return 'lime'
  if (state === 'purchased') return 'mint'
  if (state === 'declined') return 'warning'
  return 'plain'
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  loadingCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center' },
  loadingText: { color: colors.slate, fontSize: 14, lineHeight: 20 },
  formHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  flex: { flex: 1, gap: 3 },
  formTitle: { color: colors.cream, fontSize: 19, lineHeight: 24, fontWeight: '800' },
  formDetail: { color: colors.slate, fontSize: 13, lineHeight: 18 },
  close: {
    width: 44, height: 44, marginTop: -8, marginRight: -8, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldLabel: { color: colors.slate, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  itemHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  itemLabel: { color: colors.cream, fontSize: 17, lineHeight: 23, fontWeight: '800' },
  itemDetail: { color: colors.slate, fontSize: 14, lineHeight: 20 },
  edit: {
    alignSelf: 'flex-start', minHeight: 44, minWidth: 72, borderRadius: radius.medium,
    paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  editText: { color: colors.aqua, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.62 },
  declinedCard: { opacity: 0.78 },
  emptyTitle: { color: colors.cream, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  emptyDetail: { color: colors.slate, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  success: { color: colors.mint, fontSize: 14, lineHeight: 20, fontWeight: '800' },
})
