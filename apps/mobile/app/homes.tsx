import { useCallback, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, router } from 'expo-router'
import { useSession } from '../src/auth/SessionProvider.tsx'
import { friendlyError } from '../src/api/errors.ts'
import { useResource } from '../src/hooks/useResource.ts'
import { openSelectedHome } from '../src/home/navigation.ts'
import {
  Body, Brand, Button, Card, Eyebrow, Loading, Notice, Page, TextField, Title,
} from '../src/components/ui.tsx'
import { colors, radius, space } from '../src/theme.ts'

export default function HomesScreen() {
  const { state: auth, api, signOut, refreshSession } = useSession()
  const loader = useCallback(() => api.listHomes(), [api])
  const homes = useResource(loader, auth.kind === 'signed_in')
  const [adding, setAdding] = useState(false)
  const [address, setAddress] = useState('')
  const [label, setLabel] = useState('My home')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingCreate = useRef<{ readonly intent: string; readonly commandRef: string } | null>(null)

  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }

  async function addHome() {
    setBusy(true)
    setError(null)
    try {
      const cleanLabel = label.trim() || 'My home'
      const cleanAddress = address.trim()
      const intent = JSON.stringify({ displayLabel: cleanLabel, privateLocationLabel: cleanAddress })
      if (!pendingCreate.current || pendingCreate.current.intent !== intent) {
        pendingCreate.current = { intent, commandRef: await api.newCommandRef() }
      }
      const home = await api.createHome(cleanLabel, cleanAddress, pendingCreate.current.commandRef)
      pendingCreate.current = null
      openSelectedHome(router, home.homeRef)
    } catch (caught) { setError(friendlyError(caught)) } finally { setBusy(false) }
  }

  return (
    <Page>
      <View style={styles.topRow}>
        <Brand compact />
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
          <Ionicons name="log-out-outline" size={20} color={colors.slate} />
        </Pressable>
      </View>
      <View style={styles.hero}>
        <Eyebrow>Your homes</Eyebrow>
        <Title>Where do you need help?</Title>
        <Body muted>Choose the home, then tell Rolo what needs fixing, planning, servicing, or answering. The record builds underneath the work.</Body>
      </View>

      {homes.state.kind === 'loading' ? <Loading label="Finding your homes…" /> : null}
      {homes.state.kind === 'error' ? (
        <Notice message="Homesrolo could not load your homes." actionLabel="Try again" onAction={homes.reload} />
      ) : null}
      {homes.state.kind === 'ready' ? homes.state.value.map(home => (
        <Pressable
          key={home.homeRef}
          onPress={() => openSelectedHome(router, home.homeRef)}
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
          <Text style={styles.addTitle}>Where is the work happening?</Text>
          <TextField
            label="Home address"
            value={address}
            onChangeText={setAddress}
            autoComplete="street-address"
            placeholder="123 Main Street, City, State ZIP"
          />
          <TextField label="What should we call it?" value={label} onChangeText={setLabel} placeholder="My home" />
          <Button label={busy ? 'Opening…' : 'Continue'} onPress={() => void addHome()} disabled={busy || address.trim().length < 8} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {homes.state.kind === 'ready' && homes.state.value.length > 0
            ? <Button label="Cancel" onPress={() => setAdding(false)} quiet /> : null}
        </Card>
      ) : <Button label="Add another home" icon="add" onPress={() => { pendingCreate.current = null; setAdding(true) }} quiet />}

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
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' },
})
