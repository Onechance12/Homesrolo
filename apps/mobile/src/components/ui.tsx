import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, space } from '../theme.ts'

export function Page({ children, padded = true }: {
  readonly children: ReactNode
  readonly padded?: boolean
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.safe}
        contentContainerStyle={[styles.page, !padded && styles.noPadding]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

export function Brand({ compact = false }: { readonly compact?: boolean }) {
  return (
    <View style={styles.brand}>
      <View style={[styles.brandMark, compact && styles.brandMarkCompact]}>
        <Ionicons name="home-outline" size={compact ? 18 : 24} color={colors.lime} />
      </View>
      <Text style={[styles.brandText, compact && styles.brandTextCompact]}>homesrolo</Text>
    </View>
  )
}

export function Eyebrow({ children }: { readonly children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>
}

export function Title({ children, small = false }: {
  readonly children: ReactNode
  readonly small?: boolean
}) {
  return <Text style={[styles.title, small && styles.titleSmall]}>{children}</Text>
}

export function Body({ children, muted = false }: {
  readonly children: ReactNode
  readonly muted?: boolean
}) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>
}

export function Card({ children, accent = false, style }: {
  readonly children: ReactNode
  readonly accent?: boolean
  readonly style?: StyleProp<ViewStyle>
}) {
  return <View style={[styles.card, accent && styles.cardAccent, style]}>{children}</View>
}

export function SectionTitle({ title, detail }: {
  readonly title: string
  readonly detail?: string
}) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionHeading}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  )
}

export function Button({ label, onPress, disabled = false, quiet = false, icon }: {
  readonly label: string
  readonly onPress: () => void
  readonly disabled?: boolean
  readonly quiet?: boolean
  readonly icon?: keyof typeof Ionicons.glyphMap
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        quiet && styles.buttonQuiet,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      {icon ? <Ionicons name={icon} size={19} color={quiet ? colors.cream : colors.ink} /> : null}
      <Text style={[styles.buttonText, quiet && styles.buttonTextQuiet]}>{label}</Text>
    </Pressable>
  )
}

export function TextField({ label, hint, ...props }: TextInputProps & {
  readonly label: string
  readonly hint?: string
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        placeholderTextColor={colors.smoke}
        selectionColor={colors.lime}
        style={[styles.field, props.multiline && styles.fieldMultiline, props.style]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  )
}

export function Chip({ label, selected, onPress }: {
  readonly label: string
  readonly selected: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  )
}

export function Tag({ children, tone = 'plain' }: {
  readonly children: ReactNode
  readonly tone?: 'plain' | 'lime' | 'aqua' | 'mint' | 'warning'
}) {
  return (
    <View style={[styles.tag, styles[`tag_${tone}`]]}>
      <Text style={styles.tagText}>{children}</Text>
    </View>
  )
}

export function Metric({ value, label }: { readonly value: string | number; readonly label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

export function Loading({ label = 'Opening your home…' }: { readonly label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.lime} size="large" />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  )
}

export function Notice({ message, actionLabel, onAction }: {
  readonly message: string
  readonly actionLabel?: string
  readonly onAction?: () => void
}) {
  return (
    <Card>
      <View style={styles.noticeRow}>
        <Ionicons name="information-circle-outline" size={22} color={colors.aqua} />
        <Text style={styles.noticeText}>{message}</Text>
      </View>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} quiet /> : null}
    </Card>
  )
}

export function Divider() { return <View style={styles.divider} /> }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ink },
  page: { padding: space.lg, paddingBottom: 120, gap: space.md },
  noPadding: { paddingHorizontal: 0 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.lime,
    alignItems: 'center', justifyContent: 'center',
  },
  brandMarkCompact: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5 },
  brandText: { color: colors.cream, fontSize: 28, fontWeight: '800', letterSpacing: -1.1 },
  brandTextCompact: { fontSize: 21 },
  eyebrow: { color: colors.lime, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { color: colors.cream, fontSize: 36, lineHeight: 41, fontWeight: '800', letterSpacing: -1.3 },
  titleSmall: { fontSize: 28, lineHeight: 32, letterSpacing: -0.8 },
  body: { color: colors.cream, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.slate },
  card: {
    backgroundColor: colors.inkRaised, borderColor: colors.line, borderWidth: 1,
    borderRadius: radius.large, padding: space.md, gap: space.sm,
  },
  cardAccent: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  sectionTitle: { gap: 4, marginTop: space.sm },
  sectionHeading: { color: colors.cream, fontSize: 20, fontWeight: '800', letterSpacing: -0.35 },
  sectionDetail: { color: colors.slate, fontSize: 14, lineHeight: 20 },
  button: {
    minHeight: 50, paddingHorizontal: 16, borderRadius: radius.medium,
    backgroundColor: colors.lime, flexDirection: 'row', gap: 9,
    justifyContent: 'center', alignItems: 'center',
  },
  buttonQuiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  buttonText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  buttonTextQuiet: { color: colors.cream },
  fieldWrap: { gap: 7 },
  fieldLabel: { color: colors.slate, fontSize: 13, fontWeight: '700' },
  field: {
    minHeight: 52, borderRadius: radius.medium, paddingHorizontal: 15,
    backgroundColor: colors.inkSoft, borderWidth: 1, borderColor: colors.line,
    color: colors.cream, fontSize: 16,
  },
  fieldMultiline: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
  fieldHint: { color: colors.smoke, fontSize: 12, lineHeight: 17 },
  chip: {
    borderRadius: radius.pill, borderColor: colors.line, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.inkRaised,
  },
  chipSelected: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  chipText: { color: colors.slate, fontSize: 13, fontWeight: '700' },
  chipTextSelected: { color: colors.lime },
  tag: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  tag_plain: { backgroundColor: colors.inkSoft },
  tag_lime: { backgroundColor: colors.limeSoft },
  tag_aqua: { backgroundColor: '#123945' },
  tag_mint: { backgroundColor: '#153c32' },
  tag_warning: { backgroundColor: '#41351b' },
  tagText: { color: colors.cream, fontSize: 10, fontWeight: '700', letterSpacing: 0.45, textTransform: 'uppercase' },
  metric: { flex: 1, minWidth: 80, gap: 2 },
  metricValue: { color: colors.lime, fontSize: 27, fontWeight: '800' },
  metricLabel: { color: colors.slate, fontSize: 12, fontWeight: '700' },
  center: { minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.ink },
  loadingText: { color: colors.slate, fontSize: 15 },
  noticeRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noticeText: { color: colors.slate, flex: 1, lineHeight: 21 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 4 },
})
