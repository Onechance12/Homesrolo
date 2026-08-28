import { type ReactNode, useMemo, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import type { ProfessionalTrade } from '../src/api/model.ts'
import { NativeApiError } from '../src/api/client.ts'
import { friendlyError } from '../src/api/errors.ts'
import { useSession } from '../src/auth/SessionProvider.tsx'
import {
  Body,
  Brand,
  Button,
  Card,
  Chip,
  Eyebrow,
  Loading,
  Notice,
  Page,
  TextField,
} from '../src/components/ui.tsx'
import { createReviewedHome } from '../src/home/create-home.ts'
import {
  EMPTY_NEW_HOME_ADDRESS,
  reviewNewHomeAddress,
  type NewHomeAddressDraft,
} from '../src/home/onboarding.ts'
import { PROFESSIONAL_TRADES, slugFor } from '../src/professional/presentation.ts'
import { writeWorkspacePreference } from '../src/workspace/preference.ts'
import { colors, radius, space } from '../src/theme.ts'

type WorkspaceChoice = 'home' | 'pro'
type HomeIntent = 'attention' | 'plan' | 'care' | 'organize'

const HOME_INTENTS: readonly {
  readonly value: HomeIntent
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly label: string
  readonly detail: string
}[] = [
  { value: 'attention', icon: 'warning-outline', label: 'Something needs attention', detail: 'A problem, repair, or safety concern' },
  { value: 'plan', icon: 'color-wand-outline', label: 'I’m planning something', detail: 'A pool, remodel, upgrade, or larger idea' },
  { value: 'care', icon: 'calendar-outline', label: 'Keep up with my home', detail: 'Maintenance, service, filters, and checkups' },
  { value: 'organize', icon: 'home-outline', label: 'Start my home Rolo', detail: 'Bring the history, files, and people together' },
]

const ROLO_PROMPTS: Readonly<Record<HomeIntent, string>> = {
  attention: 'Something at my home needs attention. Help me figure out the safest next step.',
  plan: 'I am planning work at my home. Help me turn the idea into a clear plan.',
  care: 'Help me decide what routine care or maintenance should come first for this home.',
  organize: 'Help me start organizing the useful history and details for this home.',
}

function oneParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null
}

function RoloMessage({ children }: { readonly children: ReactNode }) {
  return (
    <View style={styles.messageRow}>
      <View style={styles.roloAvatar}>
        <Ionicons name="sparkles" size={18} color={colors.ink} />
      </View>
      <View style={styles.roloBubble}>
        <Text style={styles.roloName}>Rolo</Text>
        <Text style={styles.roloMessage}>{children}</Text>
      </View>
    </View>
  )
}

function ChoiceCard({ icon, title, detail, onPress }: {
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly title: string
  readonly detail: string
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
    >
      <View style={styles.choiceIcon}><Ionicons name={icon} size={23} color={colors.ink} /></View>
      <View style={styles.choiceCopy}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.lime} />
    </Pressable>
  )
}

export default function OnboardingScreen() {
  const { mode: rawMode } = useLocalSearchParams<{ mode?: string | string[] }>()
  const requestedMode = oneParam(rawMode)
  const initialWorkspace = requestedMode === 'home' || requestedMode === 'pro'
    ? requestedMode
    : null
  const { state: auth, api, refreshSession } = useSession()
  const [workspace, setWorkspace] = useState<WorkspaceChoice | null>(initialWorkspace)
  const [homeIntent, setHomeIntent] = useState<HomeIntent>('attention')
  const [address, setAddress] = useState<NewHomeAddressDraft>({ ...EMPTY_NEW_HOME_ADDRESS })
  const [homeLabel, setHomeLabel] = useState('My home')
  const [companyName, setCompanyName] = useState('')
  const [trade, setTrade] = useState<ProfessionalTrade>('roofing')
  const [serviceArea, setServiceArea] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const commandRefs = useRef<{
    readonly intent: string
    readonly first: string
    readonly second: string
  } | null>(null)

  const progress = useMemo(() => workspace ? '2 of 2' : '1 of 2', [workspace])

  if (auth.kind === 'loading') return <Loading label="Opening Homesrolo…" />
  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }
  const principalRef = auth.session.principalRef
  const professionalEnabled = auth.session.capabilities.invitations
    && auth.session.capabilities.projectQuotes

  function changeAddress(patch: Partial<NewHomeAddressDraft>) {
    setAddress(current => ({ ...current, ...patch }))
    commandRefs.current = null
    setError(null)
  }

  async function finishHome() {
    const review = reviewNewHomeAddress(address)
    if (!review.ok) {
      setError(review.message)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const intent = JSON.stringify({ label: homeLabel.trim(), address: review.value.address })
      if (!commandRefs.current || commandRefs.current.intent !== intent) {
        commandRefs.current = {
          intent,
          first: await api.newCommandRef(),
          second: await api.newCommandRef(),
        }
      }
      const home = await createReviewedHome(api, {
        label: homeLabel,
        reviewedAddress: review.value,
        createCommandRef: commandRefs.current.first,
        recordCommandRef: commandRefs.current.second,
      })
      await writeWorkspacePreference(principalRef, 'home')
      commandRefs.current = null
      router.replace({
        pathname: '/home/[homeId]/rolo',
        params: { homeId: home.homeRef, prompt: ROLO_PROMPTS[homeIntent] },
      })
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function finishPro() {
    const displayName = companyName.trim()
    const area = serviceArea.trim()
    if (!displayName) {
      setError('Add the company name homeowners should see.')
      return
    }
    if (!area) {
      setError('Add the city, metro, or region you serve.')
      return
    }
    const slug = slugFor(displayName)
    if (slug.length < 3) {
      setError('Use a more complete company name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const intent = JSON.stringify({ displayName, slug, trade, area })
      if (!commandRefs.current || commandRefs.current.intent !== intent) {
        commandRefs.current = {
          intent,
          first: await api.newCommandRef(),
          second: await api.newCommandRef(),
        }
      }
      const created = await api.createProfessionalOrganization({
        commandRef: commandRefs.current.first,
        displayName,
        slug,
      })
      await api.saveProfessionalProfile({
        commandRef: commandRefs.current.second,
        organizationRef: created.organization.organizationRef,
        expectedRevision: created.organization.revision,
        displayName,
        legalName: null,
        description: null,
        publicPhone: null,
        publicEmail: null,
        websiteUrl: null,
        logoUrl: null,
        trades: [trade],
        serviceAreas: [area],
        publicationState: 'draft',
      })
      await writeWorkspacePreference(principalRef, 'pro')
      commandRefs.current = null
      router.replace('/pro')
    } catch (caught) {
      setError(caught instanceof NativeApiError && caught.code === 'conflict'
        ? 'That company page name is already in use. Add your city or another distinguishing word to the company name and try again.'
        : friendlyError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Page>
        <View style={styles.topRow}>
          <Brand compact />
          <Text style={styles.progress}>Setup {progress}</Text>
        </View>

        {!workspace ? (
          <>
            <RoloMessage>
              Let’s make this useful from the first tap. Are you here for your home, or for a home-service company?
            </RoloMessage>
            <View style={styles.choiceStack}>
              <ChoiceCard
                icon="home-outline"
                title="My home"
                detail="Get help, plan work, hire safely, and keep what matters"
                onPress={() => setWorkspace('home')}
              />
              {professionalEnabled ? (
                <ChoiceCard
                  icon="briefcase-outline"
                  title="My company"
                  detail="Receive homeowner invitations and manage proposals"
                  onPress={() => setWorkspace('pro')}
                />
              ) : null}
            </View>
            <Text style={styles.privacy}>
              {professionalEnabled
                ? 'One private sign-in. Separate spaces for home and work.'
                : 'One private sign-in. Your home stays under your control.'}
            </Text>
          </>
        ) : null}

        {workspace === 'home' ? (
          <>
            <RoloMessage>
              Good. Tell me why you opened Homesrolo, then add the home once. I’ll take you straight into the right conversation.
            </RoloMessage>
            <Card>
              <Eyebrow>What brings you here?</Eyebrow>
              <View style={styles.intentGrid}>
                {HOME_INTENTS.map(intent => (
                  <Pressable
                    key={intent.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: homeIntent === intent.value }}
                    onPress={() => setHomeIntent(intent.value)}
                    style={[styles.intent, homeIntent === intent.value && styles.intentSelected]}
                  >
                    <Ionicons name={intent.icon} size={20} color={homeIntent === intent.value ? colors.ink : colors.aqua} />
                    <Text style={[styles.intentTitle, homeIntent === intent.value && styles.intentTitleSelected]}>{intent.label}</Text>
                    <Text style={[styles.intentDetail, homeIntent === intent.value && styles.intentDetailSelected]}>{intent.detail}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
            <Card accent>
              <View style={styles.cardHeading}>
                <Eyebrow>Your home</Eyebrow>
                <Text style={styles.cardTitle}>Where should Rolo keep this?</Text>
              </View>
              <TextField label="Street address" value={address.line1} onChangeText={line1 => changeAddress({ line1 })} autoComplete="street-address" placeholder="123 Main Street" maxLength={120} />
              <TextField label="Unit, optional" value={address.line2} onChangeText={line2 => changeAddress({ line2 })} maxLength={120} />
              <TextField label="City" value={address.city} onChangeText={city => changeAddress({ city })} maxLength={80} />
              <View style={styles.fieldRow}>
                <TextField label="State" value={address.regionCode} onChangeText={regionCode => changeAddress({ regionCode: regionCode.toUpperCase().slice(0, 2) })} autoCapitalize="characters" maxLength={2} placeholder="TX" style={styles.stateField} />
                <TextField label="ZIP" value={address.postalCode} onChangeText={postalCode => changeAddress({ postalCode })} keyboardType="number-pad" maxLength={10} placeholder="76102" style={styles.zipField} />
              </View>
              <TextField label="Home name" value={homeLabel} onChangeText={setHomeLabel} placeholder="My home" maxLength={80} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button label={busy ? 'Opening your home…' : 'Open my home'} onPress={() => void finishHome()} disabled={busy} icon="arrow-forward" />
            </Card>
          </>
        ) : null}

        {workspace === 'pro' && professionalEnabled ? (
          <>
            <RoloMessage>
              I’ll set up the company workspace. Homeowners will see a clear company card; invitations and proposals stay on the Pro side.
            </RoloMessage>
            <Card accent>
              <View style={styles.cardHeading}>
                <Eyebrow>Company workspace</Eyebrow>
                <Text style={styles.cardTitle}>The basics are enough to start.</Text>
              </View>
              <TextField label="Company name" value={companyName} onChangeText={value => { setCompanyName(value); commandRefs.current = null; setError(null) }} placeholder="Clear Water Pools" maxLength={120} />
              <Text style={styles.fieldLabel}>Main service</Text>
              <View style={styles.chips}>
                {PROFESSIONAL_TRADES.map(([value, label]) => (
                  <Chip key={value} label={label} selected={trade === value} onPress={() => { setTrade(value); commandRefs.current = null }} />
                ))}
              </View>
              <TextField label="Service area" value={serviceArea} onChangeText={value => { setServiceArea(value); commandRefs.current = null; setError(null) }} placeholder="Fort Worth, Texas" hint="A city, metro, county, or region is fine." maxLength={80} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button label={busy ? 'Building your workspace…' : 'Open Homesrolo Pro'} onPress={() => void finishPro()} disabled={busy} icon="arrow-forward" />
            </Card>
          </>
        ) : null}

        {workspace === 'pro' && !professionalEnabled ? (
          <Card>
            <Notice message="The company workspace is not available for this account." />
            <Button label="Set up my home" icon="home-outline" onPress={() => setWorkspace('home')} />
          </Card>
        ) : null}

        {workspace && (!initialWorkspace || (workspace === 'pro' && !professionalEnabled)) ? (
          <Button label="Choose a different setup" quiet onPress={() => { setWorkspace(null); setError(null); commandRefs.current = null }} />
        ) : null}
      </Page>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progress: { color: colors.smoke, fontSize: 12, fontWeight: '800' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: space.md },
  roloAvatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.lime,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  roloBubble: {
    flex: 1, backgroundColor: colors.inkSoft, borderRadius: 4,
    borderTopRightRadius: radius.large, borderBottomLeftRadius: radius.large,
    borderBottomRightRadius: radius.large, padding: space.md, gap: 4,
  },
  roloName: { color: colors.lime, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.1 },
  roloMessage: { color: colors.cream, fontSize: 18, lineHeight: 26, fontWeight: '700' },
  choiceStack: { gap: space.sm, marginTop: space.sm },
  choice: {
    minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.large, padding: space.md,
  },
  choicePressed: { borderColor: colors.lime, transform: [{ scale: 0.99 }] },
  choiceIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime },
  choiceCopy: { flex: 1, gap: 3 },
  choiceTitle: { color: colors.cream, fontSize: 18, fontWeight: '900' },
  choiceDetail: { color: colors.slate, fontSize: 13, lineHeight: 18 },
  privacy: { color: colors.smoke, fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: space.md },
  intentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  intent: {
    width: '48%', minHeight: 122, borderRadius: radius.medium, borderWidth: 1,
    borderColor: colors.line, backgroundColor: colors.ink, padding: 12, gap: 6,
  },
  intentSelected: { backgroundColor: colors.lime, borderColor: colors.lime },
  intentTitle: { color: colors.cream, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  intentTitleSelected: { color: colors.ink },
  intentDetail: { color: colors.slate, fontSize: 11, lineHeight: 15 },
  intentDetailSelected: { color: colors.inkSoft },
  cardHeading: { gap: 3, marginBottom: 2 },
  cardTitle: { color: colors.cream, fontSize: 22, lineHeight: 27, fontWeight: '900' },
  fieldRow: { flexDirection: 'row', gap: space.sm },
  stateField: { minWidth: 86 },
  zipField: { minWidth: 140 },
  fieldLabel: { color: colors.slate, fontSize: 12, fontWeight: '800', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, fontWeight: '700' },
})
