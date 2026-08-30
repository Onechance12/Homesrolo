import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  type TextInputProps,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
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
      <Image
        accessibilityIgnoresInvertColors
        source={require('../../assets/icon-512.png')}
        style={[styles.brandMark, compact && styles.brandMarkCompact]}
      />
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
  return <Text accessibilityRole="header" style={[styles.title, small && styles.titleSmall]}>{children}</Text>
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
      <Text accessibilityRole="header" style={styles.sectionHeading}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  )
}

export function Button({ label, onPress, disabled = false, quiet = false, icon, accessibilityHint }: {
  readonly label: string
  readonly onPress: () => void
  readonly disabled?: boolean
  readonly quiet?: boolean
  readonly icon?: keyof typeof Ionicons.glyphMap
  readonly accessibilityHint?: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
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

export function Chip({ label, selected, onPress, accessibilityHint, disabled = false }: {
  readonly label: string
  readonly selected: boolean
  readonly onPress: () => void
  readonly accessibilityHint?: string
  readonly disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
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

function LaunchDeck({ lift }: { readonly lift?: Animated.Value }) {
  const frontMotion = lift
    ? {
        transform: [{
          translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }),
        }],
      }
    : undefined

  return (
    <View style={styles.loadingDeck}>
      <View style={[styles.loadingCard, styles.loadingCardBack]} />
      <View style={[styles.loadingCard, styles.loadingCardMiddle]} />
      <Animated.View style={[styles.loadingCard, styles.loadingCardFront, frontMotion]}>
        <View style={styles.loadingCardHeading}>
          <Image
            accessibilityIgnoresInvertColors
            source={require('../../assets/icon-512.png')}
            style={styles.loadingMark}
          />
          <View style={styles.loadingCardTitleGroup}>
            <Text style={styles.loadingEyebrow}>MY ROLO</Text>
            <Text style={styles.loadingCardTitle}>Your home, in order.</Text>
          </View>
        </View>
        <View style={styles.loadingMemoryList}>
          <View style={styles.loadingMemoryRow}>
            <View style={[styles.loadingMemoryDot, styles.loadingMemoryDotLime]} />
            <View style={[styles.loadingMemoryLine, styles.loadingMemoryLineLong]} />
          </View>
          <View style={styles.loadingMemoryRow}>
            <View style={[styles.loadingMemoryDot, styles.loadingMemoryDotAqua]} />
            <View style={[styles.loadingMemoryLine, styles.loadingMemoryLineMedium]} />
          </View>
          <View style={styles.loadingMemoryRow}>
            <View style={[styles.loadingMemoryDot, styles.loadingMemoryDotMint]} />
            <View style={[styles.loadingMemoryLine, styles.loadingMemoryLineShort]} />
          </View>
        </View>
        <View style={[styles.loadingFileTab, styles.loadingFileTabTop]} />
        <View style={[styles.loadingFileTab, styles.loadingFileTabMiddle]} />
        <View style={[styles.loadingFileTab, styles.loadingFileTabBottom]} />
      </Animated.View>
    </View>
  )
}

export function LaunchLoading({ label = 'Opening your home…' }: { readonly label?: string }) {
  // Start still until the operating-system preference is known. This avoids a
  // flash of motion for people who have Reduce Motion enabled.
  const [reduceMotion, setReduceMotion] = useState(true)
  const window = useWindowDimensions()
  const cardLift = useRef(new Animated.Value(0)).current
  const progressTravel = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (mounted) setReduceMotion(enabled)
      })
      .catch(() => {
        // Keep the motion-free default when the host cannot report a
        // preference. Launching the app should never create an unhandled
        // platform promise just to decorate the opening screen.
        if (mounted) setReduceMotion(true)
      })
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)

    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      cardLift.stopAnimation()
      progressTravel.stopAnimation()
      cardLift.setValue(0)
      progressTravel.setValue(0.55)
      return
    }

    const cardLoop = Animated.loop(Animated.sequence([
      Animated.timing(cardLift, {
        toValue: 1,
        duration: 950,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(cardLift, {
        toValue: 0,
        duration: 950,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]))
    const progressLoop = Animated.loop(Animated.timing(progressTravel, {
      toValue: 1,
      duration: 1_500,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }))

    cardLoop.start()
    progressLoop.start()
    return () => {
      cardLoop.stop()
      progressLoop.stop()
    }
  }, [cardLift, progressTravel, reduceMotion])

  return (
    <SafeAreaView
      style={[styles.loadingSafe, { minHeight: Math.max(420, window.height) }]}
      edges={['top', 'right', 'bottom', 'left']}
    >
      <View
        accessible
        accessibilityLiveRegion="polite"
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        style={styles.loadingStage}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.loadingLockup}
        >
          <LaunchDeck lift={cardLift} />
          <Text style={styles.loadingBrand}>homesrolo</Text>
          <Text style={styles.loadingText}>{label}</Text>
          <View style={styles.loadingProgressTrack}>
            <Animated.View
              style={[
                styles.loadingProgressGlide,
                {
                  opacity: reduceMotion ? 0.8 : 1,
                  transform: [{
                    translateX: progressTravel.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-44, 164],
                    }),
                  }],
                },
              ]}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}

export function Loading({ label = 'Opening your home…' }: { readonly label?: string }) {
  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={styles.inlineLoading}
    >
      <Image
        accessibilityIgnoresInvertColors
        source={require('../../assets/icon-512.png')}
        style={styles.inlineLoadingMark}
      />
      <View style={styles.inlineLoadingCopy}>
        <Text style={styles.inlineLoadingText}>{label}</Text>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.inlineLoadingRail}
        >
          <View style={[styles.inlineLoadingSegment, styles.inlineLoadingSegmentLime]} />
          <View style={[styles.inlineLoadingSegment, styles.inlineLoadingSegmentAqua]} />
          <View style={[styles.inlineLoadingSegment, styles.inlineLoadingSegmentMint]} />
        </View>
      </View>
    </View>
  )
}

export function LaunchError({ message, onRetry, retryLabel = 'Try again' }: {
  readonly message: string
  readonly onRetry: () => void
  readonly retryLabel?: string
}) {
  const window = useWindowDimensions()
  return (
    <SafeAreaView
      style={[styles.loadingSafe, { minHeight: Math.max(420, window.height) }]}
      edges={['top', 'right', 'bottom', 'left']}
    >
      <View style={styles.loadingStage}>
        <View style={styles.loadingLockup}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.launchErrorArtwork}
          >
            <LaunchDeck />
          </View>
          <Text style={styles.loadingBrand}>homesrolo</Text>
          <Text accessibilityRole="header" style={styles.launchErrorTitle}>We couldn’t open the door.</Text>
          <Text accessibilityLiveRegion="polite" style={styles.launchErrorMessage}>{message}</Text>
          <View style={styles.launchErrorAction}>
            <Button
              accessibilityHint="Attempts to open Homesrolo again"
              icon="refresh-outline"
              label={retryLabel}
              onPress={onRetry}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
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
  brandMark: { width: 44, height: 44, borderRadius: 12 },
  brandMarkCompact: { width: 32, height: 32, borderRadius: 9 },
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
    minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.inkRaised,
    justifyContent: 'center',
  },
  chipSelected: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  chipDisabled: { opacity: 0.45 },
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
  loadingSafe: { flex: 1, backgroundColor: colors.ink },
  loadingStage: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  loadingLockup: { width: '100%', maxWidth: 310, alignItems: 'center' },
  loadingDeck: { width: 250, height: 177, marginBottom: 18 },
  loadingCard: {
    position: 'absolute',
    width: 224,
    height: 152,
    borderWidth: 1,
    borderRadius: 24,
  },
  loadingCardBack: {
    top: 18,
    left: 0,
    backgroundColor: '#0a222e',
    borderColor: '#163d4d',
    transform: [{ rotate: '-3deg' }],
  },
  loadingCardMiddle: {
    top: 10,
    left: 12,
    backgroundColor: colors.inkSoft,
    borderColor: colors.line,
    transform: [{ rotate: '1.75deg' }],
  },
  loadingCardFront: {
    top: 0,
    left: 7,
    padding: 17,
    backgroundColor: colors.inkRaised,
    borderColor: '#397086',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 9,
  },
  loadingCardHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loadingMark: { width: 43, height: 43, borderRadius: 13 },
  loadingCardTitleGroup: { flex: 1, gap: 3 },
  loadingEyebrow: { color: colors.lime, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  loadingCardTitle: { color: colors.cream, fontSize: 15, fontWeight: '800', letterSpacing: -0.25 },
  loadingMemoryList: { gap: 9, marginTop: 17 },
  loadingMemoryRow: { height: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingMemoryDot: { width: 7, height: 7, borderRadius: 4 },
  loadingMemoryDotLime: { backgroundColor: colors.lime },
  loadingMemoryDotAqua: { backgroundColor: colors.aqua },
  loadingMemoryDotMint: { backgroundColor: colors.mint },
  loadingMemoryLine: { height: 5, borderRadius: radius.pill, backgroundColor: '#315566' },
  loadingMemoryLineLong: { width: 118 },
  loadingMemoryLineMedium: { width: 92 },
  loadingMemoryLineShort: { width: 68 },
  loadingFileTab: {
    position: 'absolute',
    right: -10,
    width: 10,
    height: 27,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 7,
  },
  loadingFileTabTop: { top: 22, backgroundColor: colors.lime },
  loadingFileTabMiddle: { top: 57, backgroundColor: colors.aqua },
  loadingFileTabBottom: { top: 92, backgroundColor: colors.mint },
  loadingBrand: { color: colors.cream, fontSize: 28, fontWeight: '800', letterSpacing: -1.1 },
  loadingText: { color: colors.slate, fontSize: 14, lineHeight: 20, marginTop: 5, textAlign: 'center' },
  loadingProgressTrack: {
    width: 164,
    height: 3,
    marginTop: 17,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: '#183847',
  },
  loadingProgressGlide: { width: 44, height: 3, borderRadius: radius.pill, backgroundColor: colors.lime },
  inlineLoading: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.medium,
    backgroundColor: colors.inkSoft,
  },
  inlineLoadingMark: { width: 36, height: 36, borderRadius: 11 },
  inlineLoadingCopy: { flex: 1, gap: 9 },
  inlineLoadingText: { color: colors.slate, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  inlineLoadingRail: { height: 3, flexDirection: 'row', gap: 4 },
  inlineLoadingSegment: { height: 3, borderRadius: radius.pill },
  inlineLoadingSegmentLime: { width: '42%', backgroundColor: colors.lime },
  inlineLoadingSegmentAqua: { width: '25%', backgroundColor: colors.aqua },
  inlineLoadingSegmentMint: { width: '14%', backgroundColor: colors.mint },
  launchErrorArtwork: { height: 177 },
  launchErrorTitle: {
    color: colors.cream,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '800',
    letterSpacing: -0.55,
    marginTop: 8,
    textAlign: 'center',
  },
  launchErrorMessage: {
    maxWidth: 290,
    color: colors.slate,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
    textAlign: 'center',
  },
  launchErrorAction: { width: '100%', maxWidth: 250, marginTop: 18 },
  noticeRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noticeText: { color: colors.slate, flex: 1, lineHeight: 21 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 4 },
})
