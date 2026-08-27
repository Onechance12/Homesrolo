import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { returnToHomeChooser } from '../home/navigation.ts'
import { colors, space } from '../theme.ts'

export function HomeHeader({ section, title, detail }: {
  readonly section: string
  readonly title: string
  readonly detail?: string
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.section}>{section}</Text>
        <Pressable onPress={() => returnToHomeChooser(router)} accessibilityLabel="Switch homes" style={styles.switcher}>
          <Ionicons name="home-outline" size={17} color={colors.slate} />
          <Text style={styles.switchText}>Homes</Text>
          <Ionicons name="chevron-down" size={14} color={colors.smoke} />
        </Pressable>
      </View>
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { color: colors.lime, fontSize: 12, fontWeight: '700' },
  switcher: {
    minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 11,
  },
  switchText: { color: colors.slate, fontWeight: '700', fontSize: 12 },
  title: { color: colors.cream, fontSize: 26, lineHeight: 31, fontWeight: '800', letterSpacing: -0.65 },
  detail: { color: colors.slate, fontSize: 13, lineHeight: 18 },
})
