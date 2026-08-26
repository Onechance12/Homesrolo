import { StyleSheet, Text, View } from 'react-native'
import type { WorkRecord } from '../api/model.ts'
import { categoryLabel, colors, kindLabel, space, statusLabel } from '../theme.ts'
import { Card, Tag } from './ui.tsx'

export function WorkCard({ work, compact = false }: {
  readonly work: WorkRecord
  readonly compact?: boolean
}) {
  return (
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
  )
}

const styles = StyleSheet.create({
  compact: { minHeight: 180 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  status: { color: colors.slate, fontSize: 12, fontWeight: '800' },
  title: { color: colors.cream, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  meta: { color: colors.aqua, fontSize: 13, fontWeight: '800' },
  summary: { color: colors.slate, fontSize: 14, lineHeight: 20 },
  pro: { color: colors.lime, fontSize: 13, fontWeight: '800' },
})
