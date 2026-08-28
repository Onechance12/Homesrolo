import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open account"
          accessibilityHint="Switch homes or workspaces and manage your account"
          onPress={() => router.push('/account')}
          style={styles.switcher}
        >
          <Ionicons name="person-outline" size={18} color={colors.slate} />
        </Pressable>
      </View>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { color: colors.lime, fontSize: 12, fontWeight: '700' },
  switcher: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 22, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 11,
  },
  title: { color: colors.cream, fontSize: 26, lineHeight: 31, fontWeight: '800', letterSpacing: -0.65 },
  detail: { color: colors.slate, fontSize: 13, lineHeight: 18 },
})
