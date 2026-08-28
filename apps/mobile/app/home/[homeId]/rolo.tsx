import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type {
  ArtifactRecord,
  HomeSummary,
  RoloReply,
  RoloTurn,
  WorkRecord,
} from '../../../src/api/model.ts'
import { friendlyError } from '../../../src/api/errors.ts'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { ProtectedImage } from '../../../src/components/ProtectedImage.tsx'
import { WorkCard } from '../../../src/components/WorkCard.tsx'
import { Button, Card, Loading, Notice, Page, Tag } from '../../../src/components/ui.tsx'
import { pickPhoto } from '../../../src/native/pickers.ts'
import { revokeBrowserDeviceFileUrl } from '../../../src/native/device-file-url.ts'
import { useHomeId } from '../../../src/home/HomeRouteProvider.tsx'
import { oneRouteParam } from '../../../src/home/legacy-route.ts'
import { isProjectRef } from '../../../src/api/protocol.ts'
import {
  roloPhotoConsentKey,
  type RoloPhotoAttachment,
} from '../../../src/rolo/photo-consent.ts'
import {
  planRoloHydration,
  projectRoloConversation,
  type PersistedRoloPhoto,
} from '../../../src/rolo/conversation-persistence.ts'
import { roloRequestCanCommit } from '../../../src/rolo/request-generation.ts'
import { categoryLabel, colors, kindLabel, radius, space, statusLabel } from '../../../src/theme.ts'

const STARTERS: readonly {
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly label: string
  readonly prompt?: string
  readonly destination?: 'people'
}[] = [
  {
    icon: 'thermometer-outline',
    label: 'Something isn\'t working',
    prompt: 'Something at my home is not working. Help me figure out what to check safely and what to do next.',
  },
  {
    icon: 'sparkles-outline',
    label: 'Plan a project',
    prompt: 'I want to plan a project for my home. Help me organize the idea, choices, budget, and next steps.',
  },
  {
    icon: 'people-outline',
    label: 'Find or invite a pro',
    destination: 'people',
  },
  {
    icon: 'calendar-outline',
    label: 'What maintenance is due?',
    prompt: 'What should I be checking or maintaining around my home right now?',
  },
]

const MAX_PHOTO_BYTES = 10 * 1024 * 1024

type ScreenTurn = RoloTurn & {
  readonly photoTitle?: string
  readonly photoArtifactRef?: string
}

type RoloSuggestion = Readonly<Pick<RoloReply, 'destination' | 'projectRef'>>

export default function RoloScreen() {
  const homeId = useHomeId()
  const { prompt: rawPrompt, filter: rawFilter, projectRef: rawProjectRef } = useLocalSearchParams<{
    prompt?: string | string[]
    filter?: string | string[]
    projectRef?: string | string[]
  }>()
  const promptValue = oneRouteParam(rawPrompt)
  const prompt = promptValue === null ? undefined : promptValue.slice(0, 1_600)
  const filter = oneRouteParam(rawFilter)
  const projectRefValue = oneRouteParam(rawProjectRef)
  const routeProjectRef = projectRefValue && isProjectRef(projectRefValue)
    ? projectRefValue
    : undefined
  const redirectToPeople = filter === 'people'
  const { state: auth, api, roloStorage, previewMode, refreshSession } = useSession()
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<ScreenTurn[]>([])
  const [proposal, setProposal] = useState<RoloReply['proposedWork']>(null)
  const [suggestion, setSuggestion] = useState<RoloSuggestion | null>(null)
  const [followUpQuestions, setFollowUpQuestions] = useState<readonly string[]>([])
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<WorkRecord | null>(null)
  const [attachment, setAttachment] = useState<RoloPhotoAttachment | null>(null)
  const [rememberedAttachment, setRememberedAttachment] = useState<PersistedRoloPhoto | null>(null)
  const [approvedPhotoMessage, setApprovedPhotoMessage] = useState<string | null>(null)
  const [savedPhotos, setSavedPhotos] = useState<readonly ArtifactRecord[]>([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photosError, setPhotosError] = useState(false)
  const [photoReview, setPhotoReview] = useState<RoloReply['photoReview']>(null)
  const [photoReviewTitle, setPhotoReviewTitle] = useState<string | null>(null)
  const [photoReviewRef, setPhotoReviewRef] = useState<string | null>(null)
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [conversationProjectRef, setConversationProjectRef] = useState<string | null>(null)
  const [hydratedScope, setHydratedScope] = useState<string | null>(null)
  const [homeSummary, setHomeSummary] = useState<HomeSummary | null>(null)
  const [activeWork, setActiveWork] = useState<readonly WorkRecord[]>([])
  const pendingCreate = useRef<{ readonly intent: string; readonly commandRef: string } | null>(null)
  const sendInFlight = useRef(false)
  const mounted = useRef(true)
  const conversationVersion = useRef(0)
  const hydrationGeneration = useRef(0)
  const consumedPrompt = useRef<string | null>(null)
  const threadScrollRef = useRef<ScrollView>(null)
  const visionEnabled = !redirectToPeople
    && auth.kind === 'signed_in' && auth.session.capabilities.homeAssistantVision
  const uploadsEnabled = auth.kind === 'signed_in' && auth.session.capabilities.uploads
  const currentPhotoConsentKey = roloPhotoConsentKey(attachment, input)
  const photoConsent = currentPhotoConsentKey !== null
    && approvedPhotoMessage === currentPhotoConsentKey
  const principalRef = auth.kind === 'signed_in' ? auth.session.principalRef : null
  const persistenceScope = principalRef ? { principalRef, homeRef: homeId } : null
  const persistenceKey = persistenceScope
    ? `${persistenceScope.principalRef}.${persistenceScope.homeRef}`
    : null

  useFocusEffect(useCallback(() => {
    let active = true
    setHomeSummary(null)
    setActiveWork([])
    if (auth.kind !== 'signed_in') {
      return () => { active = false }
    }
    void Promise.allSettled([api.getHome(homeId), api.listWork(homeId)]).then(([homeResult, workResult]) => {
      if (!active) return
      setHomeSummary(homeResult.status === 'fulfilled' ? homeResult.value : null)
      if (workResult.status === 'fulfilled') {
        setActiveWork(workResult.value
          .filter(item => !item.archived && (item.status === 'planned' || item.status === 'in_progress'))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)))
      } else {
        setActiveWork([])
      }
    })
    return () => { active = false }
  }, [api, auth.kind, homeId]))

  useEffect(() => {
    if (!persistenceScope || redirectToPeople) return
    const generation = hydrationGeneration.current + 1
    hydrationGeneration.current = generation
    conversationVersion.current += 1
    resetConversationState('', routeProjectRef ?? null)
    setHydratedScope(null)
    // The prompt effect below owns an explicit incoming conversation. Starting
    // a read here would let old state briefly win that race.
    if (prompt !== undefined) return
    void roloStorage.read(persistenceScope).then(stored => {
      if (generation !== hydrationGeneration.current || !mounted.current) return
      const plan = planRoloHydration(undefined, stored, routeProjectRef)
      if (plan.kind === 'stored') {
        const conversation = plan.conversation
        setConversationProjectRef(conversation.projectRef)
        setTurns(conversation.turns.map(turn => ({
          role: turn.role,
          text: turn.text,
          ...(turn.photo ? {
            photoTitle: turn.photo.title,
            photoArtifactRef: turn.photo.artifactRef,
          } : {}),
        })))
        setProposal(conversation.proposedWork)
        setSuggestion(conversation.suggestion)
        setFollowUpQuestions(conversation.followUp ? [conversation.followUp] : [])
        setRememberedAttachment(conversation.attachment)
        setPhotoReview(conversation.photoReview?.projection ?? null)
        setPhotoReviewTitle(conversation.photoReview?.photo.title ?? null)
        setPhotoReviewRef(conversation.photoReview?.photo.artifactRef ?? null)
      } else {
        setConversationProjectRef(routeProjectRef ?? null)
      }
      setHydratedScope(persistenceKey)
    }).catch(() => {
      if (generation === hydrationGeneration.current && mounted.current) {
        setHydratedScope(persistenceKey)
      }
    })
    return () => { hydrationGeneration.current += 1 }
    // `prompt` is intentionally read only at scope entry. Later prompts are
    // handled below without re-running storage hydration after the URL clears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeId, principalRef, redirectToPeople, roloStorage, routeProjectRef])

  useEffect(() => {
    if (prompt === undefined) {
      consumedPrompt.current = null
      return
    }
    if (!persistenceScope || redirectToPeople) return
    const promptIdentity = `${homeId}\u0000${routeProjectRef ?? ''}\u0000${prompt}`
    if (consumedPrompt.current === promptIdentity) return
    consumedPrompt.current = promptIdentity
    hydrationGeneration.current += 1
    conversationVersion.current += 1
    const plan = planRoloHydration(prompt, null)
    resetConversationState(
      plan.kind === 'prompt' ? plan.input : '',
      routeProjectRef ?? null,
    )
    setHydratedScope(persistenceKey)
    void roloStorage.remove(persistenceScope).catch(() => undefined)
  }, [homeId, persistenceKey, principalRef, prompt, redirectToPeople, roloStorage, routeProjectRef])

  useEffect(() => {
    if (!persistenceScope || !persistenceKey || hydratedScope !== persistenceKey || redirectToPeople) return
    const value = projectRoloConversation({
      ...persistenceScope,
      projectRef: conversationProjectRef,
      turns,
      proposedWork: proposal,
      followUp: followUpQuestions[0] ?? null,
      suggestion,
      attachment: rememberedAttachment,
      photoReview,
      photoReviewTitle,
      photoReviewRef,
    })
    const operation = value
      ? roloStorage.write(value)
      : roloStorage.remove(persistenceScope)
    void operation.catch(() => undefined)
  }, [
    conversationProjectRef, followUpQuestions, hydratedScope, homeId, persistenceKey, photoReview,
    photoReviewRef, photoReviewTitle, principalRef, proposal, redirectToPeople,
    rememberedAttachment, roloStorage, suggestion, turns,
  ])

  useEffect(() => {
    let active = true
    if (!visionEnabled) {
      setSavedPhotos([])
      setPhotosLoading(false)
      setPhotosError(false)
      setAttachment(null)
      setApprovedPhotoMessage(null)
      setPhotoReview(null)
      setPhotoReviewTitle(null)
      setPhotoReviewRef(null)
      return () => { active = false }
    }
    setPhotosLoading(true)
    setPhotosError(false)
    void api.listArtifacts(homeId).then(artifacts => {
      if (!active) return
      setSavedPhotos(artifacts.filter(item => item.kind === 'photo').slice(0, 12))
      setPhotosLoading(false)
    }).catch(() => {
      if (!active) return
      setPhotosLoading(false)
      setPhotosError(true)
    })
    return () => { active = false }
  }, [api, homeId, visionEnabled])

  useEffect(() => {
    if (!rememberedAttachment || attachment || !visionEnabled) return
    const artifact = savedPhotos.find(item => item.homeRef === homeId
      && item.kind === 'photo'
      && item.artifactRef === rememberedAttachment.artifactRef)
    if (artifact) setAttachment({ state: 'saved', artifact })
  }, [attachment, homeId, rememberedAttachment, savedPhotos, visionEnabled])

  useEffect(() => {
    if (turns.length === 0 && !busy && !photoPickerOpen && !attachment) return
    const frame = requestAnimationFrame(() => threadScrollRef.current?.scrollToEnd({ animated: true }))
    return () => cancelAnimationFrame(frame)
  }, [attachment, busy, photoPickerOpen, photoReviewRef, proposal, turns.length])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (attachment?.state !== 'pending') return undefined
    const file = attachment.file
    return () => { revokeBrowserDeviceFileUrl(file) }
  }, [attachment])

  if (redirectToPeople) {
    return <Redirect href={{ pathname: '/home/[homeId]/people', params: { homeId } }} />
  }
  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }
  if (persistenceKey && hydratedScope !== persistenceKey) {
    return <Loading label="Opening Rolo…" />
  }
  if (!auth.session.capabilities.homeAssistant) {
    return (
      <Page>
        <HomeHeader section="Rolo Live" title="Rolo can’t answer right now." detail="Your home, work, photos, and files are still here." />
        <Card>
          <Text style={styles.introCopy}>You can keep using the rest of your home while Rolo is unavailable.</Text>
          <Button label="Open Home" icon="home-outline" onPress={() => router.replace({ pathname: '/home/[homeId]/care', params: { homeId } })} />
          <Button label="Open Work" icon="layers-outline" quiet onPress={() => router.replace({ pathname: '/home/[homeId]/work', params: { homeId } })} />
        </Card>
      </Page>
    )
  }

  async function chooseNewPhoto(source: 'camera' | 'library') {
    if (previewMode || !uploadsEnabled || busy || photoBusy) return
    const version = conversationVersion.current
    setPhotoBusy(true)
    setError(null)
    try {
      const file = await pickPhoto(source)
      if (!file) return
      if (!roloRequestCanCommit(version, conversationVersion.current, mounted.current)) {
        revokeBrowserDeviceFileUrl(file)
        return
      }
      if (file.byteLength > MAX_PHOTO_BYTES) {
        revokeBrowserDeviceFileUrl(file)
        setError('That photo is larger than 10 MB. Choose a smaller JPEG or PNG.')
        return
      }
      setAttachment({ state: 'pending', file })
      setRememberedAttachment(null)
      setApprovedPhotoMessage(null)
      setPhotoPickerOpen(false)
    } catch (caught) {
      if (roloRequestCanCommit(version, conversationVersion.current, mounted.current)) {
        setError(friendlyError(caught))
      }
    } finally {
      if (roloRequestCanCommit(version, conversationVersion.current, mounted.current)) {
        setPhotoBusy(false)
      }
    }
  }

  function chooseSavedPhoto(artifact: ArtifactRecord) {
    if (busy || photoBusy || artifact.kind !== 'photo') return
    setAttachment({ state: 'saved', artifact })
    setRememberedAttachment({ artifactRef: artifact.artifactRef, title: artifact.displayName })
    setApprovedPhotoMessage(null)
    setPhotoPickerOpen(false)
    setError(null)
  }

  function removePhoto() {
    if (busy) return
    setAttachment(null)
    setRememberedAttachment(null)
    setApprovedPhotoMessage(null)
  }

  async function send(message = input) {
    const clean = message.trim()
    if (!clean || busy || sendInFlight.current) return
    if (attachment && approvedPhotoMessage !== roloPhotoConsentKey(attachment, clean)) {
      setError('Approve this photo for this message, or remove it before sending.')
      return
    }
    const version = conversationVersion.current
    sendInFlight.current = true
    setBusy(true)
    setError(null)
    setSaved(null)
    setSuggestion(null)
    setInput('')
    setPhotoReview(null)
    setPhotoReviewTitle(null)
    setPhotoReviewRef(null)
    let selectedPhoto = attachment?.state === 'saved' ? attachment.artifact : null
    let photoSavedDuringSend = false
    try {
      if (attachment?.state === 'pending') {
        const uploadedPhoto = await api.uploadArtifact(homeId, 'photo', attachment.file)
        selectedPhoto = uploadedPhoto
        photoSavedDuringSend = true
        if (!roloRequestCanCommit(version, conversationVersion.current, mounted.current)) return
        setAttachment({ state: 'saved', artifact: uploadedPhoto })
        setRememberedAttachment({
          artifactRef: uploadedPhoto.artifactRef,
          title: uploadedPhoto.displayName,
        })
        setSavedPhotos(current => [
          uploadedPhoto,
          ...current.filter(photo => photo.artifactRef !== uploadedPhoto.artifactRef),
        ].slice(0, 12))
      }
      if (!roloRequestCanCommit(version, conversationVersion.current, mounted.current)) return
      const reply = await api.askRolo(homeId, clean, turns, {
        pendingWork: proposal,
        unansweredFollowUpQuestion: followUpQuestions[0] ?? null,
      }, conversationProjectRef ?? undefined, selectedPhoto ? {
        source: 'artifact',
        artifactRef: selectedPhoto.artifactRef,
        consentToAnalyze: true,
      } : undefined)
      if (!roloRequestCanCommit(version, conversationVersion.current, mounted.current)) return
      const exchange: ScreenTurn[] = [
        {
          role: 'user',
          text: clean,
          ...(selectedPhoto ? {
            photoTitle: selectedPhoto.displayName,
            photoArtifactRef: selectedPhoto.artifactRef,
          } : {}),
        },
        { role: 'assistant', text: reply.answer },
      ]
      setTurns(current => [...current, ...exchange].slice(-18))
      pendingCreate.current = null
      setProposal(reply.proposedWork)
      setSuggestion(suggestionFromReply(reply))
      setFollowUpQuestions(reply.followUpQuestions)
      if (prompt !== undefined) router.setParams({ prompt: undefined })
      if (selectedPhoto && reply.photoReview) {
        setPhotoReview(reply.photoReview)
        setPhotoReviewTitle(selectedPhoto.displayName)
        setPhotoReviewRef(selectedPhoto.artifactRef)
        setAttachment(null)
        setRememberedAttachment(null)
        setApprovedPhotoMessage(null)
        setPhotoPickerOpen(false)
      }
      if (selectedPhoto && !reply.photoReview) {
        setAttachment({ state: 'saved', artifact: selectedPhoto })
        setRememberedAttachment({
          artifactRef: selectedPhoto.artifactRef,
          title: selectedPhoto.displayName,
        })
        setApprovedPhotoMessage(null)
        setPhotoPickerOpen(true)
        setError('The photo was not opened. It is still private and attached. Ask again, then approve that photo for the new message.')
      }
    } catch (caught) {
      if (!roloRequestCanCommit(version, conversationVersion.current, mounted.current)) return
      setInput(clean)
      const message = previewMode && caught instanceof Error
        ? `Preview error: ${caught.message}`
        : friendlyError(caught)
      setError(photoSavedDuringSend
        ? `The photo is safely saved to this home, but it could not be reviewed. You can approve it again and retry without uploading it twice. ${message}`
        : message)
    } finally {
      if (roloRequestCanCommit(version, conversationVersion.current, mounted.current)) {
        sendInFlight.current = false
        setBusy(false)
      }
    }
  }

  async function saveProposal() {
    if (!proposal) return
    setSaving(true)
    setError(null)
    try {
      const createFields = {
        title: proposal.title,
        workKind: proposal.kind,
        category: proposal.category,
        status: proposal.status,
        ...(proposal.occurredOn ? { occurredOn: proposal.occurredOn } : {}),
        ...(proposal.summary ? { summary: proposal.summary } : {}),
        ...(proposal.professionalLabel ? { professionalLabel: proposal.professionalLabel } : {}),
        ...(proposal.firstUpdate
          ? { initialActivity: { kind: 'note' as const, body: proposal.firstUpdate } }
          : {}),
      }
      const intent = JSON.stringify(createFields)
      if (!pendingCreate.current || pendingCreate.current.intent !== intent) {
        pendingCreate.current = { intent, commandRef: await api.newCommandRef() }
      }
      const work = await api.createWork(homeId, {
        commandRef: pendingCreate.current.commandRef,
        ...createFields,
      })
      pendingCreate.current = null
      setSaved(work)
      if (work.status === 'planned' || work.status === 'in_progress') {
        setActiveWork(current => [work, ...current.filter(item => item.projectRef !== work.projectRef)])
      }
      setProposal(null)
      setSuggestion({ destination: 'work', projectRef: work.projectRef })
      setFollowUpQuestions([])
    } catch (caught) { setError(friendlyError(caught)) } finally { setSaving(false) }
  }

  function startFreshConversation() {
    conversationVersion.current += 1
    hydrationGeneration.current += 1
    resetConversationState()
    if (persistenceScope) void roloStorage.remove(persistenceScope).catch(() => undefined)
    if (conversationProjectRef || routeProjectRef || prompt !== undefined) {
      router.replace({ pathname: '/home/[homeId]/rolo', params: { homeId } })
    }
  }

  function resetConversationState(nextInput = '', nextProjectRef: string | null = null) {
    setConversationProjectRef(nextProjectRef)
    setInput(nextInput)
    setTurns([])
    setProposal(null)
    setSuggestion(null)
    setFollowUpQuestions([])
    setSaved(null)
    setError(null)
    setBusy(false)
    setPhotoBusy(false)
    setAttachment(null)
    setRememberedAttachment(null)
    setApprovedPhotoMessage(null)
    setPhotoReview(null)
    setPhotoReviewTitle(null)
    setPhotoReviewRef(null)
    setPhotoPickerOpen(false)
    sendInFlight.current = false
    pendingCreate.current = null
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView
          ref={threadScrollRef}
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <HomeHeader
          section="Rolo"
          title={homeSummary?.displayLabel ?? 'What’s going on?'}
          detail={homeSummary?.privateLocationLabel ?? 'Talk it through, ask about this home, or add a photo.'}
        />

        {turns.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a new conversation"
            accessibilityState={{ disabled: busy || saving }}
            disabled={busy || saving}
            onPress={startFreshConversation}
            style={({ pressed }) => [styles.newChat, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={17} color={colors.aqua} />
            <Text style={styles.newChatText}>New conversation</Text>
          </Pressable>
        ) : null}

        {turns.length === 0 && conversationProjectRef ? (
          <Card accent style={styles.introCard}>
            <View style={styles.introTop}>
              <View style={styles.roloMark}><Ionicons name="chatbubble-ellipses" size={21} color={colors.ink} /></View>
              <View style={styles.introHeading}>
                <Text style={styles.introTitle}>Let’s look at this work.</Text>
                <Text style={styles.introCopy}>A starting question is ready below. Send it as-is, or change it first.</Text>
              </View>
            </View>
            <Button label="Talk about something else" quiet onPress={startFreshConversation} />
          </Card>
        ) : null}

        {turns.length === 0 && !conversationProjectRef ? (
          <Card style={styles.introCard}>
            <View style={styles.introTop}>
              <View style={styles.roloMark}><Ionicons name="chatbubble-ellipses" size={21} color={colors.ink} /></View>
              <View style={styles.introHeading}>
                <Text style={styles.introTitle}>What’s going on at home?</Text>
                <Text style={styles.introCopy}>Tell me, show me a photo, or choose a place to start.</Text>
              </View>
            </View>
            {STARTERS.map(starter => (
              <Pressable
                key={starter.label}
                accessibilityRole="button"
                accessibilityLabel={starter.label}
                onPress={() => {
                  if (starter.destination === 'people') {
                    router.push({ pathname: '/home/[homeId]/people', params: { homeId } })
                    return
                  }
                  if (!starter.prompt) return
                  if (attachment) {
                    setInput(starter.prompt)
                    setApprovedPhotoMessage(null)
                    setError(null)
                    return
                  }
                  void send(starter.prompt)
                }}
                style={({ pressed }) => [styles.starter, pressed && styles.pressed]}
              >
                <Ionicons name={starter.icon} size={18} color={colors.aqua} />
                <Text style={styles.starterText}>{starter.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.smoke} />
              </Pressable>
            ))}
          </Card>
        ) : null}

        {turns.length === 0 && !conversationProjectRef && activeWork[0] ? (
          <View style={styles.activeWork}>
            <View style={styles.activeWorkHeading}>
              <View style={styles.activeWorkTitleRow}>
                <Ionicons name="pulse-outline" size={17} color={colors.lime} />
                <Text style={styles.activeWorkTitle}>Already in motion</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open all active work"
                onPress={() => router.push({ pathname: '/home/[homeId]/work', params: { homeId } })}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.activeWorkLink}>{activeWork.length > 1 ? `See all ${activeWork.length}` : 'See Work'}</Text>
              </Pressable>
            </View>
            <WorkCard work={activeWork[0]} compact />
          </View>
        ) : null}

        {turns.map((turn, index) => (
          <View key={`${index}-${turn.role}`} style={[styles.bubble, turn.role === 'user' ? styles.userBubble : styles.roloBubble]}>
            <Text style={styles.bubbleName}>{turn.role === 'user' ? 'You' : 'Rolo'}</Text>
            <Text style={styles.bubbleText}>{turn.text}</Text>
            {turn.photoTitle ? (
              <View style={styles.threadPhoto}>
                <Ionicons name="image-outline" size={15} color={colors.aqua} />
                <Text style={styles.threadPhotoText} numberOfLines={1}>{turn.photoTitle}</Text>
              </View>
            ) : null}
          </View>
        ))}
        {busy ? (
          <View
            style={styles.thinking}
            accessibilityRole="progressbar"
            accessibilityLabel={attachment ? 'Reviewing your photo' : 'Rolo is thinking'}
          >
            <ActivityIndicator color={colors.lime} />
            <Text style={styles.thinkingText}>{attachment ? 'Reviewing your photo…' : 'Rolo is thinking…'}</Text>
          </View>
        ) : null}

        {photoReview ? (
          <Card accent>
            <View style={styles.reviewTop}>
              <View style={styles.reviewHeading}>
                <Text style={styles.reviewEyebrow}>What I can see</Text>
                <Text style={styles.reviewTitle} numberOfLines={2}>{photoReviewTitle ?? 'Selected photo'}</Text>
              </View>
              <Tag tone={photoReview.urgency === 'urgent' ? 'warning' : 'aqua'}>
                {photoReview.urgency === 'urgent'
                  ? 'Urgent'
                  : photoReview.urgency === 'prompt_attention'
                    ? 'Check soon'
                    : 'Routine'}
              </Tag>
            </View>
            {photoReviewRef ? (
              <ProtectedImage
                source={api.artifactPreviewSource(homeId, photoReviewRef)}
                style={styles.reviewImage}
                resizeMode="cover"
                accessibilityLabel={photoReviewTitle ?? 'Photo reviewed by Rolo'}
              />
            ) : null}
            <Text style={styles.reviewSection}>What stands out</Text>
            {photoReview.visibleObservations.map(item => (
              <View key={item} style={styles.reviewItem}>
                <Ionicons name="eye-outline" size={16} color={colors.lime} />
                <Text style={styles.reviewCopy}>{item}</Text>
              </View>
            ))}
            <Text style={styles.reviewSection}>What the photo can’t tell us</Text>
            {photoReview.cannotConfirm.map(item => (
              <View key={item} style={styles.reviewItem}>
                <Ionicons name="help-circle-outline" size={16} color={colors.aqua} />
                <Text style={styles.reviewCopy}>{item}</Text>
              </View>
            ))}
            {photoReview.suggestedTrade ? (
              <Text style={styles.reviewTrade}>If you want it checked in person, start with someone who handles {categoryLabel[photoReview.suggestedTrade].toLowerCase()}.</Text>
            ) : null}
            <Text style={styles.disclosure}>This is a visual review—not a diagnosis, measurement, quote, or safety clearance.</Text>
          </Card>
        ) : null}

        {followUpQuestions[0] ? (
          <Card>
            <Text style={styles.followUpLabel}>One quick question</Text>
            <Text style={styles.followUpQuestion}>{followUpQuestions[0]}</Text>
          </Card>
        ) : null}

        {proposal ? (
          <Card accent>
            <View style={styles.proposalTop}>
              <Tag tone="lime">Review before saving</Tag>
              <Text style={styles.proposalKind}>{kindLabel[proposal.kind]}</Text>
            </View>
            <Text style={styles.proposalTitle}>{proposal.title}</Text>
            <Text style={styles.proposalMeta}>{categoryLabel[proposal.category]} · {statusLabel[proposal.status]}</Text>
            {proposal.summary ? <Text style={styles.introCopy}>{proposal.summary}</Text> : null}
            {proposal.professionalLabel ? <Text style={styles.proLabel}>Pro: {proposal.professionalLabel}</Text> : null}
            <Button label={saving ? 'Saving…' : 'Add to Work'} onPress={() => void saveProposal()} disabled={saving} />
            <Button label="Leave it in the chat" onPress={() => {
              pendingCreate.current = null
              setProposal(null)
              setFollowUpQuestions([])
            }} disabled={saving} quiet />
            <Text style={styles.disclosure}>Nothing is saved until you approve it.</Text>
          </Card>
        ) : null}
        {saved ? <Notice message={`“${saved.title}” is now in Work.`} /> : null}
        {suggestion ? (
          <Button
            label={suggestionLabel(suggestion)}
            icon="arrow-forward"
            onPress={() => openSuggestion(homeId, suggestion)}
            quiet
          />
        ) : null}
        {error ? <Notice message={error} /> : null}

        {visionEnabled && (photoPickerOpen || attachment) ? (
          <Card style={styles.photoPanel}>
            <View style={styles.photoAttach}>
              <View style={styles.photoAttachHeading}>
                <View>
                  <Text style={styles.photoAttachTitle}>{attachment ? 'Photo attached' : 'Add a photo'}</Text>
                  <Text style={styles.photoAttachHint}>Choose one photo to review with your next message.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close photo picker"
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => {
                    if (attachment) removePhoto()
                    setPhotoPickerOpen(false)
                  }}
                  hitSlop={8}
                  style={styles.iconButton}
                >
                  <Ionicons name="close" size={22} color={colors.slate} />
                </Pressable>
              </View>
              {attachment ? (
                <View style={styles.attachmentCard}>
                  {attachment.state === 'saved' ? (
                    <ProtectedImage
                      source={api.artifactPreviewSource(homeId, attachment.artifact.artifactRef)}
                      style={styles.attachmentImage}
                      resizeMode="cover"
                      accessibilityLabel={attachment.artifact.displayName}
                    />
                  ) : (
                    <Image
                      source={{ uri: attachment.file.uri }}
                      style={styles.attachmentImage}
                      resizeMode="cover"
                      accessibilityLabel={attachment.file.name}
                    />
                  )}
                  <View style={styles.attachmentBody}>
                    <Text style={styles.attachmentName} numberOfLines={2}>
                      {attachment.state === 'pending'
                        ? attachment.file.name
                        : attachment.artifact.displayName}
                    </Text>
                    <Text style={styles.attachmentState}>
                      {attachment.state === 'pending'
                        ? 'Saves privately to this home when you send.'
                        : 'Already saved in this private home.'}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remove attached photo"
                      accessibilityState={{ disabled: busy }}
                      disabled={busy}
                      onPress={removePhoto}
                      style={styles.removePhotoButton}
                    >
                      <Text style={styles.removePhoto}>Remove photo</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  {!previewMode && uploadsEnabled ? (
                    <View style={styles.photoActions}>
                      <PhotoAction
                        icon="camera-outline"
                        label={photoBusy ? 'Opening…' : 'Take photo'}
                        disabled={busy || photoBusy}
                        onPress={() => void chooseNewPhoto('camera')}
                      />
                      <PhotoAction
                        icon="images-outline"
                        label={photoBusy ? 'Opening…' : 'Choose photo'}
                        disabled={busy || photoBusy}
                        onPress={() => void chooseNewPhoto('library')}
                      />
                    </View>
                  ) : null}
                  {photosLoading ? <Text style={styles.photoAttachHint}>Loading saved photos…</Text> : null}
                  {photosError ? <Text style={styles.photoAttachHint}>Saved photos could not load. You can still take or choose a new one.</Text> : null}
                  {savedPhotos.length > 0 ? (
                    <View style={styles.savedPhotoChoices}>
                      <Text style={styles.savedPhotoLabel}>
                        {previewMode ? 'Preview photo' : 'From this home'}
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.savedPhotoStrip}
                      >
                        {savedPhotos.slice(0, previewMode ? 1 : 6).map(photo => (
                          <Pressable
                            key={photo.artifactRef}
                            accessibilityRole="button"
                            accessibilityLabel={`Attach ${photo.displayName}`}
                            disabled={busy || photoBusy}
                            onPress={() => chooseSavedPhoto(photo)}
                            style={({ pressed }) => [styles.savedPhotoChoice, pressed && styles.savedPhotoChoicePressed]}
                          >
                            <ProtectedImage
                              source={api.artifactPreviewSource(homeId, photo.artifactRef)}
                              style={styles.savedPhotoThumb}
                              resizeMode="cover"
                            />
                            <Text style={styles.savedPhotoName} numberOfLines={2}>{photo.displayName}</Text>
                            <Ionicons name="add-circle" size={21} color={colors.lime} />
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : !photosLoading && !photosError ? (
                    <Text style={styles.photoAttachHint}>No saved photos yet. Take one or choose one from your phone.</Text>
                  ) : null}
                </>
              )}
              {attachment ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: photoConsent }}
                  accessibilityLabel="Allow Rolo to inspect this photo for this message only"
                  disabled={busy || !currentPhotoConsentKey}
                  onPress={() => setApprovedPhotoMessage(current => (
                    current === currentPhotoConsentKey ? null : currentPhotoConsentKey
                  ))}
                  style={({ pressed }) => [styles.consentRow, pressed && styles.consentPressed]}
                >
                  <Ionicons
                    name={photoConsent ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={photoConsent ? colors.lime : colors.slate}
                  />
                  <Text style={styles.consentText}>
                    {!input.trim()
                      ? 'Write what you want to know first. Then approve this photo for that exact message.'
                      : attachment.state === 'pending'
                      ? 'Save this photo privately and use it only to answer this message.'
                      : 'Use this saved photo only to answer this message.'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        ) : null}
        </ScrollView>

        <View style={styles.composerDock}>
          <View style={styles.composer}>
          {visionEnabled ? (
            attachment ? (
              <View style={[styles.composerAction, styles.composerActionAttached]} accessibilityLabel="Photo attached">
                <Ionicons name="image" size={21} color={colors.ink} />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add a photo"
                accessibilityState={{ disabled: busy || photoBusy }}
                disabled={busy || photoBusy}
                onPress={() => setPhotoPickerOpen(current => !current)}
                style={({ pressed }) => [styles.composerAction, pressed && styles.pressed]}
              >
                <Ionicons name="camera-outline" size={21} color={colors.aqua} />
              </Pressable>
            )
          ) : null}
          <TextInput
            accessibilityLabel="Message Rolo"
            value={input}
            onChangeText={value => {
              setInput(value)
              setApprovedPhotoMessage(null)
            }}
            multiline
            maxLength={1_600}
            placeholder={attachment ? 'What do you want to know about this photo?' : 'Tell Rolo what’s going on…'}
            placeholderTextColor={colors.smoke}
            selectionColor={colors.lime}
            style={styles.composerInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={busy ? 'Sending message' : 'Send message'}
            accessibilityState={{ disabled: busy || photoBusy || !input.trim() || (!!attachment && !photoConsent) }}
            onPress={() => void send()}
            disabled={busy || photoBusy || !input.trim() || (!!attachment && !photoConsent)}
            style={({ pressed }) => [
              styles.sendButton,
              (busy || photoBusy || !input.trim() || (!!attachment && !photoConsent)) && styles.sendButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name={busy ? 'ellipsis-horizontal' : 'arrow-up'} size={21} color={colors.ink} />
          </Pressable>
          </View>
          {attachment && !photoConsent ? (
            <Text style={styles.composerHint}>Approve the photo above before sending.</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="How this chat uses your information"
            accessibilityState={{ expanded: privacyOpen }}
            onPress={() => setPrivacyOpen(current => !current)}
            style={({ pressed }) => [styles.privacyToggle, pressed && styles.pressed]}
          >
            <Ionicons name="lock-closed-outline" size={14} color={colors.smoke} />
            <Text style={styles.privacyToggleText}>Private by default · How this chat uses your information</Text>
            <Ionicons name={privacyOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.smoke} />
          </Pressable>
          {privacyOpen ? (
            <Text style={styles.safety}>
              Your message and a limited list of what this home has saved may be processed by OpenAI. The saved street address is not sent. File and photo contents stay private unless you approve one exact photo for one exact message.
              {visionEnabled ? ' A new photo is saved privately first; Homesrolo removes details such as its location before sending a fresh copy for that request.' : ''}
              {' '}Rolo can help you think through what is visible, but it is not a licensed professional or emergency service.
            </Text>
          ) : null}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

function suggestionFromReply(reply: RoloReply): RoloSuggestion | null {
  if (!reply.destination || reply.destination === 'rolo') return null
  // A proposed draft does not exist in Work until the homeowner approves it.
  if (reply.destination === 'work' && !reply.projectRef && reply.proposedWork) return null
  return { destination: reply.destination, projectRef: reply.projectRef }
}

function suggestionLabel(suggestion: RoloSuggestion): string {
  if (suggestion.destination === 'work' && suggestion.projectRef) return 'Open this work record'
  if (suggestion.destination === 'work' || suggestion.destination === 'activity') return 'Open Work'
  if (suggestion.destination === 'library') return 'Open photos & files'
  if (suggestion.destination === 'details') return 'Open Home'
  return 'Open Home'
}

function openSuggestion(homeId: string, suggestion: RoloSuggestion) {
  if (suggestion.destination === 'work' && suggestion.projectRef) {
    router.push({
      pathname: '/home/[homeId]/work/[projectRef]',
      params: { homeId, projectRef: suggestion.projectRef },
    })
    return
  }
  if (suggestion.destination === 'work' || suggestion.destination === 'activity') {
    router.push({ pathname: '/home/[homeId]/work', params: { homeId } })
    return
  }
  if (suggestion.destination === 'library') {
    router.push({ pathname: '/home/[homeId]/care', params: { homeId } })
    return
  }
  if (suggestion.destination === 'details') {
    router.push({ pathname: '/home/[homeId]/details', params: { homeId } })
    return
  }
  router.push({ pathname: '/home/[homeId]/care', params: { homeId } })
}

function PhotoAction({ icon, label, disabled, onPress }: {
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly label: string
  readonly disabled: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.photoAction,
        disabled && styles.photoActionDisabled,
        pressed && !disabled && styles.photoActionPressed,
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.lime} />
      <Text style={styles.photoActionText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  thread: { flex: 1 },
  threadContent: { padding: space.lg, paddingBottom: space.md, gap: space.md },
  introCard: { gap: 10 },
  introTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  introHeading: { flex: 1, gap: 3 },
  roloMark: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  introTitle: { color: colors.cream, fontSize: 18, lineHeight: 23, fontWeight: '800' },
  introCopy: { color: colors.slate, fontSize: 13, lineHeight: 19 },
  activeWork: { gap: 9 },
  activeWorkHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  activeWorkTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  activeWorkTitle: { color: colors.cream, fontSize: 13, fontWeight: '900' },
  activeWorkLink: { color: colors.aqua, fontSize: 12, fontWeight: '900' },
  newChat: { minHeight: 44, alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10 },
  newChatText: { color: colors.aqua, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  starter: {
    minHeight: 48, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkSoft, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  starterText: { flex: 1, color: colors.cream, fontSize: 14, lineHeight: 19, fontWeight: '700' },
  bubble: { maxWidth: '90%', borderRadius: radius.large, paddingHorizontal: 14, paddingVertical: 11, gap: 4 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: colors.lime },
  roloBubble: { alignSelf: 'flex-start', backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.line },
  bubbleName: { color: colors.aqua, fontSize: 11, fontWeight: '700' },
  bubbleText: { color: colors.cream, fontSize: 15, lineHeight: 22 },
  threadPhoto: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 3 },
  threadPhotoText: { color: colors.aqua, flexShrink: 1, fontSize: 12, fontWeight: '800' },
  thinking: {
    minHeight: 64, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkRaised, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  thinkingText: { color: colors.slate, fontSize: 13, fontWeight: '700' },
  reviewTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  reviewHeading: { flex: 1, gap: 3 },
  reviewEyebrow: { color: colors.lime, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  reviewTitle: { color: colors.cream, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  reviewImage: { width: '100%', height: 190, borderRadius: radius.medium, backgroundColor: colors.inkSoft },
  reviewSection: { color: colors.aqua, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 3 },
  reviewItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  reviewCopy: { color: colors.cream, flex: 1, fontSize: 14, lineHeight: 20 },
  reviewTrade: { color: colors.lime, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  followUpLabel: { color: colors.aqua, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  followUpQuestion: { color: colors.cream, fontSize: 17, lineHeight: 24, fontWeight: '800' },
  proposalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  proposalKind: { color: colors.slate, fontSize: 12, fontWeight: '800' },
  proposalTitle: { color: colors.cream, fontSize: 22, lineHeight: 27, fontWeight: '900' },
  proposalMeta: { color: colors.aqua, fontSize: 13, fontWeight: '800' },
  proLabel: { color: colors.lime, fontSize: 13, fontWeight: '800' },
  disclosure: { color: colors.smoke, fontSize: 11, textAlign: 'center' },
  photoPanel: { gap: 0 },
  photoAttach: { gap: 11, paddingBottom: 3 },
  photoAttachHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  photoAttachTitle: { color: colors.cream, fontSize: 16, fontWeight: '900' },
  photoAttachHint: { color: colors.smoke, fontSize: 11, lineHeight: 16, marginTop: 2 },
  photoActions: { flexDirection: 'row', gap: 9 },
  photoAction: {
    flex: 1, minHeight: 48, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkSoft, paddingHorizontal: 11, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center', gap: 7,
  },
  photoActionDisabled: { opacity: 0.45 },
  photoActionPressed: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  photoActionText: { color: colors.cream, fontSize: 13, fontWeight: '800' },
  attachmentCard: {
    borderRadius: radius.medium, overflow: 'hidden', borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkSoft, flexDirection: 'row', minHeight: 108,
  },
  attachmentImage: { width: 108, minHeight: 108, backgroundColor: colors.inkRaised },
  attachmentBody: { flex: 1, padding: 11, justifyContent: 'center', gap: 5 },
  attachmentName: { color: colors.cream, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  attachmentState: { color: colors.slate, fontSize: 11, lineHeight: 15 },
  removePhoto: { color: colors.aqua, fontSize: 12, fontWeight: '900' },
  removePhotoButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  consentRow: {
    minHeight: 58, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line,
    padding: 11, backgroundColor: colors.inkSoft, flexDirection: 'row', alignItems: 'flex-start', gap: 10,
  },
  consentPressed: { borderColor: colors.lime },
  consentText: { color: colors.cream, flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  savedPhotoChoices: { gap: 7 },
  savedPhotoStrip: { gap: 8, paddingRight: 4 },
  savedPhotoLabel: { color: colors.slate, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  savedPhotoChoice: {
    width: 190, minHeight: 60, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkSoft, padding: 7, flexDirection: 'row', alignItems: 'center', gap: 9,
  },
  savedPhotoChoicePressed: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  savedPhotoThumb: { width: 46, height: 46, borderRadius: 9, backgroundColor: colors.inkRaised },
  savedPhotoName: { color: colors.cream, flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  composer: {
    minHeight: 56, borderRadius: radius.large, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkRaised, padding: 6, flexDirection: 'row', alignItems: 'flex-end', gap: 7,
  },
  composerDock: {
    borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.ink,
    paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: 5,
  },
  composerAction: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.inkSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  composerActionAttached: { backgroundColor: colors.lime },
  composerInput: {
    flex: 1, minHeight: 42, maxHeight: 108, paddingHorizontal: 7, paddingTop: 10, paddingBottom: 9,
    color: colors.cream, fontSize: 15, lineHeight: 21, textAlignVertical: 'center',
  },
  sendButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.lime,
    alignItems: 'center', justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.35 },
  composerHint: { color: colors.warning, fontSize: 11, lineHeight: 16, paddingHorizontal: 8, marginTop: -7 },
  privacyToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  privacyToggleText: { color: colors.smoke, fontSize: 10, lineHeight: 14, flexShrink: 1 },
  safety: { color: colors.smoke, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: space.lg },
})
