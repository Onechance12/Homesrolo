import { Ionicons } from '@expo/vector-icons'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, space } from '../theme.ts'
import type { ProtectedImageSource } from '../api/image-source.ts'
import { ProtectedImage } from './ProtectedImage.tsx'

export function PhotoPreview({ onClose, source, title }: {
  readonly onClose: () => void
  readonly source: ProtectedImageSource
  readonly title: string
}) {
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.toolbar}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
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
  title: { flex: 1, color: colors.cream, fontSize: 15, lineHeight: 20, fontWeight: '800' },
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
