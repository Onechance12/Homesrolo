import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { ArtifactGeoPin, DeviceFile } from '../api/model.ts'
import {
  PHOTO_PHASE_LABEL,
  PHOTO_PHASE_OPTIONS,
  type PhotoMetadataDraft,
} from '../home/photo-metadata.ts'
import { colors, radius, space } from '../theme.ts'
import { Button, Card, Chip, TextField } from './ui.tsx'

export function PhotoUploadDetails({
  file,
  source,
  contextLabel,
  draft,
  busy,
  locationPin,
  locationBusy,
  locationMessage,
  onChange,
  onRequestLocation,
  onClearLocation,
  onCancel,
  onSave,
}: {
  readonly file: DeviceFile
  readonly source: 'camera' | 'library'
  readonly contextLabel: string
  readonly draft: PhotoMetadataDraft
  readonly busy: boolean
  readonly locationPin: ArtifactGeoPin | null
  readonly locationBusy: boolean
  readonly locationMessage: string | null
  readonly onChange: (draft: PhotoMetadataDraft) => void
  readonly onRequestLocation: () => void
  readonly onClearLocation: () => void
  readonly onCancel: () => void
  readonly onSave: () => void
}) {
  const controlsDisabled = busy || locationBusy

  return (
    <Card accent style={styles.card}>
      <View style={styles.top}>
        <Image source={{ uri: file.uri }} style={styles.preview} resizeMode="cover" accessibilityLabel={file.name} />
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>Organize this photo</Text>
          <Text style={styles.title} numberOfLines={2}>{file.name}</Text>
          <Text style={styles.context} numberOfLines={2}>Filing with {contextLabel}</Text>
        </View>
      </View>
      <View style={styles.fields}>
        <TextField
          label="Date observed"
          value={draft.observedOn}
          onChangeText={observedOn => onChange({ ...draft, observedOn })}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          hint="Today is filled in for you. Change it if this is an older photo."
          editable={!controlsDisabled}
        />
        <TextField
          label="Room or area (optional)"
          value={draft.areaLabel}
          onChangeText={areaLabel => onChange({ ...draft, areaLabel })}
          placeholder="Living room, north yard, upstairs AC…"
          maxLength={120}
          editable={!controlsDisabled}
        />
        <View style={styles.phaseWrap}>
          <Text style={styles.label}>Photo stage</Text>
          <View style={styles.chips}>
            {PHOTO_PHASE_OPTIONS.map(phase => (
              <Chip
                key={phase}
                label={PHOTO_PHASE_LABEL[phase]}
                selected={draft.phase === phase}
                disabled={controlsDisabled}
                accessibilityHint={`Marks this photo as ${PHOTO_PHASE_LABEL[phase].toLowerCase()}`}
                onPress={() => onChange({ ...draft, phase })}
              />
            ))}
          </View>
        </View>
        {source === 'camera' ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: Boolean(locationPin), disabled: busy || locationBusy }}
            accessibilityLabel="Pin my current location"
            accessibilityHint={locationPin ? 'Removes the pending location pin' : 'Reads foreground location once and shows it before the photo is saved'}
            disabled={busy || locationBusy}
            onPress={locationPin ? onClearLocation : onRequestLocation}
            style={({ pressed }) => [styles.locationRow, pressed && styles.pressed]}
          >
            <Ionicons
              name={locationPin ? 'checkbox' : 'square-outline'}
              size={22}
              color={locationPin ? colors.lime : colors.slate}
            />
            <View style={styles.locationCopy}>
              <Text style={styles.locationTitle}>{locationBusy ? 'Reading current location…' : locationPin ? 'Current location ready — tap to remove' : 'Pin my current location'}</Text>
              <Text style={styles.locationDetail}>{locationPin
                ? `${locationPin.latitude.toFixed(4)}, ${locationPin.longitude.toFixed(4)} · accuracy about ±${Math.round(locationPin.accuracyMeters)} m. Saving confirms this private pin.`
                : 'Reads your current location once and shows it here. No background tracking and no photo EXIF reading.'}</Text>
              {locationMessage ? <Text style={styles.locationMessage}>{locationMessage}</Text> : null}
            </View>
          </Pressable>
        ) : (
          <Text style={styles.libraryNote}>A library photo is not pinned to your current location because it may have been taken somewhere else.</Text>
        )}
      </View>
      <Button
        label={busy ? (draft.pinCurrentLocation ? 'Pinning & saving…' : 'Saving photo…') : 'Save photo'}
        icon="checkmark"
        disabled={busy || locationBusy || (draft.pinCurrentLocation && !locationPin)}
        accessibilityHint="Saves this private photo and its organization details"
        onPress={onSave}
      />
      <Button label="Cancel" quiet disabled={controlsDisabled} onPress={onCancel} />
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { width: 72, height: 72, borderRadius: radius.medium, backgroundColor: colors.inkSoft },
  heading: { flex: 1, minWidth: 0, gap: 3 },
  eyebrow: { color: colors.lime, fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: colors.cream, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  context: { color: colors.slate, fontSize: 11, lineHeight: 15 },
  fields: { gap: 12 },
  phaseWrap: { gap: 7 },
  label: { color: colors.slate, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  locationRow: { minHeight: 56, flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkSoft, padding: 11 },
  locationCopy: { flex: 1, gap: 2 },
  locationTitle: { color: colors.cream, fontSize: 13, lineHeight: 17, fontWeight: '800' },
  locationDetail: { color: colors.slate, fontSize: 11, lineHeight: 16 },
  locationMessage: { color: colors.aqua, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  libraryNote: { color: colors.smoke, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.82 },
})
