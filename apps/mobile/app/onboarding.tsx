import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import {
  Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import type { HomeSummary, ProfessionalOrganization, ProfessionalTrade } from '../src/api/model.ts'
import { friendlyError } from '../src/api/errors.ts'
import { publicRoofingIntent, type PublicRoofingIntent } from '../src/auth/entry-intent.ts'
import { useSession } from '../src/auth/SessionProvider.tsx'
import { Body, Brand, Button, Card, Chip, Eyebrow, Loading, Notice, Page, TextField } from '../src/components/ui.tsx'
import { useResource } from '../src/hooks/useResource.ts'
import { PropertyDetailsReview } from '../src/components/PropertyDetailsReview.tsx'
import type { PropertyReviewSelection } from '../src/home/property-review.ts'
import {
  FirstCompanyNameConflict, FirstHomePropertySaveFailed, HOME_INTENTS, firstCompanyAttempt, firstHomeAttempt,
  firstRunProgress, firstRunRoloPrompt, firstRunUsesWideLayout, initialHomeIntent, previousFirstRunStep,
  reviewFirstCompany, reviewFirstHome,
  type FirstRunAttempt, type FirstRunStep, type FirstRunWorkspace, type HomeIntent,
  type ReviewedFirstCompany, type ReviewedFirstHome,
} from '../src/home/first-run.ts'
import { EMPTY_NEW_HOME_ADDRESS, type NewHomeAddressDraft } from '../src/home/onboarding.ts'
import { PROFESSIONAL_TRADES, tradeLabel } from '../src/professional/presentation.ts'
import { writeWorkspacePreference } from '../src/workspace/preference.ts'
import { colors, radius, space } from '../src/theme.ts'

const HEADINGS: Readonly<Record<FirstRunStep, { title: string; detail: string; note: string }>> = {
  welcome: {
    title: 'Your home,\nin one place.',
    detail: 'A little setup gives your home’s work, files, and people a place to belong.',
    note: 'Start with the space you need today. Home and company workspaces stay separate.',
  },
  reason: {
    title: 'What brings\nyou here?',
    detail: 'Pick a starting point. You don’t need to have it all figured out.',
    note: 'This just helps choose your first conversation. You can talk about something else at any time.',
  },
  'home-details': {
    title: 'Which home\nis this?',
    detail: 'Give this home a name and address so its records don’t get mixed up with another place.',
    note: 'Your address belongs to the private home record. Entering it does not publish it or contact a company.',
  },
  'home-review': {
    title: 'Your home.\nYour call.',
    detail: 'Check the details once before creating your private home workspace.',
    note: 'Nothing has been created yet. Use Back to change a detail, or create the home when you’re ready.',
  },
  'home-ready': {
    title: 'Your home\nis ready.',
    detail: 'You don’t need to fill everything in today. Start with the thing on your mind.',
    note: 'Talk it through, then review anything you choose to save as Work. You stay in charge of what happens next.',
  },
  'pro-details': {
    title: 'Meet your\ncompany space.',
    detail: 'Start with the basics. You can add contact details and more services later.',
    note: 'This creates a private draft, not a public listing. You’ll review publication separately in Homesrolo Pro.',
  },
  'pro-review': {
    title: 'A private draft.\nA clear start.',
    detail: 'Check the company name and service area before saving your workspace.',
    note: 'No homeowner will be contacted, and your company will not be published by this step.',
  },
  'pro-ready': {
    title: 'Your company\nhas a home.',
    detail: 'Your draft is saved. Open Homesrolo Pro to finish the company profile.',
    note: 'A company profile and a project invitation are separate. A homeowner decides which project details to share.',
  },
}

function ChoiceCard({ icon, title, detail, selected = false, onPress }: {
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly title: string
  readonly detail: string
  readonly selected?: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={detail}
      accessibilityState={{ selected }} onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}>
      <View style={[styles.choiceIcon, selected && styles.choiceIconSelected]}>
        <Ionicons name={icon} size={23} color={selected ? colors.ink : colors.lime} />
      </View>
      <View style={styles.choiceCopy}><Text style={styles.choiceTitle}>{title}</Text><Text style={styles.choiceDetail}>{detail}</Text></View>
      <Ionicons name={selected ? 'checkmark-circle' : 'chevron-forward'} size={21} color={colors.lime} />
    </Pressable>
  )
}

function PrivacyPoint({ icon, title, children }: {
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <View style={styles.privacyPoint}>
      <Ionicons name={icon} size={20} color={colors.lime} />
      <View style={styles.choiceCopy}><Text style={styles.pointTitle}>{title}</Text><Text style={styles.choiceDetail}>{children}</Text></View>
    </View>
  )
}

export default function OnboardingScreen() {
  const { mode, intent } = useLocalSearchParams<{ mode?: string | string[]; intent?: string | string[] }>()
  const { state: auth, refreshSession } = useSession()
  if (auth.kind === 'loading') return <Loading label="Opening Homesrolo…" />
  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }
  return (
    <FirstRunFlow key={auth.session.principalRef} principalRef={auth.session.principalRef}
      initialWorkspace={mode === 'home' || mode === 'pro' ? mode : null}
      entryIntent={publicRoofingIntent(intent)}
      professionalEnabled={auth.session.capabilities.invitations && auth.session.capabilities.projectQuotes}
      assistantEnabled={auth.session.capabilities.homeAssistant} />
  )
}

function FirstRunFlow({ principalRef, initialWorkspace, entryIntent, professionalEnabled, assistantEnabled }: {
  readonly principalRef: string
  readonly initialWorkspace: FirstRunWorkspace | null
  readonly entryIntent: PublicRoofingIntent | null
  readonly professionalEnabled: boolean
  readonly assistantEnabled: boolean
}) {
  const { api, privateContentVisible } = useSession()
  const [availableWidth, setAvailableWidth] = useState(0)
  const wide = firstRunUsesWideLayout(availableWidth)
  const scroll = useRef<ScrollView>(null)
  const active = useRef(true)
  const actionBusy = useRef(false)
  const visible = useRef(privateContentVisible)
  visible.current = privateContentVisible
  const [step, setStep] = useState<FirstRunStep>('welcome')
  const [workspace, setWorkspace] = useState<FirstRunWorkspace | null>(initialWorkspace)
  const [homeIntent, setHomeIntent] = useState<HomeIntent | null>(() => initialHomeIntent(entryIntent))
  // Sensitive address drafts stay in this principal-keyed component, never in
  // local/session storage. Same-principal cookie checks leave it mounted.
  const [address, setAddress] = useState<NewHomeAddressDraft>({ ...EMPTY_NEW_HOME_ADDRESS })
  const [homeLabel, setHomeLabel] = useState('My home')
  const [companyName, setCompanyName] = useState('')
  const [trade, setTrade] = useState<ProfessionalTrade>('roofing')
  const [serviceArea, setServiceArea] = useState('')
  const [homeReview, setHomeReview] = useState<ReviewedFirstHome | null>(null)
  const [propertySelection, setPropertySelection] = useState<PropertyReviewSelection>({ kind: 'none' })
  const [propertySaveFailed, setPropertySaveFailed] = useState(false)
  const [companyReview, setCompanyReview] = useState<ReviewedFirstCompany | null>(null)
  const [createdHome, setCreatedHome] = useState<HomeSummary | null>(null)
  const [createdCompany, setCreatedCompany] = useState<ProfessionalOrganization | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const homeAttempt = useRef<FirstRunAttempt<HomeSummary> | null>(null)
  const companyAttempt = useRef<FirstRunAttempt<ProfessionalOrganization> | null>(null)

  const loadSpaces = useCallback(async () => {
    const [homes, profile] = await Promise.all([
      api.listHomes(), professionalEnabled ? api.getProfessionalProfile() : Promise.resolve(null),
    ])
    const organizations = profile?.organizations.filter(organization =>
      organization.publicationState !== 'suspended'
      && profile.memberships.some(membership => membership.organizationRef === organization.organizationRef
        && membership.state === 'active')) ?? []
    return { homes, organizations }
  }, [api, professionalEnabled])
  const spaces = useResource(loadSpaces)

  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }) }, [step])

  const locked = homeAttempt.current !== null || companyAttempt.current !== null
  const ready = step === 'home-ready' || step === 'pro-ready'
  const progress = firstRunProgress(step, workspace)
  const previousStep = previousFirstRunStep(step)
  const heading = HEADINGS[step]
  const starter = firstRunRoloPrompt(homeIntent ?? 'organize', entryIntent)
  const intentLabel = HOME_INTENTS.find(intent => intent.value === homeIntent)?.label

  function go(next: FirstRunStep) {
    if (!visible.current || actionBusy.current || locked) return
    Keyboard.dismiss()
    setError(null)
    setStep(next)
  }
  function chooseWorkspace(next: FirstRunWorkspace) {
    if (next === 'pro' && !professionalEnabled) return
    if (!visible.current || actionBusy.current || locked) return
    setWorkspace(next)
    go(next === 'home' ? 'reason' : 'pro-details')
  }
  function reviewHome() {
    if (locked) return
    const reviewed = reviewFirstHome(homeLabel, address)
    if (!reviewed.ok) { setError(reviewed.message); return }
    setPropertySelection({ kind: 'none' })
    setHomeReview(reviewed.value)
    go('home-review')
  }
  function reviewCompany() {
    if (locked || !professionalEnabled) return
    const reviewed = reviewFirstCompany(companyName, trade, serviceArea)
    if (!reviewed.ok) { setError(reviewed.message); return }
    setCompanyReview(reviewed.value)
    go('pro-review')
  }

  async function finishHome() {
    if (step !== 'home-review' || !homeReview || !visible.current || actionBusy.current) return
    if (propertySelection.kind === 'pending' || propertySelection.kind === 'invalid') return
    actionBusy.current = true
    setBusy(true)
    setError(null)
    setPropertySaveFailed(false)
    homeAttempt.current ??= firstHomeAttempt(homeReview, propertySelection.kind === 'reviewed' ? propertySelection.value : undefined)
    try {
      const home = await homeAttempt.current.run(api)
      if (!active.current) return
      await writeWorkspacePreference(principalRef, 'home')
      if (!active.current) return
      setCreatedHome(home)
      setAddress({ ...EMPTY_NEW_HOME_ADDRESS })
      setHomeReview(null)
      setStep('home-ready')
    } catch (caught) {
      if (active.current) {
        setPropertySaveFailed(caught instanceof FirstHomePropertySaveFailed)
        setError(caught instanceof FirstHomePropertySaveFailed ? caught.message : friendlyError(caught))
      }
    } finally {
      actionBusy.current = false
      if (active.current) setBusy(false)
    }
  }
  async function finishCompany() {
    if (step !== 'pro-review' || !companyReview || !professionalEnabled || !visible.current || actionBusy.current) return
    actionBusy.current = true
    setBusy(true)
    setError(null)
    companyAttempt.current ??= firstCompanyAttempt(companyReview)
    try {
      const company = await companyAttempt.current.run(api)
      if (!active.current) return
      await writeWorkspacePreference(principalRef, 'pro')
      if (!active.current) return
      setCreatedCompany(company)
      setCompanyReview(null)
      setStep('pro-ready')
    } catch (caught) {
      if (!active.current) return
      if (caught instanceof FirstCompanyNameConflict) {
        companyAttempt.current = null
        setCompanyReview(null)
        setStep('pro-details')
        setError(caught.message)
      } else setError(friendlyError(caught))
    } finally {
      actionBusy.current = false
      if (active.current) setBusy(false)
    }
  }
  async function openHome(home: HomeSummary, withStarter: boolean) {
    if (!visible.current || actionBusy.current) return
    actionBusy.current = true
    await writeWorkspacePreference(principalRef, 'home')
    if (active.current && visible.current) router.replace({
      pathname: assistantEnabled ? '/home/[homeId]/rolo' : '/home/[homeId]/care',
      params: { homeId: home.homeRef, ...(withStarter && assistantEnabled ? { prompt: starter } : {}) },
    })
    actionBusy.current = false
  }
  async function openPro() {
    if (!professionalEnabled || !visible.current || actionBusy.current) return
    actionBusy.current = true
    await writeWorkspacePreference(principalRef, 'pro')
    if (active.current && visible.current) router.replace('/pro')
    actionBusy.current = false
  }

  const form = spaces.state.kind === 'loading' ? <Loading label="Finding your saved spaces…" />
    : spaces.state.kind === 'error' ? (
      <Notice message="We couldn’t check for an existing home or company. Try again before starting a new one." actionLabel="Try again" onAction={spaces.reload} />
    ) : (
      <>
        {step === 'welcome' ? (
          <>
            {spaces.state.value.homes.length > 0 || spaces.state.value.organizations.length > 0 ? (
              <Card>
                <Eyebrow>Already saved for this account</Eyebrow>
                <Text style={styles.sectionTitle}>Pick up where you left off.</Text>
                <Text style={styles.choiceDetail}>If setup was interrupted, open the saved space before creating another.</Text>
                {spaces.state.value.homes.map(home => <Button key={home.homeRef} label={`Open ${home.displayLabel}`} icon="home-outline" quiet onPress={() => void openHome(home, Boolean(entryIntent))} />)}
                {spaces.state.value.organizations.length > 0 ? <Button label="Open my company workspace" icon="briefcase-outline" quiet onPress={() => void openPro()} /> : null}
              </Card>
            ) : null}
            <Eyebrow>{spaces.state.value.homes.length || spaces.state.value.organizations.length ? 'Or set up another space' : 'Where would you like to start?'}</Eyebrow>
            <ChoiceCard icon="home-outline" title="My home" detail="A private place for repairs, plans, files, and the people who help." selected={workspace === 'home'} onPress={() => chooseWorkspace('home')} />
            {professionalEnabled ? <ChoiceCard icon="briefcase-outline" title="My company" detail="A company profile, homeowner invitations, and project proposals." selected={workspace === 'pro'} onPress={() => chooseWorkspace('pro')} /> : null}
            {initialWorkspace === 'pro' && !professionalEnabled ? <Text style={styles.smallPrint}>Company setup isn’t available for this account. You can still set up your home.</Text> : null}
            <View style={styles.quietBadge}><Ionicons name="lock-closed-outline" color={colors.mint} size={16} /><Text style={styles.smallPrint}>Private by default. Separate spaces. One sign-in.</Text></View>
          </>
        ) : null}
        {step === 'reason' ? (
          <>
            {HOME_INTENTS.map(intent => <ChoiceCard key={intent.value} icon={intent.icon} title={intent.label} detail={intent.detail} selected={homeIntent === intent.value} onPress={() => { setHomeIntent(intent.value); setError(null) }} />)}
            <Button label="Continue" icon="arrow-forward" disabled={!homeIntent} onPress={() => go('home-details')} />
            <Text style={styles.smallPrint}>Only a starting point—not a project, request, or message.</Text>
          </>
        ) : null}
        {step === 'home-details' ? (
          <Card style={styles.formCard}>
            <Eyebrow>Your private home record</Eyebrow>
            <TextField label="Home name" value={homeLabel} onChangeText={value => { setHomeLabel(value); setError(null) }} placeholder="My home" hint="Something you’ll recognize, like My home or Lake house." maxLength={80} returnKeyType="next" />
            <TextField label="Street address" value={address.line1} onChangeText={line1 => { setAddress(current => ({ ...current, line1 })); setError(null) }} autoComplete="street-address" textContentType="streetAddressLine1" placeholder="123 Main Street" maxLength={120} returnKeyType="next" />
            <TextField label="Unit or building, optional" value={address.line2} onChangeText={line2 => { setAddress(current => ({ ...current, line2 })); setError(null) }} textContentType="streetAddressLine2" maxLength={120} returnKeyType="next" />
            <TextField label="City" value={address.city} onChangeText={city => { setAddress(current => ({ ...current, city })); setError(null) }} textContentType="addressCity" maxLength={80} returnKeyType="next" />
            <View style={styles.fieldRow}>
              <View style={styles.stateField}><TextField label="State" value={address.regionCode} onChangeText={regionCode => { setAddress(current => ({ ...current, regionCode: regionCode.toUpperCase() })); setError(null) }} textContentType="addressState" autoCapitalize="characters" maxLength={2} placeholder="TX" /></View>
              <View style={styles.zipField}><TextField label="ZIP code" value={address.postalCode} onChangeText={postalCode => { setAddress(current => ({ ...current, postalCode })); setError(null) }} textContentType="postalCode" autoComplete="postal-code" keyboardType="numbers-and-punctuation" maxLength={10} placeholder="76102" returnKeyType="done" onSubmitEditing={reviewHome} /></View>
            </View>
            <Text style={styles.smallPrint}>United States addresses. This does not verify ownership.</Text>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Button label="Review my home" icon="arrow-forward" onPress={reviewHome} />
            <Text style={styles.smallPrint}>You’ll review before anything is created.</Text>
          </Card>
        ) : null}
        {step === 'home-review' && homeReview ? (
          <>
            <Card style={styles.reviewCard}>
              <View style={styles.reviewHeading}><View style={styles.reviewIcon}><Ionicons name="home-outline" size={27} color={colors.ink} /></View><View style={styles.choiceCopy}><Eyebrow>Ready to create</Eyebrow><Text style={styles.reviewTitle}>{homeReview.label}</Text></View></View>
              <View style={styles.addressBlock}>
                <Text style={styles.reviewLine}>{homeReview.address.address.line1}</Text>
                {homeReview.address.address.line2 ? <Text style={styles.reviewLine}>{homeReview.address.address.line2}</Text> : null}
                <Text style={styles.reviewLine}>{homeReview.address.address.city}, {homeReview.address.address.regionCode} {homeReview.address.address.postalCode}</Text>
              </View>
              {intentLabel ? <Text style={styles.smallPrint}>Starting with: {intentLabel}</Text> : null}
            </Card>
            <PropertyDetailsReview principalRef={principalRef} address={homeReview.address.address}
              disabled={locked || busy} onChange={setPropertySelection} />
            <Card style={styles.privacyCard}>
              <PrivacyPoint icon="lock-closed-outline" title="Private, not public">Your home and address are not a public listing.</PrivacyPoint>
              <PrivacyPoint icon="people-outline" title="Sharing is your choice">Invite an adult to your household later. Companies receive only the project access you choose to share.</PrivacyPoint>
              <PrivacyPoint icon="chatbubble-ellipses-outline" title="A conversation, not an order">Starting Rolo doesn’t contact a company, hire anyone, or send a message on your behalf.</PrivacyPoint>
            </Card>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Button label={busy ? 'Creating your home…' : locked ? 'Retry this home setup' : 'Create my home'} icon="checkmark" disabled={busy || propertySelection.kind === 'pending' || propertySelection.kind === 'invalid'} onPress={() => void finishHome()} />
          </>
        ) : null}
        {step === 'home-ready' && createdHome ? (
          <>
            <Card style={styles.successCard}>
              <View style={styles.successIcon}><Ionicons name="checkmark" size={30} color={colors.ink} /></View>
              <Eyebrow>Home saved</Eyebrow><Text style={styles.reviewTitle}>{createdHome.displayLabel}</Text>
              <Body muted>Your private record is ready for the work, files, and people you choose to add.</Body>
            </Card>
            {assistantEnabled ? (
              <Card><Eyebrow>A starting point for Rolo</Eyebrow><Text style={styles.starter}>“{starter}”</Text><Text style={styles.smallPrint}>This will appear in the message box. Edit it or send it when you’re ready.</Text></Card>
            ) : null}
            <Button label={assistantEnabled ? 'Start with Rolo' : 'Open my home'} icon={assistantEnabled ? 'chatbubble-ellipses-outline' : 'home-outline'} onPress={() => void openHome(createdHome, true)} />
            {assistantEnabled ? <Button label="Open Rolo without a starter" quiet onPress={() => void openHome(createdHome, false)} /> : null}
          </>
        ) : null}
        {step === 'pro-details' && professionalEnabled ? (
          <Card style={styles.formCard}>
            <Eyebrow>Your company basics</Eyebrow>
            <TextField label="Company name" value={companyName} onChangeText={value => { setCompanyName(value); setError(null) }} placeholder="Clear Water Pools" maxLength={120} returnKeyType="next" />
            <Text style={styles.fieldLabel}>Main service</Text>
            <View style={styles.chips}>{PROFESSIONAL_TRADES.map(([value, label]) => <Chip key={value} label={label} selected={trade === value} onPress={() => { setTrade(value); setError(null) }} />)}</View>
            <TextField label="Service area" value={serviceArea} onChangeText={value => { setServiceArea(value); setError(null) }} placeholder="Fort Worth, Texas" hint="One city, metro, county, or region is enough to start." maxLength={80} returnKeyType="done" onSubmitEditing={reviewCompany} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Button label="Review company draft" icon="arrow-forward" onPress={reviewCompany} />
            <Text style={styles.smallPrint}>No public contact information is required to create a draft.</Text>
          </Card>
        ) : null}
        {step === 'pro-review' && companyReview && professionalEnabled ? (
          <>
            <Card style={styles.reviewCard}>
              <View style={styles.reviewHeading}><View style={styles.reviewIcon}><Ionicons name="briefcase-outline" size={26} color={colors.ink} /></View><View style={styles.choiceCopy}><Eyebrow>Private company draft</Eyebrow><Text style={styles.reviewTitle}>{companyReview.displayName}</Text></View></View>
              <Text style={styles.reviewLine}>{tradeLabel(companyReview.trade)}</Text><Text style={styles.reviewLine}>{companyReview.serviceArea}</Text>
            </Card>
            <Card style={styles.privacyCard}>
              <PrivacyPoint icon="eye-off-outline" title="Not published">You’ll review the company profile before choosing whether to publish it.</PrivacyPoint>
              <PrivacyPoint icon="document-text-outline" title="Invitations come first">Homeowners choose when to invite your company into a specific project. Creating a profile is not an accepted job.</PrivacyPoint>
            </Card>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Button label={busy ? 'Saving your company…' : locked ? 'Retry this company setup' : 'Create private company draft'} icon="checkmark" disabled={busy} onPress={() => void finishCompany()} />
          </>
        ) : null}
        {step === 'pro-ready' && createdCompany ? (
          <>
            <Card style={styles.successCard}>
              <View style={styles.successIcon}><Ionicons name="checkmark" size={30} color={colors.ink} /></View>
              <Eyebrow>Saved as a private draft</Eyebrow><Text style={styles.reviewTitle}>{createdCompany.displayName}</Text>
              <Body muted>Review your profile, add the details you want homeowners to see, and choose when to publish.</Body>
            </Card>
            <Button label="Open Homesrolo Pro" icon="arrow-forward" onPress={() => void openPro()} />
          </>
        ) : null}
        {workspace === 'pro' && !professionalEnabled && step !== 'welcome' ? <Notice message="Company setup is no longer available for this account." actionLabel="Open account" onAction={() => router.replace('/account')} /> : null}
        {locked && !busy && !ready ? (
          <Card><Text style={styles.choiceDetail}>{propertySaveFailed
            ? 'Leaving or reloading discards this unsaved property review. Retry here to keep it. You can also look up and review missing property details later from Home details.'
            : 'Your reviewed details are held for this attempt. Retry finishes the same setup. If you leave, check your saved spaces before starting another.'}</Text><Button label={propertySaveFailed ? 'Leave review and check saved spaces' : 'Check my saved spaces'} quiet onPress={() => router.replace('/start')} /></Card>
        ) : null}
      </>
    )

  return (
    <SafeAreaView style={styles.fill} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
        <ScrollView ref={scroll} style={styles.fill} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          <View style={styles.shell} onLayout={event => setAvailableWidth(event.nativeEvent.layout.width)}>
            <View style={styles.topRow}><Brand compact /><Text style={styles.setupLabel}>{ready ? 'READY WHEN YOU ARE' : 'LET’S GET STARTED'}</Text></View>
            <View style={styles.progressRow}>
              {previousStep && !locked ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => go(previousStep)} style={styles.back}><Ionicons name="arrow-back" size={18} color={colors.cream} /><Text style={styles.backText}>Back</Text></Pressable>
                : <View style={styles.back}><Ionicons name={ready ? 'checkmark-circle-outline' : 'lock-closed-outline'} size={17} color={colors.mint} /><Text style={styles.backText}>{ready ? 'Saved' : 'Private setup'}</Text></View>}
              <View style={styles.progressCopy} accessibilityRole="progressbar" accessibilityLabel="Setup progress" accessibilityValue={{ min: 1, max: progress.total, now: progress.current, text: `Step ${progress.current} of ${progress.total}` }}>
                <Text style={styles.progress}>Step {progress.current} of {progress.total}</Text>
                <View style={styles.progressTrack}>{Array.from({ length: progress.total }, (_, index) => <View key={index} style={[styles.progressSegment, index < progress.current && styles.progressComplete]} />)}</View>
              </View>
            </View>
            <View style={[styles.content, wide && styles.contentWide]}>
              <View style={[styles.hero, wide && styles.heroWide]}>
                <Eyebrow>{ready ? 'Welcome in' : workspace === 'pro' ? 'Homesrolo Pro' : 'A place for your home'}</Eyebrow>
                <Text accessibilityRole="header" style={[styles.title, wide && styles.titleWide]}>{heading.title}</Text>
                <Text style={styles.description}>{heading.detail}</Text>
                <View style={styles.roloNote}><View style={styles.roloAvatar}><Ionicons name="sparkles" size={17} color={colors.ink} /></View><View style={styles.choiceCopy}><Text style={styles.roloName}>A little guidance</Text><Text style={styles.note}>{locked && !ready ? 'We’re keeping this same reviewed setup together. Retry continues this attempt instead of starting another.' : heading.note}</Text></View></View>
              </View>
              <View style={[styles.form, wide && styles.formWide]}>{form}</View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  page: { flexGrow: 1, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 40 },
  shell: { width: '100%', maxWidth: 1080, alignSelf: 'center', gap: space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm },
  setupLabel: { color: colors.smoke, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg, paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { color: colors.slate, fontSize: 12, fontWeight: '700' },
  progressCopy: { width: 128, gap: 7 },
  progress: { color: colors.slate, fontSize: 11, fontWeight: '800', textAlign: 'right' },
  progressTrack: { flexDirection: 'row', gap: 4 },
  progressSegment: { flex: 1, height: 3, backgroundColor: colors.line, borderRadius: 4 },
  progressComplete: { backgroundColor: colors.lime },
  content: { gap: space.xl },
  contentWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 52, paddingTop: 30 },
  hero: { gap: space.sm },
  heroWide: { flex: 0.85, paddingTop: space.md },
  title: { color: colors.cream, fontSize: 35, lineHeight: 39, fontWeight: '900', letterSpacing: -1.4 },
  titleWide: { fontSize: 49, lineHeight: 53, letterSpacing: -2 },
  description: { color: colors.slate, fontSize: 15, lineHeight: 23, maxWidth: 480 },
  roloNote: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingTop: space.sm, maxWidth: 480 },
  roloAvatar: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  roloName: { color: colors.mint, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  note: { color: colors.smoke, fontSize: 12, lineHeight: 18 },
  form: { gap: space.md, width: '100%', maxWidth: 620, alignSelf: 'center' },
  formWide: { flex: 1.15 },
  formCard: { padding: space.lg, gap: 18 },
  choice: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.large, padding: space.md },
  choiceSelected: { borderColor: colors.lime, backgroundColor: colors.inkSoft },
  pressed: { opacity: 0.85 },
  choiceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.inkSoft },
  choiceIconSelected: { backgroundColor: colors.lime },
  choiceCopy: { flex: 1, gap: 4 },
  choiceTitle: { color: colors.cream, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  choiceDetail: { color: colors.slate, fontSize: 13, lineHeight: 19 },
  quietBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 4 },
  smallPrint: { color: colors.smoke, fontSize: 12, lineHeight: 18, flexShrink: 1 },
  fieldRow: { flexDirection: 'row', gap: space.sm },
  stateField: { flex: 0.7, minWidth: 76 },
  zipField: { flex: 1.3, minWidth: 100 },
  fieldLabel: { color: colors.slate, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  sectionTitle: { color: colors.cream, fontSize: 19, lineHeight: 24, fontWeight: '800' },
  reviewCard: { borderColor: colors.lime, padding: space.lg, gap: space.md },
  reviewHeading: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  reviewIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  reviewTitle: { color: colors.cream, fontSize: 24, lineHeight: 29, fontWeight: '900', letterSpacing: -0.6 },
  reviewLine: { color: colors.cream, fontSize: 15, lineHeight: 22 },
  addressBlock: { gap: 2 },
  privacyCard: { gap: space.lg, padding: space.lg },
  privacyPoint: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  pointTitle: { color: colors.cream, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  successCard: { padding: space.lg, gap: space.md, borderColor: colors.lime },
  successIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  starter: { color: colors.cream, fontSize: 16, lineHeight: 24 },
})
