import { useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { Button, Card, SectionTitle } from './ui.tsx'
import { colors, space } from '../theme.ts'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>
}

function installedOnHomeScreen(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return Platform.OS !== 'web'
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in window.navigator
      && (window.navigator as Navigator & { readonly standalone?: boolean }).standalone === true)
}

/** Reuses the existing PWA install path inside the unified shell. It stores no home data. */
export function InstallHomesrolo() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => installedOnHomeScreen())
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const remember = (event: Event) => {
      event.preventDefault()
      setPrompt(event as BeforeInstallPromptEvent)
    }
    const finish = () => {
      setPrompt(null)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', remember)
    window.addEventListener('appinstalled', finish)
    return () => {
      window.removeEventListener('beforeinstallprompt', remember)
      window.removeEventListener('appinstalled', finish)
    }
  }, [])

  if (Platform.OS !== 'web' || installed) return null

  async function install() {
    if (!prompt) return
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') {
      setPrompt(null)
      setInstalled(true)
    } else {
      setDismissed(true)
    }
  }

  return (
    <Card>
      <SectionTitle
        title="Keep Homesrolo on this device"
        detail="Open it from your Home Screen like the rest of your apps. Your private home data still stays on the secure server."
      />
      {prompt ? (
        <Button
          label="Install Homesrolo"
          icon="download-outline"
          accessibilityHint="Adds Homesrolo to this device"
          onPress={() => void install()}
        />
      ) : (
        <View style={styles.steps}>
          <Text style={styles.step}>On iPhone or iPad: tap Share, then Add to Home Screen.</Text>
          <Text style={styles.step}>On Android or desktop: choose Install app from the browser menu.</Text>
        </View>
      )}
      {dismissed ? <Text accessibilityRole="alert" style={styles.dismissed}>No problem—you can install it later.</Text> : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  steps: { gap: space.xs },
  step: { color: colors.slate, fontSize: 13, lineHeight: 19 },
  dismissed: { color: colors.slate, fontSize: 12, lineHeight: 18 },
})
