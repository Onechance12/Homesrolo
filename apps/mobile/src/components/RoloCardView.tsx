import Ionicons from '@expo/vector-icons/Ionicons'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import type { HomesroloCard } from '../home/rolodex.ts'
import { colors, radius, space } from '../theme.ts'

export type RoloCardVariant = 'compact' | 'full'

export type RoloCardMediaRenderer = (
  card: HomesroloCard,
  variant: RoloCardVariant,
) => ReactNode

export interface RoloCardViewProps {
  readonly card: HomesroloCard
  readonly variant?: RoloCardVariant | undefined
  /**
   * Media deliberately stays outside the serializable card envelope. This lets
   * callers resolve a private `ProtectedImage` without putting credentials or a
   * short-lived signed URL into card data.
   */
  readonly renderMedia?: RoloCardMediaRenderer | undefined
  readonly onOpen?: ((card: HomesroloCard) => void) | undefined
  readonly onAskRolo?: ((card: HomesroloCard) => void) | undefined
  readonly openLabel?: string | undefined
  readonly askRoloLabel?: string | undefined
  readonly reduceMotion?: boolean | undefined
  readonly style?: StyleProp<ViewStyle> | undefined
  readonly testID?: string | undefined
}

const kindIcon: Readonly<Record<HomesroloCard['kind'], keyof typeof Ionicons.glyphMap>> = {
  work: 'construct-outline',
  photo: 'image-outline',
  document: 'document-text-outline',
  warranty: 'shield-checkmark-outline',
  home_watch_photo: 'scan-outline',
  photo_album: 'images-outline',
  navigation: 'compass-outline',
}

const kindTone: Readonly<Record<HomesroloCard['kind'], string>> = {
  work: colors.lime,
  photo: colors.aqua,
  document: colors.slate,
  warranty: colors.mint,
  home_watch_photo: colors.warning,
  photo_album: colors.aqua,
  navigation: colors.lime,
}

export function RoloCardView({
  card,
  variant = 'full',
  renderMedia,
  onOpen,
  onAskRolo,
  openLabel,
  askRoloLabel = 'Ask Rolo',
  reduceMotion,
  style,
  testID,
}: RoloCardViewProps) {
  const systemReduceMotion = useReducedMotionPreference(reduceMotion !== undefined)
  const motionReduced = reduceMotion ?? systemReduceMotion
  const compact = variant === 'compact'
  const media = renderMedia?.(card, variant)
  const tone = kindTone[card.kind]
  const resolvedOpenLabel = openLabel ?? card.actions[0]?.label ?? 'Open card'

  return (
    <View
      testID={testID}
      style={[styles.shell, compact ? styles.shellCompact : styles.shellFull, style]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.fileTab, compact && styles.fileTabCompact, { borderColor: tone }]}
      >
        <Text numberOfLines={1} style={[styles.fileTabText, { color: tone }]}>
          {displayGroup(card.group)}
        </Text>
      </View>

      <View style={[styles.card, compact ? styles.cardCompact : styles.cardFull]}>
        <View style={styles.headingRow}>
          <View style={[styles.kindMark, { borderColor: tone }]}>
            <Ionicons name={kindIcon[card.kind]} size={compact ? 17 : 20} color={tone} />
          </View>
          <View style={styles.headingCopy}>
            <Text numberOfLines={1} style={[styles.eyebrow, { color: tone }]}>{card.eyebrow}</Text>
            <Text
              accessibilityRole="header"
              numberOfLines={compact ? 2 : 3}
              style={[styles.title, compact && styles.titleCompact]}
            >
              {card.title}
            </Text>
          </View>
        </View>

        {compact ? (
          <View style={styles.compactBody}>
            <View style={styles.compactCopy}>
              {card.summary ? <Text numberOfLines={2} style={styles.summary}>{card.summary}</Text> : null}
              <CardMeta values={card.meta} limit={2} />
            </View>
            {media ? <View style={styles.mediaCompact}>{media}</View> : null}
          </View>
        ) : (
          <>
            {card.summary ? <Text numberOfLines={2} style={styles.summaryFull}>{card.summary}</Text> : null}
            {media ? <View style={styles.mediaFull}>{media}</View> : null}
            <CardMeta values={card.meta} limit={3} />
          </>
        )}

        {onOpen || onAskRolo ? (
          <View style={[styles.actionRow, compact && styles.actionRowCompact]}>
            {onAskRolo ? (
              <CardAction
                accessibilityHint={`Starts a conversation about ${card.title}`}
                icon="chatbubble-ellipses-outline"
                label={askRoloLabel}
                motionReduced={motionReduced}
                onPress={() => onAskRolo(card)}
                quiet
              />
            ) : null}
            {onOpen ? (
              <CardAction
                accessibilityHint={`Shows the full record for ${card.title}`}
                icon="arrow-forward"
                label={resolvedOpenLabel}
                motionReduced={motionReduced}
                onPress={() => onOpen(card)}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}

function CardMeta({ values, limit }: { readonly values: readonly string[]; readonly limit: number }) {
  const visible = values.filter(Boolean).slice(0, limit)
  if (visible.length === 0) return null
  return (
    <View style={styles.metaRow} accessibilityLabel={visible.join(', ')}>
      {visible.map((value, index) => (
        <View key={`${value}:${index}`} style={styles.metaChip}>
          <Text numberOfLines={1} style={styles.metaText}>{value}</Text>
        </View>
      ))}
    </View>
  )
}

function CardAction({
  label,
  icon,
  quiet = false,
  motionReduced,
  accessibilityHint,
  onPress,
}: {
  readonly label: string
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly quiet?: boolean
  readonly motionReduced: boolean
  readonly accessibilityHint: string
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        quiet && styles.actionQuiet,
        pressed && styles.actionPressed,
        pressed && !motionReduced && styles.actionPressedMotion,
      ]}
    >
      <Ionicons name={icon} size={17} color={quiet ? colors.cream : colors.ink} />
      <Text numberOfLines={1} style={[styles.actionText, quiet && styles.actionTextQuiet]}>{label}</Text>
    </Pressable>
  )
}

/** A tiny shared hook so deck paging and standalone cards honor the OS setting. */
export function useReducedMotionPreference(skip = false): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (skip) return undefined
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted) setReduced(value)
    })
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [skip])

  return reduced
}

function displayGroup(value: HomesroloCard['group']): string {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

const styles = StyleSheet.create({
  shell: { width: '100%', paddingTop: 26 },
  shellFull: { flex: 1 },
  shellCompact: { minHeight: 188, paddingTop: 22 },
  fileTab: {
    position: 'absolute',
    zIndex: 2,
    elevation: 9,
    top: 0,
    right: 18,
    minWidth: 104,
    maxWidth: '52%',
    height: 34,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inkSoft,
  },
  fileTabCompact: { height: 28, minWidth: 88, paddingHorizontal: 11 },
  fileTabText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  card: {
    zIndex: 1,
    width: '100%',
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.inkRaised,
    ...Platform.select({
      web: { boxShadow: '0 12px 36px rgba(0, 0, 0, 0.24)' },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.24,
        shadowRadius: 18,
        elevation: 8,
      },
    }),
  },
  cardFull: { flex: 1, minHeight: 380, padding: space.lg, gap: space.md },
  cardCompact: { flex: 1, minHeight: 170, padding: space.md, gap: space.sm },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  kindMark: {
    width: 39,
    height: 39,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inkSoft,
  },
  headingCopy: { flex: 1, minWidth: 0, gap: 3 },
  eyebrow: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: { color: colors.cream, fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.55 },
  titleCompact: { fontSize: 18, lineHeight: 22, letterSpacing: -0.25 },
  summary: { color: colors.slate, fontSize: 13, lineHeight: 19 },
  summaryFull: { color: colors.slate, fontSize: 15, lineHeight: 22 },
  compactBody: { flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: space.sm },
  compactCopy: { flex: 1, minWidth: 0, justifyContent: 'space-between', gap: space.sm },
  mediaFull: {
    flexGrow: 1,
    minHeight: 96,
    maxHeight: 220,
    overflow: 'hidden',
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.inkSoft,
  },
  mediaCompact: {
    width: 92,
    minHeight: 76,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.inkSoft,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  metaChip: {
    maxWidth: '100%',
    minHeight: 27,
    paddingHorizontal: 9,
    paddingVertical: 5,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.inkSoft,
  },
  metaText: { color: colors.slate, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 9,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  actionRowCompact: { paddingTop: 8 },
  action: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.lime,
    backgroundColor: colors.lime,
  },
  actionQuiet: { borderColor: colors.line, backgroundColor: colors.inkSoft },
  actionPressed: { opacity: 0.82 },
  actionPressedMotion: { transform: [{ scale: 0.985 }] },
  actionText: { flexShrink: 1, color: colors.ink, fontSize: 13, fontWeight: '900' },
  actionTextQuiet: { color: colors.cream },
})
