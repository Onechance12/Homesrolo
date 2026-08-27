import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useSession } from '../src/auth/SessionProvider.tsx'
import { friendlyError } from '../src/api/errors.ts'
import { useResource } from '../src/hooks/useResource.ts'
import { openSelectedHome } from '../src/home/navigation.ts'
import {
  EMPTY_NEW_HOME_ADDRESS,
  reviewNewHomeAddress,
  sameHomeRecordAddress,
  type NewHomeAddressDraft,
  type ReviewedNewHomeAddress,
} from '../src/home/onboarding.ts'
import { publicRoofingIntent, publicRoofingPrompt } from '../src/auth/entry-intent.ts'
import { legacyProjectRef, oneRouteParam } from '../src/home/legacy-route.ts'
import {
  Body, Brand, Button, Card, Eyebrow, Loading, Notice, Page, TextField, Title,
} from '../src/components/ui.tsx'
import { InstallHomesrolo } from '../src/components/InstallHomesrolo.tsx'
import { colors, radius, space } from '../src/theme.ts'

export default function HomesScreen() {
  const { intent: rawIntent, add: rawAdd, project: rawProject } = useLocalSearchParams<{
    intent?: string | string[]
    add?: string | string[]
    project?: string | string[]
  }>()
  const entryIntent = publicRoofingIntent(rawIntent)
  const requestedAdd = oneRouteParam(rawAdd) === '1'
  const requestedProject = legacyProjectRef(rawProject)
  const { state: auth, api, signOut, refreshSession } = useSession()
  const loader = useCallback(() => api.listHomes(), [api])
  const homes = useResource(loader, auth.kind === 'signed_in')
  const [adding, setAdding] = useState(requestedAdd)
  const [address, setAddress] = useState<NewHomeAddressDraft>({ ...EMPTY_NEW_HOME_ADDRESS })
  const [reviewedAddress, setReviewedAddress] = useState<ReviewedNewHomeAddress | null>(null)
  const [label, setLabel] = useState('My home')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingCreate = useRef<{
    readonly intent: string
    readonly createCommandRef: string
    readonly recordCommandRef: string
  } | null>(null)

  useEffect(() => { if (requestedAdd) setAdding(true) }, [requestedAdd])

  function openHome(homeRef: string) {
    if (requestedProject) {
      router.push({
        pathname: '/home/[homeId]/work/[projectRef]',
        params: { homeId: homeRef, projectRef: requestedProject },
      })
      return
    }
    if (entryIntent) {
      router.push({
        pathname: '/home/[homeId]/rolo',
        params: { homeId: homeRef, prompt: publicRoofingPrompt(entryIntent) },
      })
      return
    }
    openSelectedHome(router, homeRef)
  }

  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }

  async function addHome() {
    const review = reviewNewHomeAddress(address)
    if (!review.ok) {
      setReviewedAddress(null)
      setError(review.message)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const cleanLabel = label.trim() || 'My home'
      const intent = JSON.stringify({ displayLabel: cleanLabel, address: review.value.address })
      if (!pendingCreate.current || pendingCreate.current.intent !== intent) {
        pendingCreate.current = {
          intent,
          createCommandRef: await api.newCommandRef(),
          recordCommandRef: await api.newCommandRef(),
        }
      }
      const home = await api.createHome(
        cleanLabel,
        review.value.privateLocationLabel,
        pendingCreate.current.createCommandRef,
      )
      const profile = await api.getHomeRecord(home.homeRef)
      if (!sameHomeRecordAddress(profile.address, review.value.address)) {
        await api.updateHomeRecord(home.homeRef, {
          commandRef: pendingCreate.current.recordCommandRef,
          expectedRevision: profile.revision,
          address: review.value.address,
          homeType: profile.homeType,
          yearBuilt: profile.yearBuilt,
          systems: profile.systems,
        })
      }
      pendingCreate.current = null
      openHome(home.homeRef)
    } catch (caught) { setError(friendlyError(caught)) } finally { setBusy(false) }
  }

  function changeAddress(patch: Partial<NewHomeAddressDraft>) {
    setAddress(current => ({ ...current, ...patch }))
    setReviewedAddress(null)
    setError(null)
    pendingCreate.current = null
  }

  function reviewHome() {
    const review = reviewNewHomeAddress(address)
    if (!review.ok) {
      setError(review.message)
      return
    }
    setError(null)
    setReviewedAddress(review.value)
  }

  return (
    <Page>
      <View style={styles.topRow}>
        <Brand compact />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => void signOut()}
          style={styles.signOut}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.slate} />
        </Pressable>
      </View>
      <View style={styles.hero}>
        <Eyebrow>Your homes</Eyebrow>
        <Title>Where do you need help?</Title>
        <Body muted>Choose a home, then tell Rolo what needs fixing, planning, or maintaining. Photos, files, and decisions stay together as you go.</Body>
      </View>

      {homes.state.kind === 'loading' ? <Loading label="Finding your homes…" /> : null}
      {homes.state.kind === 'error' ? (
        <Notice message="Homesrolo could not load your homes." actionLabel="Try again" onAction={homes.reload} />
      ) : null}
      {homes.state.kind === 'ready' ? homes.state.value.map(home => (
        <Pressable
          key={home.homeRef}
          accessibilityRole="button"
          accessibilityLabel={`Open ${home.displayLabel}`}
          accessibilityHint={home.privateLocationLabel}
          onPress={() => openHome(home.homeRef)}
          style={({ pressed }) => [styles.homeCard, pressed && styles.pressed]}
        >
          <View style={styles.homeIcon}><Ionicons name="home" size={24} color={colors.ink} /></View>
          <View style={styles.homeCopy}>
            <Text style={styles.homeTitle}>{home.displayLabel}</Text>
            <Text style={styles.homeLocation}>{home.privateLocationLabel}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.lime} />
        </Pressable>
      )) : null}

      {adding || (homes.state.kind === 'ready' && homes.state.value.length === 0) ? (
        <Card accent>
          <Eyebrow>Add a home</Eyebrow>
          <Text style={styles.addTitle}>{reviewedAddress ? 'Check your home' : 'Where is the work happening?'}</Text>
          {reviewedAddress ? (
            <View style={styles.addressReview}>
              <View style={styles.reviewIcon}><Ionicons name="home" size={22} color={colors.ink} /></View>
              <View style={styles.reviewCopy}>
                <Text style={styles.reviewTitle}>{label.trim() || 'My home'}</Text>
                <Text style={styles.reviewLine}>{reviewedAddress.address.line1}</Text>
                {reviewedAddress.address.line2 ? <Text style={styles.reviewLine}>{reviewedAddress.address.line2}</Text> : null}
                <Text style={styles.reviewLine}>{reviewedAddress.address.city}, {reviewedAddress.address.regionCode} {reviewedAddress.address.postalCode}</Text>
              </View>
            </View>
          ) : (
            <>
              <TextField
                label="Street address"
                value={address.line1}
                onChangeText={line1 => changeAddress({ line1 })}
                autoComplete="street-address"
                maxLength={120}
                placeholder="123 Main Street"
              />
              <TextField
                label="Unit or building"
                value={address.line2}
                onChangeText={line2 => changeAddress({ line2 })}
                maxLength={120}
                placeholder="Optional"
              />
              <TextField label="City" value={address.city} onChangeText={city => changeAddress({ city })} maxLength={80} />
              <View style={styles.fieldRow}>
                <TextField
                  label="State"
                  value={address.regionCode}
                  onChangeText={regionCode => changeAddress({ regionCode: regionCode.toUpperCase().slice(0, 2) })}
                  autoCapitalize="characters"
                  maxLength={2}
                  placeholder="TX"
                  style={styles.shortField}
                />
                <TextField
                  label="ZIP"
                  value={address.postalCode}
                  onChangeText={postalCode => changeAddress({ postalCode })}
                  keyboardType="numbers-and-punctuation"
                  autoComplete="postal-code"
                  maxLength={10}
                  placeholder="76102"
                  style={styles.zipField}
                />
              </View>
              <TextField
                label="What should we call it?"
                value={label}
                onChangeText={next => { setLabel(next); pendingCreate.current = null }}
                maxLength={80}
                placeholder="My home"
              />
            </>
          )}
          {reviewedAddress
            ? <Button label={busy ? 'Saving home…' : 'Save this home'} onPress={() => void addHome()} disabled={busy} />
            : <Button label="Review this home" onPress={reviewHome} disabled={busy} />}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {reviewedAddress ? <Button label="Edit address" onPress={() => setReviewedAddress(null)} quiet /> : null}
          {homes.state.kind === 'ready' && homes.state.value.length > 0
            ? <Button label="Cancel" onPress={() => { setAdding(false); setReviewedAddress(null) }} quiet /> : null}
        </Card>
      ) : <Button label="Add another home" icon="add" onPress={() => { pendingCreate.current = null; setReviewedAddress(null); setAdding(true) }} quiet />}

      <InstallHomesrolo />

      <Button
        label="Open Homesrolo Pro"
        icon="briefcase-outline"
        quiet
        onPress={() => router.push('/pro')}
      />
    </Page>
  )
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  signOut: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: 22, borderWidth: 1, borderColor: colors.line,
  },
  hero: { gap: space.sm, paddingTop: space.lg, paddingBottom: space.sm },
  homeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 88,
    borderRadius: radius.large, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkRaised, padding: space.md,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  homeIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime },
  homeCopy: { flex: 1, gap: 4 },
  homeTitle: { color: colors.cream, fontSize: 19, fontWeight: '800' },
  homeLocation: { color: colors.slate, fontSize: 13, lineHeight: 18 },
  addTitle: { color: colors.cream, fontSize: 23, lineHeight: 28, fontWeight: '800' },
  fieldRow: { flexDirection: 'row', gap: space.sm },
  shortField: { minWidth: 88 },
  zipField: { minWidth: 140 },
  addressReview: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkRaised, padding: space.md,
  },
  reviewIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime },
  reviewCopy: { flex: 1, gap: 3 },
  reviewTitle: { color: colors.cream, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  reviewLine: { color: colors.slate, fontSize: 14, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' },
})
