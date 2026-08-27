import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { ArtifactContent, ArtifactKind } from '../api/model.ts'
import { friendlyError } from '../api/errors.ts'
import { openArtifactContent } from '../native/artifact-opener.ts'
import { colors, radius, space } from '../theme.ts'

export function ArtifactFileCard({
  title,
  detail,
  kind = 'document',
  load,
}: {
  readonly title: string
  readonly detail: string
  readonly kind?: ArtifactKind
  readonly load: () => Promise<ArtifactContent>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await openArtifactContent(await load())
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${busy ? 'Opening' : 'Open'} ${title}`}
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={() => void open()}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.icon}>
          <Ionicons
            name={kind === 'warranty' ? 'shield-checkmark-outline' : 'document-text-outline'}
            size={23}
            color={colors.aqua}
          />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
        {busy
          ? <ActivityIndicator size="small" color={colors.lime} />
          : <View style={styles.open}><Text style={styles.openText}>Open</Text><Ionicons name="open-outline" size={16} color={colors.lime} /></View>}
      </Pressable>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  card: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.inkRaised,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  icon: { width: 32, alignItems: 'center' },
  copy: { flex: 1, gap: 3 },
  title: { color: colors.cream, fontSize: 14, lineHeight: 19, fontWeight: '800' },
  detail: { color: colors.slate, fontSize: 11, lineHeight: 16, textTransform: 'capitalize' },
  open: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  openText: { color: colors.lime, fontSize: 12, fontWeight: '900' },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17, paddingHorizontal: 3 },
})
