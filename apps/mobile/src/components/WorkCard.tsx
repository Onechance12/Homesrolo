import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import type { WorkRecord } from '../api/model.ts'
import { categoryLabel, colors, kindLabel, space, statusLabel } from '../theme.ts'
import { Card, Tag } from './ui.tsx'

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
      <Card {...(compact ? { style: styles.compact } : {})}>
        <View style={styles.top}>
          <Tag tone={work.status === 'completed' ? 'mint' : work.status === 'in_progress' ? 'lime' : 'plain'}>
            {kindLabel[work.workKind]}
          </Tag>
          <Text style={styles.status}>{statusLabel[work.status]}</Text>
        </View>
        <Text style={styles.title}>{work.title}</Text>
        <Text style={styles.meta}>
          {categoryLabel[work.category]}{work.occurredOn ? ` · ${work.occurredOn}` : ''}
        </Text>
        {!compact && work.summary ? <Text style={styles.summary}>{work.summary}</Text> : null}
        {work.professionalLabel ? <Text style={styles.pro}>with {work.professionalLabel}</Text> : null}
      </Card>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressable: { width: '100%' },
  pressed: { opacity: 0.86, transform: [{ scale: 0.992 }] },
  compact: { minHeight: 180 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  status: { color: colors.slate, fontSize: 12, fontWeight: '800' },
  title: { color: colors.cream, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  meta: { color: colors.aqua, fontSize: 13, fontWeight: '800' },
  summary: { color: colors.slate, fontSize: 14, lineHeight: 20 },
  pro: { color: colors.lime, fontSize: 13, fontWeight: '800' },
})
