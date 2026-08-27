import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import type { WorkCategory, WorkRecord } from '../api/model.ts'
import { categoryLabel, colors, kindLabel, space, statusLabel } from '../theme.ts'
import { Card, Tag } from './ui.tsx'

const categoryIcon: Readonly<Record<WorkCategory, keyof typeof Ionicons.glyphMap>> = {
  roofing: 'home-outline',
  exterior: 'layers-outline',
  interior: 'color-palette-outline',
  electrical: 'flash-outline',
  plumbing: 'water-outline',
  hvac: 'thermometer-outline',
  landscaping: 'leaf-outline',
  appliances: 'cube-outline',
  pest: 'bug-outline',
  pool: 'water-outline',
  new_construction: 'business-outline',
  other: 'ellipsis-horizontal',
}

const months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const [, year, monthNumber, dayNumber] = match
  if (!year || !monthNumber || !dayNumber) return value
  const month = months[Number(monthNumber) - 1]
  const day = Number(dayNumber)
  return month && day > 0 ? `${month} ${day}, ${year}` : value
}

export function WorkCard({ work, compact = false }: {
  readonly work: WorkRecord
  readonly compact?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${kindLabel[work.workKind]}: ${work.title}`}
      accessibilityHint="Shows details, editing, and notes for this work record"
      onPress={() => router.push({
        pathname: '/home/[homeId]/work/[projectRef]',
        params: { homeId: work.homeRef, projectRef: work.projectRef },
      })}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      <Card style={styles.card}>
        <View style={styles.top}>
          <View style={styles.category}>
            <View style={styles.categoryMark}>
              <Ionicons name={categoryIcon[work.category]} size={18} color={colors.aqua} />
            </View>
            <Text style={styles.meta}>{categoryLabel[work.category]} · {kindLabel[work.workKind]}</Text>
          </View>
          <Tag tone={work.status === 'completed' ? 'mint' : work.status === 'in_progress' ? 'lime' : 'plain'}>
            {statusLabel[work.status]}
          </Tag>
        </View>
        <Text style={styles.title} numberOfLines={2}>{work.title}</Text>
        {!compact && work.summary ? <Text style={styles.summary} numberOfLines={2}>{work.summary}</Text> : null}
        <View style={styles.footer}>
          <Text style={styles.footerText} numberOfLines={1}>
            {[
              work.occurredOn ? displayDate(work.occurredOn) : null,
              work.professionalLabel,
            ].filter(Boolean).join(' · ') || (work.status === 'completed' ? 'Saved to this home' : 'Open work')}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.smoke} />
        </View>
      </Card>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressable: { width: '100%' },
  pressed: { opacity: 0.86, transform: [{ scale: 0.992 }] },
  card: { gap: 9 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  category: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryMark: {
    width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.inkSoft,
  },
  meta: { color: colors.aqua, flexShrink: 1, fontSize: 12, fontWeight: '700' },
  title: { color: colors.cream, fontSize: 18, lineHeight: 23, fontWeight: '800' },
  summary: { color: colors.slate, fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerText: { color: colors.slate, flex: 1, fontSize: 12, lineHeight: 17 },
})
