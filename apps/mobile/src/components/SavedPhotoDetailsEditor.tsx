import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { ResolvedArtifactRecord, WorkRecord } from '../api/model.ts'
import {
  PHOTO_PHASE_LABEL,
  PHOTO_PHASE_OPTIONS,
  type PhotoMetadataDraft,
} from '../home/photo-metadata.ts'
import { colors, radius, space } from '../theme.ts'
import { Button, Card, Chip, TextField } from './ui.tsx'

const PROJECT_CHOICE_LIMIT = 8

export function SavedPhotoDetailsEditor({
  artifact,
  work,
  projectRef,
  draft,
  busy,
  removeGeoPin,
  onProjectChange,
  onChange,
  onRemoveGeoPinChange,
  onCancel,
  onSave,
}: {
  readonly artifact: ResolvedArtifactRecord
  readonly work: readonly WorkRecord[]
  readonly projectRef: string | 'whole_home'
  readonly draft: PhotoMetadataDraft
  readonly busy: boolean
  readonly removeGeoPin: boolean
  readonly onProjectChange: (projectRef: string | 'whole_home') => void
  readonly onChange: (draft: PhotoMetadataDraft) => void
  readonly onRemoveGeoPinChange: (removeGeoPin: boolean) => void
  readonly onCancel: () => void
  readonly onSave: () => void
}) {
  const [projectSearch, setProjectSearch] = useState('')

  useEffect(() => {
    setProjectSearch('')
  }, [artifact.artifactRef])

  const { projectChoices, selectedProjectMissing } = useMemo(() => {
    const selectedProject = projectRef === 'whole_home'
      ? null
      : work.find(item => item.projectRef === projectRef) ?? null
    const needle = projectSearch.trim().toLocaleLowerCase('en-US')
    const recentMatches = [...work]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .filter(item => item.projectRef !== selectedProject?.projectRef)
      .filter(item => !needle || [
        item.title,
        item.category,
        item.workKind,
        item.professionalLabel ?? '',
      ].join(' ').toLocaleLowerCase('en-US').includes(needle))
    const reserveSelectedSlot = projectRef === 'whole_home' ? 0 : 1
    const choices = recentMatches.slice(0, PROJECT_CHOICE_LIMIT - reserveSelectedSlot)
    return {
      projectChoices: selectedProject ? [selectedProject, ...choices] : choices,
      selectedProjectMissing: projectRef !== 'whole_home' && selectedProject === null,
    }
  }, [projectRef, projectSearch, work])

  return (
    <Card accent>
      <View style={styles.titleRow}>
        <View style={styles.icon}><Ionicons name="image-outline" size={20} color={colors.lime} /></View>
        <View style={styles.titleCopy}>
          <Text style={styles.eyebrow}>Photo details</Text>
          <Text style={styles.title} numberOfLines={2}>{artifact.displayName}</Text>
        </View>
      </View>
      <View style={styles.projectChooser}>
        <Text style={styles.label}>File with</Text>
        <TextField
          label="Find work"
          value={projectSearch}
          onChangeText={setProjectSearch}
          placeholder="Search projects and maintenance…"
          maxLength={120}
          editable={!busy}
          hint="Showing up to 8 recent matches; the current selection always stays available."
        />
        <ScrollView
          horizontal
          scrollEnabled={!busy}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label="Whole home"
            selected={projectRef === 'whole_home'}
            disabled={busy}
            onPress={() => onProjectChange('whole_home')}
          />
          {selectedProjectMissing ? (
            <Chip
              label="Current work"
              selected
              disabled={busy}
              accessibilityHint="Keeps this photo filed with its currently selected work record"
              onPress={() => onProjectChange(projectRef)}
            />
          ) : null}
          {projectChoices.map(item => (
            <Chip
              key={item.projectRef}
              label={item.title}
              selected={projectRef === item.projectRef}
              disabled={busy}
              onPress={() => onProjectChange(item.projectRef)}
            />
          ))}
        </ScrollView>
        {projectChoices.length === 0 && !selectedProjectMissing && projectSearch.trim() ? (
          <Text style={styles.empty}>No matching work records. Clear the search or keep this with the whole home.</Text>
        ) : null}
      </View>
      <TextField
        label="Date observed"
        value={draft.observedOn}
        onChangeText={observedOn => onChange({ ...draft, observedOn })}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        editable={!busy}
        hint="Leave blank if the date is unknown."
      />
      <TextField
        label="Room or area (optional)"
        value={draft.areaLabel}
        onChangeText={areaLabel => onChange({ ...draft, areaLabel })}
        placeholder="Living room, north yard, upstairs AC…"
        maxLength={120}
        editable={!busy}
      />
      <View style={styles.phase}>
        <Text style={styles.label}>Photo stage</Text>
        <View style={styles.phaseChips}>
          {PHOTO_PHASE_OPTIONS.map(phase => (
            <Chip
              key={phase}
              label={PHOTO_PHASE_LABEL[phase]}
              selected={draft.phase === phase}
              disabled={busy}
              onPress={() => onChange({ ...draft, phase })}
            />
          ))}
        </View>
      </View>
      {artifact.geoPin ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: removeGeoPin, disabled: busy }}
          accessibilityLabel="Remove saved location when I save"
          accessibilityHint="Removes only this photo's private device-confirmed location pin"
          disabled={busy}
          onPress={() => onRemoveGeoPinChange(!removeGeoPin)}
          style={({ pressed }) => [styles.removePin, pressed && !busy && styles.pressed]}
        >
          <Ionicons
            name={removeGeoPin ? 'checkbox' : 'square-outline'}
            size={22}
            color={removeGeoPin ? colors.lime : colors.slate}
          />
          <View style={styles.removePinCopy}>
            <Text style={styles.removePinTitle}>Remove saved location when I save</Text>
            <Text style={styles.removePinDetail}>{removeGeoPin
              ? 'This photo’s private location pin will be removed when you save.'
              : 'Its private device-confirmed pin stays unless you choose to remove it.'}</Text>
          </View>
        </Pressable>
      ) : null}
      <Button label={busy ? 'Saving details…' : 'Save details'} disabled={busy} onPress={onSave} />
      <Button label="Cancel" quiet disabled={busy} onPress={onCancel} />
    </Card>
  )
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.inkSoft, borderWidth: 1, borderColor: colors.line },
  titleCopy: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { color: colors.lime, fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: colors.cream, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  label: { color: colors.slate, fontSize: 13, lineHeight: 17, fontWeight: '700' },
  projectChooser: { gap: 8 },
  chips: { gap: 7, paddingRight: space.md },
  empty: { color: colors.smoke, fontSize: 11, lineHeight: 16 },
  phase: { gap: 7 },
  phaseChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  removePin: {
    minHeight: 56, flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkSoft, padding: 11,
  },
  removePinCopy: { flex: 1, gap: 2 },
  removePinTitle: { color: colors.cream, fontSize: 13, lineHeight: 17, fontWeight: '800' },
  removePinDetail: { color: colors.slate, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.82 },
})
