import Ionicons from '@expo/vector-icons/Ionicons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import type { HomesroloCard } from '../home/rolodex.ts'
import { colors, radius, space } from '../theme.ts'
import {
  RoloCardView,
  type RoloCardMediaRenderer,
  type RoloCardVariant,
  useReducedMotionPreference,
} from './RoloCardView.tsx'

export interface RoloDeckDivider {
  readonly id: string
  readonly label: string
  /** Omit to match the card's `group` to this divider's id. */
  readonly includes?: ((card: HomesroloCard) => boolean) | undefined
}

export interface UseRoloDeckSearchOptions {
  readonly dividers?: readonly RoloDeckDivider[] | undefined
  readonly query?: string | undefined
  readonly defaultQuery?: string | undefined
  readonly onQueryChange?: ((query: string) => void) | undefined
  readonly selectedDivider?: string | undefined
  readonly defaultSelectedDivider?: string | undefined
  readonly onSelectedDividerChange?: ((divider: string) => void) | undefined
}

export interface RoloDeckSearchState {
  readonly query: string
  readonly setQuery: (query: string) => void
  readonly selectedDivider: string
  readonly setSelectedDivider: (divider: string) => void
  readonly visibleCards: readonly HomesroloCard[]
}

export interface RoloDeckProps extends UseRoloDeckSearchOptions {
  readonly cards: readonly HomesroloCard[]
  readonly axis?: 'vertical' | 'horizontal' | undefined
  readonly variant?: RoloCardVariant | undefined
  readonly renderMedia?: RoloCardMediaRenderer | undefined
  readonly onOpen?: ((card: HomesroloCard) => void) | undefined
  readonly onAskRolo?: ((card: HomesroloCard) => void) | undefined
  readonly canAskRolo?: ((card: HomesroloCard) => boolean) | undefined
  readonly onActiveCardChange?: ((card: HomesroloCard | null, index: number) => void) | undefined
  readonly searchPlaceholder?: string | undefined
  readonly emptyTitle?: string | undefined
  readonly emptyDetail?: string | undefined
  readonly cardHeight?: number | undefined
  readonly peekSize?: number | undefined
  /** Let a vertical deck turn the remaining screen into one tall, phone-first card. */
  readonly fillAvailable?: boolean | undefined
  readonly reduceMotion?: boolean | undefined
  readonly style?: StyleProp<ViewStyle> | undefined
  readonly testID?: string | undefined
}

const ALL_DIVIDER = 'all'
const CARD_GAP = 12
const COMPACT_CARD_MIN_HEIGHT = 192
const FULL_CARD_MIN_HEIGHT = 406

/**
 * Controlled when `query` / `selectedDivider` are supplied, and stateful when
 * they are omitted. Keeping filtering here lets Work, Photos, and a future chat
 * attachment tray use the same deck without sharing navigation or databases.
 */
export function useRoloDeckSearch(
  cards: readonly HomesroloCard[],
  options: UseRoloDeckSearchOptions = {},
): RoloDeckSearchState {
  const {
    dividers = [],
    query: controlledQuery,
    defaultQuery = '',
    onQueryChange,
    selectedDivider: controlledDivider,
    defaultSelectedDivider = ALL_DIVIDER,
    onSelectedDividerChange,
  } = options
  const [localQuery, setLocalQuery] = useState(defaultQuery)
  const [localDivider, setLocalDivider] = useState(defaultSelectedDivider)
  const query = controlledQuery ?? localQuery
  const selectedDivider = controlledDivider ?? localDivider

  const setQuery = useCallback((next: string) => {
    if (controlledQuery === undefined) setLocalQuery(next)
    onQueryChange?.(next)
  }, [controlledQuery, onQueryChange])

  const setSelectedDivider = useCallback((next: string) => {
    if (controlledDivider === undefined) setLocalDivider(next)
    onSelectedDividerChange?.(next)
  }, [controlledDivider, onSelectedDividerChange])

  const visibleCards = useMemo(() => {
    const needles = searchTokens(query)
    const activeDivider = selectedDivider === ALL_DIVIDER
      ? null
      : dividers.find(item => item.id === selectedDivider) ?? null
    return cards.filter(card => {
      if (activeDivider) {
        const included = activeDivider.includes
          ? activeDivider.includes(card)
          : String(card.group) === activeDivider.id
        if (!included) return false
      }
      const haystack = card.searchText.toLocaleLowerCase('en-US')
      return needles.every(needle => haystack.includes(needle))
    })
  }, [cards, dividers, query, selectedDivider])

  return { query, setQuery, selectedDivider, setSelectedDivider, visibleCards }
}

export function RoloDeck({
  cards,
  axis = 'vertical',
  variant = 'full',
  renderMedia,
  onOpen,
  onAskRolo,
  canAskRolo,
  onActiveCardChange,
  searchPlaceholder = 'Find a project, photo, file, or detail',
  emptyTitle = 'No cards here yet',
  emptyDetail = 'Try another divider or tell Rolo what this home should remember.',
  cardHeight,
  peekSize = 38,
  fillAvailable = false,
  reduceMotion,
  style,
  testID,
  ...searchOptions
}: RoloDeckProps) {
  const window = useWindowDimensions()
  const systemReduceMotion = useReducedMotionPreference(reduceMotion !== undefined)
  const motionReduced = reduceMotion ?? systemReduceMotion
  const horizontal = axis === 'horizontal'
  const generatedDividers = useMemo(() => defaultDividers(cards), [cards])
  const dividers = useMemo(
    () => withAllDivider(searchOptions.dividers ?? generatedDividers),
    [generatedDividers, searchOptions.dividers],
  )
  const search = useRoloDeckSearch(cards, { ...searchOptions, dividers })
  const listRef = useRef<FlatList<HomesroloCard>>(null)
  const previousItemInterval = useRef(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [deckWidth, setDeckWidth] = useState(0)
  const [deckViewportHeight, setDeckViewportHeight] = useState(0)
  const requestedPeek = Math.max(20, Math.min(64, Math.round(peekSize)))
  const minimumCardHeight = variant === 'compact'
    ? COMPACT_CARD_MIN_HEIGHT
    : FULL_CARD_MIN_HEIGHT
  const availablePeek = !horizontal && fillAvailable && deckViewportHeight > 0
    ? Math.max(0, deckViewportHeight - minimumCardHeight - CARD_GAP)
    : requestedPeek
  const resolvedPeek = Math.min(requestedPeek, availablePeek)
  const resolvedCardHeight = Math.round(cardHeight ?? (
    !horizontal && fillAvailable && deckViewportHeight > 0
      ? Math.max(minimumCardHeight, deckViewportHeight - CARD_GAP - resolvedPeek)
      : variant === 'compact'
        ? Math.min(280, Math.max(248, window.height * 0.31))
        : Math.min(560, Math.max(410, window.height * 0.61))
  ))
  const resolvedCardWidth = Math.max(260, Math.round(
    (deckWidth || Math.max(300, window.width - (space.lg * 2))) - resolvedPeek,
  ))
  const itemInterval = (horizontal ? resolvedCardWidth : resolvedCardHeight) + CARD_GAP
  const viewportHeight = resolvedCardHeight + (horizontal ? 0 : resolvedPeek)
  const fixedSlotHeight = search.visibleCards.length === 0
    ? Math.max(300, viewportHeight)
    : viewportHeight
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, search.visibleCards.length - 1))

  const cardIdentity = search.visibleCards.map(card => card.cardRef).join('\n')
  useEffect(() => {
    setActiveIndex(0)
    listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [cardIdentity, search.query, search.selectedDivider])

  useEffect(() => {
    onActiveCardChange?.(search.visibleCards[safeActiveIndex] ?? null, safeActiveIndex)
  }, [onActiveCardChange, safeActiveIndex, search.visibleCards])

  useEffect(() => {
    if (previousItemInterval.current === 0) {
      previousItemInterval.current = itemInterval
      return
    }
    if (previousItemInterval.current === itemInterval) return
    previousItemInterval.current = itemInterval
    listRef.current?.scrollToOffset({
      offset: safeActiveIndex * itemInterval,
      animated: false,
    })
  }, [itemInterval, safeActiveIndex])

  const updateActiveIndex = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = horizontal
      ? event.nativeEvent.contentOffset.x
      : event.nativeEvent.contentOffset.y
    const next = Math.max(0, Math.min(
      search.visibleCards.length - 1,
      Math.round(offset / itemInterval),
    ))
    setActiveIndex(current => current === next ? current : next)
  }, [horizontal, itemInterval, search.visibleCards.length])

  const rememberDeckWidth = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width)
    if (nextWidth > 0) setDeckWidth(current => current === nextWidth ? current : nextWidth)
  }, [])

  const rememberDeckViewport = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height)
    if (nextHeight > 0) {
      setDeckViewportHeight(current => current === nextHeight ? current : nextHeight)
    }
  }, [])

  const openPage = useCallback((index: number) => {
    if (index < 0 || index >= search.visibleCards.length) return
    setActiveIndex(index)
    listRef.current?.scrollToOffset({
      offset: itemInterval * index,
      animated: !motionReduced,
    })
  }, [itemInterval, motionReduced, search.visibleCards.length])

  return (
    <View
      testID={testID}
      onLayout={rememberDeckWidth}
      style={[styles.root, fillAvailable && !horizontal && styles.rootFill, style]}
    >
      <View style={styles.searchBar}>
        <Ionicons name="search" size={19} color={colors.aqua} />
        <TextInput
          accessibilityLabel="Search home cards"
          value={search.query}
          onChangeText={search.setQuery}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.smoke}
          selectionColor={colors.lime}
          returnKeyType="search"
          style={styles.searchInput}
        />
        {search.query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear card search"
            hitSlop={8}
            onPress={() => search.setQuery('')}
            style={({ pressed }) => [styles.clearSearch, pressed && styles.pressed]}
          >
            <Ionicons name="close-circle" size={20} color={colors.slate} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.dividerRail}>
        <View style={styles.railLine} />
        <ScrollView
          horizontal
          contentContainerStyle={styles.dividerContent}
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
        >
          {dividers.map(divider => {
            const selected = search.selectedDivider === divider.id
            return (
              <Pressable
                key={divider.id}
                accessibilityRole="button"
                accessibilityLabel={`Show ${divider.label} cards`}
                accessibilityState={{ selected }}
                onPress={() => search.setSelectedDivider(divider.id)}
                style={({ pressed }) => [
                  styles.dividerChip,
                  selected && styles.dividerChipSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.dividerText, selected && styles.dividerTextSelected]}>{divider.label}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      <View
        onLayout={rememberDeckViewport}
        style={[
          styles.listSlot,
          fillAvailable && !horizontal ? styles.listSlotFill : { height: fixedSlotHeight },
        ]}
      >
        {search.visibleCards.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyMark}><Ionicons name="albums-outline" size={27} color={colors.aqua} /></View>
            <Text accessibilityRole="header" style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptyDetail}>{emptyDetail}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            accessibilityLabel="Home Rolodex cards"
            data={search.visibleCards}
            keyExtractor={card => card.cardRef}
            renderItem={({ item, index }) => {
              const active = index === safeActiveIndex
              return (
                <View
                  style={[
                    styles.deckItem,
                    horizontal
                      ? { width: itemInterval, height: resolvedCardHeight, paddingRight: CARD_GAP }
                      : { height: itemInterval, paddingBottom: CARD_GAP },
                    !active && !motionReduced && styles.deckItemBehind,
                  ]}
                >
                  <RoloCardView
                    card={item}
                    variant={variant}
                    renderMedia={renderMedia}
                    onOpen={onOpen}
                    onAskRolo={onAskRolo && (!canAskRolo || canAskRolo(item)) ? onAskRolo : undefined}
                    reduceMotion={motionReduced}
                    style={{ height: resolvedCardHeight }}
                  />
                </View>
              )
            }}
            getItemLayout={(_data, index) => ({
              index,
              length: itemInterval,
              offset: itemInterval * index,
            })}
            style={[
              styles.list,
              fillAvailable && !horizontal ? styles.listFill : { height: viewportHeight },
            ]}
            contentContainerStyle={horizontal ? { paddingRight: resolvedPeek } : { paddingBottom: resolvedPeek }}
            horizontal={horizontal}
            scrollEnabled={search.visibleCards.length > 1}
            nestedScrollEnabled
            snapToInterval={itemInterval}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={updateActiveIndex}
            initialNumToRender={3}
            maxToRenderPerBatch={4}
            windowSize={5}
            removeClippedSubviews={false}
          />
        )}
      </View>
      {search.visibleCards.length > 0 ? (
        <PagingIndicator
          activeIndex={safeActiveIndex}
          count={search.visibleCards.length}
          onSelect={openPage}
        />
      ) : null}
    </View>
  )
}

function PagingIndicator({
  activeIndex,
  count,
  onSelect,
}: {
  readonly activeIndex: number
  readonly count: number
  readonly onSelect: (index: number) => void
}) {
  const pages = visiblePageIndexes(count, activeIndex)
  return (
    <View style={styles.paging}>
      <Text accessibilityLiveRegion="polite" style={styles.pageCount}>
        {activeIndex + 1} of {count}
      </Text>
      <View style={styles.dots}>
        {pages.map((page, index) => {
          const previous = pages[index - 1]
          return (
            <View key={page} style={styles.dotGroup}>
              {previous !== undefined && page - previous > 1 ? <Text style={styles.ellipsis}>…</Text> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Go to card ${page + 1} of ${count}`}
                accessibilityState={{ selected: page === activeIndex }}
                hitSlop={8}
                onPress={() => onSelect(page)}
                style={[styles.dotTarget, page === activeIndex && styles.dotTargetSelected]}
              >
                <View style={[styles.dot, page === activeIndex && styles.dotSelected]} />
              </Pressable>
            </View>
          )
        })}
      </View>
      <Text style={styles.flipHint}>{count > 1 ? 'Swipe to flip' : 'One card'}</Text>
    </View>
  )
}

function defaultDividers(cards: readonly HomesroloCard[]): readonly RoloDeckDivider[] {
  const groups = [...new Set(cards.map(card => String(card.group)))]
  return [
    { id: ALL_DIVIDER, label: 'All' },
    ...groups.map(group => ({ id: group, label: displayGroup(group) })),
  ]
}

function withAllDivider(dividers: readonly RoloDeckDivider[]): readonly RoloDeckDivider[] {
  return dividers.some(divider => divider.id === ALL_DIVIDER)
    ? dividers
    : [{ id: ALL_DIVIDER, label: 'All' }, ...dividers]
}

function searchTokens(value: string): readonly string[] {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .split(/\s+/)
    .filter(Boolean)
}

function displayGroup(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function visiblePageIndexes(count: number, active: number): readonly number[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index)
  const middleStart = Math.max(1, Math.min(count - 4, active - 1))
  return [0, middleStart, middleStart + 1, middleStart + 2, count - 1]
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left - right)
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: space.sm },
  rootFill: { flex: 1, minHeight: 0 },
  listSlot: { width: '100%' },
  listSlotFill: { flex: 1, minHeight: 0 },
  searchBar: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.inkSoft,
  },
  searchInput: { flex: 1, minWidth: 0, color: colors.cream, fontSize: 15, paddingVertical: 12 },
  clearSearch: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  dividerRail: { minHeight: 48, justifyContent: 'center' },
  railLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.line },
  dividerContent: { alignItems: 'center', gap: 8, paddingHorizontal: 2, paddingVertical: 2 },
  dividerChip: {
    minHeight: 42,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.inkRaised,
  },
  dividerChipSelected: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  dividerText: { color: colors.slate, fontSize: 12, fontWeight: '800' },
  dividerTextSelected: { color: colors.lime },
  list: { width: '100%', overflow: 'visible' },
  listFill: { flex: 1, minHeight: 0 },
  deckItem: { width: '100%' },
  deckItemBehind: { opacity: 0.68, transform: [{ scale: 0.975 }] },
  empty: {
    flex: 1,
    minHeight: 300,
    padding: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.inkRaised,
  },
  emptyMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inkSoft,
  },
  emptyTitle: { color: colors.cream, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  emptyDetail: { maxWidth: 330, color: colors.slate, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  paging: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pageCount: { minWidth: 48, color: colors.cream, fontSize: 11, fontWeight: '900' },
  dots: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dotGroup: { flexDirection: 'row', alignItems: 'center' },
  dotTarget: { width: 30, height: 38, alignItems: 'center', justifyContent: 'center' },
  dotTargetSelected: {},
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotSelected: { width: 18, backgroundColor: colors.lime },
  ellipsis: { color: colors.smoke, fontSize: 12, marginHorizontal: -3 },
  flipHint: { minWidth: 70, color: colors.smoke, fontSize: 10, fontWeight: '700', textAlign: 'right' },
  pressed: { opacity: 0.72 },
})
