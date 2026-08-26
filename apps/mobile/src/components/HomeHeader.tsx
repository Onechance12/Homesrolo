import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { Brand, Eyebrow } from './ui.tsx'
import { colors, space } from '../theme.ts'

export function HomeHeader({ section, title, detail }: {
  readonly section: string
  readonly title: string
  readonly detail?: string
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Brand compact />
        <Pressable onPress={() => router.replace('/homes')} accessibilityLabel="Switch homes" style={styles.switcher}>
          <Ionicons name="swap-horizontal" size={18} color={colors.slate} />
          <Text style={styles.switchText}>Homes</Text>
        </Pressable>
      </View>
      <View style={styles.copy}>
        <Eyebrow>{section}</Eyebrow>
        <Text style={styles.title}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switcher: {
    minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7,
    borderRadius: 20, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 13,
  },
  switchText: { color: colors.slate, fontWeight: '800', fontSize: 12 },
  copy: { gap: space.xs },
  title: { color: colors.cream, fontSize: 28, lineHeight: 32, fontWeight: '900', letterSpacing: -0.8 },
  detail: { color: colors.slate, fontSize: 14, lineHeight: 20 },
})
