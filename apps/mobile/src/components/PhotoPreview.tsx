import Ionicons from '@expo/vector-icons/Ionicons'
import {
  Modal,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, space } from '../theme.ts'
import type { ProtectedImageSource } from '../api/image-source.ts'
import type { ArtifactGeoPin } from '../api/model.ts'
import { ProtectedImage } from './ProtectedImage.tsx'

export function PhotoPreview({ onClose, source, title, detail, geoPin, actionLabel, actionIcon = 'create-outline', onAction }: {
  readonly onClose: () => void
  readonly source: ProtectedImageSource
  readonly title: string
  readonly detail?: string
  readonly geoPin?: ArtifactGeoPin | null
  readonly actionLabel?: string
  readonly actionIcon?: keyof typeof Ionicons.glyphMap
  readonly onAction?: () => void
}) {
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.toolbar}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
            {detail ? <Text style={styles.detail} numberOfLines={2}>{detail}</Text> : null}
            {geoPin ? (
              <Text style={styles.coordinates} numberOfLines={1}>
                {geoPin.latitude.toFixed(5)}, {geoPin.longitude.toFixed(5)} · ±{Math.round(geoPin.accuracyMeters)} m
              </Text>
            ) : null}
          </View>
          {geoPin ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open photo pin in Maps"
              onPress={() => void Linking.openURL(mapUrl(geoPin))}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <Ionicons name="map-outline" size={18} color={colors.aqua} />
              <Text style={styles.mapText}>Map</Text>
            </Pressable>
          ) : null}
          {actionLabel && onAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              onPress={onAction}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <Ionicons name={actionIcon} size={18} color={colors.lime} />
              <Text style={styles.actionText}>{actionLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            hitSlop={10}
            onPress={onClose}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={26} color={colors.cream} />
          </Pressable>
        </View>
        <ProtectedImage source={source} style={styles.image} resizeMode="contain" accessibilityLabel={title} />
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#020b10' },
  toolbar: {
    minHeight: 64,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  titleWrap: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.cream, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  detail: { color: colors.slate, fontSize: 10, lineHeight: 14 },
  coordinates: { color: colors.aqua, fontSize: 9, lineHeight: 13, fontWeight: '700' },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8 },
  actionText: { color: colors.lime, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  mapText: { color: colors.aqua, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inkRaised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  image: { flex: 1, width: '100%' },
  pressed: { opacity: 0.72 },
})

function mapUrl(pin: ArtifactGeoPin): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pin.latitude},${pin.longitude}`)}`
}
