import { useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSession } from '../src/auth/SessionProvider.tsx'
import { friendlyError } from '../src/api/errors.ts'
import { postSignInDestination } from '../src/auth/return-route.ts'
import { Body, Brand, Button, Card, Eyebrow, Page, TextField, Title } from '../src/components/ui.tsx'
import { colors, space } from '../src/theme.ts'

export default function SignInScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>()
  const { state, requestCode, verifyCode } = useSession()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const destination = useMemo(() => postSignInDestination(returnTo), [returnTo])

  useEffect(() => {
    if (state.kind === 'signed_in') router.replace(destination)
  }, [destination, state.kind])

  async function sendCode() {
    setBusy(true)
    setError(null)
    try {
      await requestCode(email)
      setStep('code')
    } catch (caught) { setError(friendlyError(caught)) } finally { setBusy(false) }
  }

  async function finishSignIn() {
    setBusy(true)
    setError(null)
    try {
      await verifyCode(email, code)
    } catch (caught) { setError(friendlyError(caught)) } finally { setBusy(false) }
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Page>
        <Brand />
        <View style={styles.hero}>
          <Eyebrow>Your home, remembered</Eyebrow>
          <Title>{step === 'email' ? 'Open your Rolo.' : 'Check your email.'}</Title>
          <Body muted>
            {step === 'email'
              ? 'Enter your email. We’ll send a six-digit code you can type right here—no browser jumping.'
              : `We sent a six-digit code to ${email.trim().toLowerCase()}.`}
          </Body>
        </View>
        <Card accent>
          {step === 'email' ? (
            <>
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                returnKeyType="send"
                onSubmitEditing={() => { if (email.trim()) void sendCode() }}
              />
              <Button label={busy ? 'Sending…' : 'Send my code'} onPress={() => void sendCode()} disabled={busy || !email.trim()} />
            </>
          ) : (
            <>
              <TextField
                label="Six-digit code"
                value={code}
                onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                keyboardType="number-pad"
                placeholder="000000"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={() => { if (code.length === 6) void finishSignIn() }}
              />
              <Button label={busy ? 'Opening…' : 'Open Homesrolo'} onPress={() => void finishSignIn()} disabled={busy || code.length !== 6} />
              <Button label="Send another code" onPress={() => void sendCode()} disabled={busy} quiet />
              <Button label="Use a different email" onPress={() => { setStep('email'); setCode(''); setError(null) }} disabled={busy} quiet />
            </>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>
        <Text style={styles.trust}>Private by default · Your record stays under your control</Text>
      </Page>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  hero: { gap: space.sm, paddingTop: space.xl, paddingBottom: space.sm },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  trust: { color: colors.smoke, fontSize: 12, textAlign: 'center', marginTop: space.sm },
})
