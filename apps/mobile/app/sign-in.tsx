import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSession } from '../src/auth/SessionProvider.tsx'
import { friendlyError } from '../src/api/errors.ts'
import { NativeApiError } from '../src/api/client.ts'
import { postSignInDestination } from '../src/auth/return-route.ts'
import { publicRoofingIntent } from '../src/auth/entry-intent.ts'
import {
  createEmailCodeChallenge,
  createEmailCodeChallengeStorage,
  emailCodeResendSeconds,
  normalizeSignInEmail,
  type EmailCodeChallenge,
} from '../src/auth/email-code-challenge.ts'
import { Body, Brand, Button, Card, Eyebrow, LaunchLoading, Page, TextField, Title } from '../src/components/ui.tsx'
import { colors, radius, space } from '../src/theme.ts'

export default function SignInScreen() {
  const { returnTo, intent } = useLocalSearchParams<{
    returnTo?: string | string[]
    intent?: string | string[]
  }>()
  const { state, requestCode, verifyCode, refreshSession } = useSession()
  const challengeStorage = useMemo(() => createEmailCodeChallengeStorage(
    Platform.OS === 'web' ? undefined : () => null,
  ), [])
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [challenge, setChallenge] = useState<EmailCodeChallenge | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState<'send' | 'verify' | 'check' | null>(null)
  const [verificationAccepted, setVerificationAccepted] = useState(false)
  const [now, setNow] = useState(Date.now)
  const [verifyRetryAt, setVerifyRetryAt] = useState(0)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)
  const inFlight = useRef(false)
  const operation = useRef(0)
  const normalizedEmail = normalizeSignInEmail(email)
  const resendSeconds = emailCodeResendSeconds(challenge, now)
  const verifySeconds = Math.max(0, Math.ceil((verifyRetryAt - now) / 1_000))
  const destination = useMemo(() => {
    const typedDestination = postSignInDestination(returnTo)
    const entryIntent = publicRoofingIntent(intent)
    return typedDestination === '/start' && entryIntent
      ? { pathname: '/homes' as const, params: { intent: entryIntent } }
      : typedDestination
  }, [intent, returnTo])

  useEffect(() => {
    mounted.current = true
    const restored = challengeStorage.read(Date.now())
    if (restored) { setChallenge(restored); setEmail(restored.email) }
    setReady(true)
    return () => { mounted.current = false; operation.current += 1 }
  }, [challengeStorage])

  useEffect(() => {
    if (state.kind !== 'signed_in') return
    operation.current += 1
    challengeStorage.clear()
    setCode('')
    setEmail('')
    setChallenge(null)
    router.replace(destination)
  }, [challengeStorage, destination, state.kind])

  const returnToEmail = useCallback((message: string | null = null) => {
    operation.current += 1
    challengeStorage.clear()
    setChallenge(null)
    setEmail('')
    setCode('')
    setVerifyRetryAt(0)
    setVerificationAccepted(false)
    setError(message)
    setStorageAvailable(true)
  }, [challengeStorage])

  useEffect(() => {
    if (!challenge) return
    const tick = () => {
      const current = Date.now()
      setNow(current)
      if (current >= challenge.expiresAt && !inFlight.current) {
        returnToEmail('This sign-in step timed out. Request a fresh code to continue.')
      }
    }
    tick()
    const timer = setInterval(tick, 1_000)
    const subscription = AppState.addEventListener('change', value => { if (value === 'active') tick() })
    if (Platform.OS === 'web') {
      window.addEventListener('focus', tick)
      window.addEventListener('pageshow', tick)
    }
    return () => {
      clearInterval(timer)
      subscription.remove()
      if (Platform.OS === 'web') {
        window.removeEventListener('focus', tick)
        window.removeEventListener('pageshow', tick)
      }
    }
  }, [challenge, returnToEmail])

  function openChallenge(value: EmailCodeChallenge) {
    const current = Date.now()
    setNow(current)
    setEmail(value.email)
    setChallenge(value)
    setCode('')
    setError(null)
    setStorageAvailable(challengeStorage.write(value, current) || Platform.OS !== 'web')
  }

  async function sendCode() {
    const current = Date.now()
    const targetEmail = challenge?.email ?? normalizedEmail
    if (!ready || !targetEmail || inFlight.current || state.kind === 'signed_in'
      || state.kind === 'loading' || emailCodeResendSeconds(challenge, current) > 0) return
    inFlight.current = true
    const request = ++operation.current
    setBusy('send')
    setError(null)
    try {
      await requestCode(targetEmail)
      if (!mounted.current || request !== operation.current) return
      const next = createEmailCodeChallenge(targetEmail, Date.now())
      if (next) openChallenge(next)
    } catch (caught) {
      if (mounted.current && request === operation.current) setError(friendlyError(caught))
    } finally {
      inFlight.current = false
      if (mounted.current && request === operation.current) setBusy(null)
    }
  }

  function useExistingCode() {
    if (!ready || !normalizedEmail || inFlight.current || state.kind === 'signed_in'
      || state.kind === 'loading') return
    const next = createEmailCodeChallenge(normalizedEmail, Date.now(), 'existing')
    if (next) openChallenge(next)
  }

  async function finishSignIn() {
    if (!challenge || code.length !== 6 || inFlight.current || Date.now() < verifyRetryAt) return
    if (Date.now() >= challenge.expiresAt) {
      returnToEmail('This sign-in step timed out. Request a fresh code to continue.')
      return
    }
    inFlight.current = true
    const request = ++operation.current
    setBusy('verify')
    setError(null)
    try {
      await verifyCode(challenge.email, code)
      // Verification may remount the public screen as a private workspace.
      // Its credential is never copied into this recovery metadata.
      challengeStorage.clearMatching(challenge)
      if (mounted.current && request === operation.current) {
        setCode('')
        setChallenge(null)
        setVerificationAccepted(true)
      }
    } catch (caught) {
      if (!mounted.current || request !== operation.current) return
      if (caught instanceof NativeApiError && caught.code === 'rate_limited') {
        setVerifyRetryAt(Date.now() + Math.min(3_600, Math.max(1, caught.retryAfterSeconds ?? 60)) * 1_000)
      }
      setError(friendlyError(caught))
    } finally {
      inFlight.current = false
      if (mounted.current && request === operation.current) setBusy(null)
    }
  }

  async function retrySessionCheck() {
    if (inFlight.current) return
    inFlight.current = true
    const request = ++operation.current
    setBusy('check')
    setError(null)
    try {
      // The code may already be consumed. Only read the existing cookie/session.
      await refreshSession()
    } catch (caught) {
      if (mounted.current && request === operation.current) setError(friendlyError(caught))
    } finally {
      inFlight.current = false
      if (mounted.current && request === operation.current) setBusy(null)
    }
  }

  if (!ready || state.kind === 'loading' || state.kind === 'signed_in') {
    return <LaunchLoading label={state.kind === 'signed_in' ? 'Opening your space…' : 'Getting your sign-in ready…'} />
  }

  if (verificationAccepted) {
    return (
      <Page>
        <View style={styles.content}>
          <Brand compact />
          <View style={styles.hero}>
            <Eyebrow>One last check</Eyebrow>
            <Title>Almost home.</Title>
            <Body muted>Your code was accepted. We still need to confirm your sign-in before opening your space.</Body>
          </View>
          <Card accent>
            <Text style={styles.formCopy}>You don’t need to enter that code again. Retry the sign-in check when your connection is ready.</Text>
            <Button label={busy === 'check' ? 'Checking your sign-in…' : 'Retry sign-in check'} onPress={() => void retrySessionCheck()} disabled={Boolean(busy)} />
            <Button label="Start sign-in again" onPress={() => returnToEmail()} disabled={Boolean(busy)} quiet />
            {error || state.kind === 'error' ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error ?? (state.kind === 'error' ? state.message : '')}</Text> : null}
          </Card>
        </View>
      </Page>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Page>
        <View style={styles.content}>
          <Brand compact />
          <View style={styles.hero}>
            <Eyebrow>{challenge ? 'One small step, then you’re home' : 'Your home, remembered'}</Eyebrow>
            <Title>{challenge ? 'Check your inbox.' : 'Your home.\nAll together.'}</Title>
            <Body muted>{challenge
              ? 'Enter your six-digit code here. You can leave this tab open while you check your email.'
              : 'Keep projects, photos, and everyday upkeep in one place—with Rolo to help you think it through.'}</Body>
          </View>
          <Card accent style={styles.form}>
          {!challenge ? (
            <>
              <View style={styles.formHeading}>
                <Text accessibilityRole="header" style={styles.formTitle}>Sign in to Homesrolo.</Text>
                <Text style={styles.formCopy}>One email. No password to remember.</Text>
              </View>
              <TextField
                label="Email"
                value={email}
                onChangeText={value => { setEmail(value); setError(null) }}
                editable={!busy}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                placeholder="you@example.com"
                maxLength={254}
                returnKeyType="send"
                onSubmitEditing={() => void sendCode()}
              />
              <Button label={busy === 'send' ? 'Requesting your code…' : 'Continue with email'} onPress={() => void sendCode()} disabled={Boolean(busy) || !normalizedEmail} icon="arrow-forward" />
              <Button label="I already have a code" onPress={useExistingCode} disabled={Boolean(busy) || !normalizedEmail} quiet />
            </>
          ) : (
            <>
              <View style={styles.inboxNote}>
                <Ionicons name="mail-outline" size={22} color={colors.aqua} />
                <View style={styles.inboxCopy}>
                  <Text style={styles.email}>{challenge.email}</Text>
                  <Text style={styles.formCopy} accessibilityLiveRegion="polite">{challenge.sentAt === null
                    ? 'Use the code you already received. Need another? You can request one below.'
                    : 'Request received. If this email can sign in, look for a six-digit code. Check your spam folder too.'}</Text>
                </View>
              </View>
              <TextField
                key="email-code"
                label="Six-digit code"
                value={code}
                onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
                accessibilityHint="Enter or paste the six digits from your sign-in email."
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                importantForAutofill="yes"
                autoFocus
                autoCorrect={false}
                editable={!busy}
                keyboardType="number-pad"
                placeholder="123456"
                style={styles.codeInput}
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={() => void finishSignIn()}
              />
              <Button label={busy === 'verify' ? 'Opening your space…' : verifySeconds > 0 ? `Try again in ${verifySeconds}s` : 'Open Homesrolo'} onPress={() => void finishSignIn()} disabled={Boolean(busy) || code.length !== 6 || verifySeconds > 0} icon="arrow-forward" />
              <Button label={busy === 'send' ? 'Requesting your code…' : resendSeconds > 0 ? `Send another code in ${resendSeconds}s` : 'Send another code'} onPress={() => void sendCode()} disabled={Boolean(busy) || resendSeconds > 0} quiet />
              <Button label="Use a different email" onPress={() => returnToEmail()} disabled={Boolean(busy)} quiet />
              {!storageAvailable ? <Text style={styles.help}>This browser can’t remember this step. Keep this tab open until you finish, or use “I already have a code” when you return.</Text> : null}
              <Text style={styles.help}>For privacy, this sign-in step clears after 10 minutes. Homesrolo doesn’t save your code.</Text>
            </>
          )}
          {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
          </Card>
          {!challenge ? (
            <View style={styles.benefits}>
              <Benefit icon="home-outline" label="A record of your home" />
              <Benefit icon="people-outline" label="Your household, in the loop" />
              <Benefit icon="chatbubble-ellipses-outline" label="A little help from Rolo" />
            </View>
          ) : null}
          <View style={styles.trust}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.smoke} />
            <Text style={styles.trustText}>Private by default. You decide who joins your home.</Text>
          </View>
        </View>
      </Page>
    </KeyboardAvoidingView>
  )
}

function Benefit({ icon, label }: { readonly icon: keyof typeof Ionicons.glyphMap; readonly label: string }) {
  return <View style={styles.benefit}>
    <View style={styles.benefitIcon}><Ionicons name={icon} size={17} color={colors.lime} /></View>
    <Text style={styles.benefitText}>{label}</Text>
  </View>
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: space.lg, paddingTop: space.md },
  hero: { gap: space.sm, paddingTop: space.md },
  benefits: { gap: 9, paddingBottom: 2 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  benefitIcon: { width: 30, height: 30, borderRadius: radius.small, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.limeSoft },
  benefitText: { color: colors.cream, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  form: { gap: space.md },
  formHeading: { gap: 6, paddingBottom: 2 },
  formTitle: { color: colors.cream, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  formCopy: { color: colors.slate, fontSize: 13, lineHeight: 20 },
  inboxNote: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingBottom: space.xs },
  inboxCopy: { flex: 1, gap: space.xs },
  email: { color: colors.cream, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  codeInput: { minHeight: 64, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 8, textAlign: 'center' },
  help: { color: colors.smoke, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  trust: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  trustText: { flexShrink: 1, color: colors.smoke, fontSize: 12, lineHeight: 18, textAlign: 'center' },
})
