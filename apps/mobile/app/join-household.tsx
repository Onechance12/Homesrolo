import { useRef, useState } from 'react'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { useSession } from '../src/auth/SessionProvider.tsx'
import { friendlyError } from '../src/api/errors.ts'
import { isHouseholdInvitationRef } from '../src/api/household.ts'
import type { HouseholdInvitationAcceptance } from '../src/api/model.ts'
import { householdInvitationReturnPath } from '../src/auth/return-route.ts'
import {
  Body, Brand, Button, Card, Eyebrow, Loading, Notice, Page, Title,
} from '../src/components/ui.tsx'
import { colors, space } from '../src/theme.ts'

export default function JoinHouseholdScreen() {
  const { invitation: rawInvitation } = useLocalSearchParams<{
    invitation?: string | string[]
  }>()
  const invitationRef = typeof rawInvitation === 'string' ? rawInvitation : null
  const { state: auth, api, refreshSession } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState<HouseholdInvitationAcceptance | null>(null)
  const pendingCommand = useRef<string | null>(null)

  if (!invitationRef || !isHouseholdInvitationRef(invitationRef)) {
    return (
      <Page>
        <Brand />
        <Notice message="That household invitation link is incomplete or no longer valid." />
        <Button label="Open Homesrolo" onPress={() => router.replace('/start')} />
      </Page>
    )
  }
  if (auth.kind === 'loading') return <Page><Loading label="Checking your invitation…" /></Page>
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }
  if (auth.kind === 'signed_out') {
    const returnTo = householdInvitationReturnPath(invitationRef)
    return <Redirect href={{ pathname: '/sign-in', params: returnTo ? { returnTo } : {} }} />
  }

  async function accept() {
    if (busy || !invitationRef) return
    setBusy(true)
    setError(null)
    try {
      pendingCommand.current ??= await api.newCommandRef()
      const result = await api.acceptHouseholdInvitation(invitationRef, {
        commandRef: pendingCommand.current,
      })
      pendingCommand.current = null
      setAccepted(result)
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      setBusy(false)
    }
  }

  if (accepted) {
    return (
      <Page>
        <Brand />
        <View style={styles.hero}>
          <Eyebrow>Household connected</Eyebrow>
          <Title>You’re in the same Home Rolo.</Title>
          <Body muted>Work, selected photos, home records, and household assignments now stay together for this home.</Body>
        </View>
        <Card accent>
          <Text style={styles.name}>Welcome, {accepted.member.displayLabel}.</Text>
          <Text style={styles.copy}>Your private Rolo conversations stay yours. Only the work and records you intentionally save become shared.</Text>
          <Button
            label="Open our Home Rolo"
            icon="arrow-forward"
            onPress={() => router.replace({
              pathname: '/home/[homeId]/people',
              params: { homeId: accepted.member.homeRef, section: 'household' },
            })}
          />
        </Card>
      </Page>
    )
  }

  return (
    <Page>
      <Brand />
      <View style={styles.hero}>
        <Eyebrow>Household invitation</Eyebrow>
        <Title>Join this Home Rolo.</Title>
        <Body muted>You’ll use your own sign-in while sharing one exact home with the person who invited you.</Body>
      </View>
      <Card accent>
        <Text style={styles.name}>One home. Separate accounts.</Text>
        <Text style={styles.copy}>The link works only for the invited email. It cannot be forwarded to give someone else access.</Text>
        <Button
          label={busy ? 'Joining…' : 'Join this home'}
          icon="people-outline"
          disabled={busy || !auth.session.capabilities.sharing}
          onPress={() => void accept()}
        />
        {!auth.session.capabilities.sharing ? (
          <Notice message="Household sharing is unavailable right now. Your invitation has not been used." />
        ) : null}
        {error ? <Notice message={error} /> : null}
      </Card>
      <Text style={styles.trust}>Exact-home access · Private by default · No contractor access is created</Text>
    </Page>
  )
}

const styles = StyleSheet.create({
  hero: { gap: space.sm, paddingTop: space.lg, paddingBottom: space.sm },
  name: { color: colors.cream, fontSize: 19, lineHeight: 24, fontWeight: '900' },
  copy: { color: colors.slate, fontSize: 13, lineHeight: 19 },
  trust: { color: colors.smoke, fontSize: 11, lineHeight: 16, textAlign: 'center' },
})
