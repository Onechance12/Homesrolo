import { useEffect, useRef, useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, router, useGlobalSearchParams, useLocalSearchParams } from 'expo-router'
import type {
  ArtifactRecord,
  RoloReply,
  RoloTurn,
  WorkRecord,
} from '../../../src/api/model.ts'
import { friendlyError } from '../../../src/api/errors.ts'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { Button, Card, Loading, Notice, Page, Tag, TextField } from '../../../src/components/ui.tsx'
import { pickPhoto } from '../../../src/native/pickers.ts'
import {
  roloPhotoConsentKey,
  type RoloPhotoAttachment,
} from '../../../src/rolo/photo-consent.ts'
import { categoryLabel, colors, kindLabel, radius, space, statusLabel } from '../../../src/theme.ts'

const STARTERS = [
  'Something is not working. Help me figure out what to check safely and what kind of pro I may need.',
  'Help me plan a project such as a pool, remodel, roof, or outdoor upgrade.',
  'I need routine help such as yard care, heating and air service, cleaning, or pest control.',
  'I have a question about my home and what it already remembers.',
]

const MAX_PHOTO_BYTES = 10 * 1024 * 1024

type ScreenTurn = RoloTurn & {
  readonly photoTitle?: string
  readonly photoArtifactRef?: string
}

export default function RoloScreen() {
  const { homeId } = useGlobalSearchParams<{ homeId: string }>()
  const { prompt } = useLocalSearchParams<{ prompt?: string }>()
  const { state: auth, api, previewMode, refreshSession } = useSession()
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<ScreenTurn[]>([])
  const [proposal, setProposal] = useState<RoloReply['proposedWork']>(null)
  const [followUpQuestions, setFollowUpQuestions] = useState<readonly string[]>([])
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<WorkRecord | null>(null)
  const [attachment, setAttachment] = useState<RoloPhotoAttachment | null>(null)
  const [approvedPhotoMessage, setApprovedPhotoMessage] = useState<string | null>(null)
  const [savedPhotos, setSavedPhotos] = useState<readonly ArtifactRecord[]>([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photosError, setPhotosError] = useState(false)
  const [photoReview, setPhotoReview] = useState<RoloReply['photoReview']>(null)
  const [photoReviewTitle, setPhotoReviewTitle] = useState<string | null>(null)
  const [photoReviewRef, setPhotoReviewRef] = useState<string | null>(null)
  const pendingCreate = useRef<{ readonly intent: string; readonly commandRef: string } | null>(null)
  const sendInFlight = useRef(false)
  const conversationVersion = useRef(0)
  const visionEnabled = auth.kind === 'signed_in' && auth.session.capabilities.homeAssistantVision
  const uploadsEnabled = auth.kind === 'signed_in' && auth.session.capabilities.uploads
  const currentPhotoConsentKey = roloPhotoConsentKey(attachment, input)
  const photoConsent = currentPhotoConsentKey !== null
    && approvedPhotoMessage === currentPhotoConsentKey

  useEffect(() => {
    if (!prompt) return
    conversationVersion.current += 1
    pendingCreate.current = null
    setTurns([])
    setProposal(null)
    setFollowUpQuestions([])
    setSaved(null)
    setError(null)
    setBusy(false)
    setPhotoBusy(false)
    setAttachment(null)
    setApprovedPhotoMessage(null)
    setPhotoReview(null)
    setPhotoReviewTitle(null)
    setPhotoReviewRef(null)
    sendInFlight.current = false
    setInput(prompt.slice(0, 1_600))
    router.setParams({ prompt: undefined })
  }, [prompt])

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

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }
  if (!auth.session.capabilities.homeAssistant) {
    return (
      <Page>
        <HomeHeader section="Rolo Live" title="Rolo is unavailable." detail="Your saved home records and uploads still work normally." />
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
      if (!file || version !== conversationVersion.current) return
      if (file.byteLength > MAX_PHOTO_BYTES) {
        setError('That photo is larger than 10 MB. Choose a smaller JPEG or PNG.')
        return
      }
      setAttachment({ state: 'pending', file })
      setApprovedPhotoMessage(null)
    } catch (caught) {
      if (version === conversationVersion.current) setError(friendlyError(caught))
    } finally {
      if (version === conversationVersion.current) setPhotoBusy(false)
    }
  }

  function chooseSavedPhoto(artifact: ArtifactRecord) {
    if (busy || photoBusy || artifact.kind !== 'photo') return
    setAttachment({ state: 'saved', artifact })
    setApprovedPhotoMessage(null)
    setError(null)
  }

  function removePhoto() {
    if (busy) return
    setAttachment(null)
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
    setInput('')
    if (attachment) {
      setPhotoReview(null)
      setPhotoReviewTitle(null)
      setPhotoReviewRef(null)
    }
    let selectedPhoto = attachment?.state === 'saved' ? attachment.artifact : null
    let photoSavedDuringSend = false
    try {
      if (attachment?.state === 'pending') {
        const uploadedPhoto = await api.uploadArtifact(homeId, 'photo', attachment.file)
        selectedPhoto = uploadedPhoto
        photoSavedDuringSend = true
        if (version !== conversationVersion.current) return
        setAttachment({ state: 'saved', artifact: uploadedPhoto })
        setSavedPhotos(current => [
          uploadedPhoto,
          ...current.filter(photo => photo.artifactRef !== uploadedPhoto.artifactRef),
        ].slice(0, 12))
      }
      if (version !== conversationVersion.current) return
      const reply = await api.askRolo(homeId, clean, turns, {
        pendingWork: proposal,
        unansweredFollowUpQuestion: followUpQuestions[0] ?? null,
      }, selectedPhoto ? {
        source: 'artifact',
        artifactRef: selectedPhoto.artifactRef,
        consentToAnalyze: true,
      } : undefined)
      if (version !== conversationVersion.current) return
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
      setFollowUpQuestions(reply.followUpQuestions)
      if (selectedPhoto && reply.photoReview) {
        setPhotoReview(reply.photoReview)
        setPhotoReviewTitle(selectedPhoto.displayName)
        setPhotoReviewRef(selectedPhoto.artifactRef)
        setAttachment(null)
        setApprovedPhotoMessage(null)
      }
      if (selectedPhoto && !reply.photoReview) {
        setAttachment({ state: 'saved', artifact: selectedPhoto })
        setApprovedPhotoMessage(null)
        setError('Rolo answered without opening the attached photo. It remains private and attached; approve it again only after you write a new question.')
      }
    } catch (caught) {
      if (version !== conversationVersion.current) return
      setInput(clean)
      const message = previewMode && caught instanceof Error
        ? `Preview error: ${caught.message}`
        : friendlyError(caught)
      setError(photoSavedDuringSend
        ? `The photo is saved to this home, but Rolo could not inspect it. Approve it again and send to retry without uploading it twice. ${message}`
        : message)
    } finally {
      sendInFlight.current = false
      if (version === conversationVersion.current) setBusy(false)
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
      setProposal(null)
      setFollowUpQuestions([])
    } catch (caught) { setError(friendlyError(caught)) } finally { setSaving(false) }
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Page>
        <HomeHeader
          section="Start"
          title="What do you want to get done?"
          detail="Describe it naturally. Rolo helps you think it through and turns it into a plan only after you approve it."
        />

        {turns.length === 0 ? (
          <Card accent>
            <View style={styles.roloMark}><Ionicons name="sparkles" size={28} color={colors.ink} /></View>
            <Text style={styles.introTitle}>Start with the real reason you opened the app.</Text>
            <Text style={styles.introCopy}>A broken AC, a pool idea, weekly yard help, or a question about the house—just say it the way you would to a person.</Text>
            {STARTERS.map(starter => (
              <Pressable key={starter} onPress={() => {
                if (attachment) {
                  setInput(starter)
                  setApprovedPhotoMessage(null)
                  setError(null)
                  return
                }
                void send(starter)
              }} style={styles.starter}>
                <Text style={styles.starterText}>{starter}</Text>
                <Ionicons name="arrow-forward" size={17} color={colors.lime} />
              </Pressable>
            ))}
          </Card>
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
        {busy ? <View style={styles.thinking}><Loading label="Rolo is looking at this home…" /></View> : null}

        {photoReview ? (
          <Card accent>
            <View style={styles.reviewTop}>
              <View style={styles.reviewHeading}>
                <Text style={styles.reviewEyebrow}>Rolo photo review</Text>
                <Text style={styles.reviewTitle} numberOfLines={2}>{photoReviewTitle ?? 'Selected photo'}</Text>
              </View>
              <Tag tone={photoReview.urgency === 'urgent' ? 'warning' : 'aqua'}>
                {photoReview.urgency === 'urgent'
                  ? 'Urgent'
                  : photoReview.urgency === 'prompt_attention'
                    ? 'Prompt attention'
                    : 'Routine'}
              </Tag>
            </View>
            {photoReviewRef ? (
              <Image
                source={api.artifactPreviewSource(homeId, photoReviewRef)}
                style={styles.reviewImage}
                resizeMode="cover"
                accessibilityLabel={photoReviewTitle ?? 'Photo reviewed by Rolo'}
              />
            ) : null}
            <Text style={styles.reviewSection}>Visible in this photo</Text>
            {photoReview.visibleObservations.map(item => (
              <View key={item} style={styles.reviewItem}>
                <Ionicons name="eye-outline" size={16} color={colors.lime} />
                <Text style={styles.reviewCopy}>{item}</Text>
              </View>
            ))}
            <Text style={styles.reviewSection}>This photo cannot confirm</Text>
            {photoReview.cannotConfirm.map(item => (
              <View key={item} style={styles.reviewItem}>
                <Ionicons name="help-circle-outline" size={16} color={colors.aqua} />
                <Text style={styles.reviewCopy}>{item}</Text>
              </View>
            ))}
            {photoReview.suggestedTrade ? (
              <Text style={styles.reviewTrade}>A useful next trade may be {categoryLabel[photoReview.suggestedTrade]}.</Text>
            ) : null}
            <Text style={styles.disclosure}>A photo review is not a diagnosis, measurement, quote, or safety clearance.</Text>
          </Card>
        ) : null}

        {followUpQuestions[0] ? (
          <Card>
            <Text style={styles.followUpLabel}>One thing Rolo still needs</Text>
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
            {proposal.professionalLabel ? <Text style={styles.proLabel}>Person/company: {proposal.professionalLabel}</Text> : null}
            <Button label={saving ? 'Saving…' : 'Approve and add to Plans'} onPress={() => void saveProposal()} disabled={saving} />
            <Button label="Do not save this" onPress={() => {
              pendingCreate.current = null
              setProposal(null)
              setFollowUpQuestions([])
            }} disabled={saving} quiet />
            <Text style={styles.disclosure}>Nothing is saved until you approve it.</Text>
          </Card>
        ) : null}
        {saved ? <Notice message={`Saved “${saved.title}” to this home’s Plans.`} /> : null}
        {error ? <Notice message={error} /> : null}

        {turns.length > 0 ? (
          <Button
            label="Start a new conversation"
            icon="refresh-outline"
            quiet
            onPress={() => {
              conversationVersion.current += 1
              setInput('')
              setTurns([])
              setProposal(null)
              setFollowUpQuestions([])
              setSaved(null)
              setError(null)
              setBusy(false)
              setPhotoBusy(false)
              setAttachment(null)
              setApprovedPhotoMessage(null)
              setPhotoReview(null)
              setPhotoReviewTitle(null)
              setPhotoReviewRef(null)
              sendInFlight.current = false
              pendingCreate.current = null
            }}
          />
        ) : null}

        <Card>
          {visionEnabled ? (
            <View style={styles.photoAttach}>
              <View style={styles.photoAttachHeading}>
                <View>
                  <Text style={styles.photoAttachTitle}>Show Rolo one photo</Text>
                  <Text style={styles.photoAttachHint}>One private JPEG or PNG, up to 10 MB.</Text>
                </View>
                <Ionicons name="camera-outline" size={22} color={colors.lime} />
              </View>
              {attachment ? (
                <View style={styles.attachmentCard}>
                  <Image
                    source={attachment.state === 'pending'
                      ? { uri: attachment.file.uri }
                      : api.artifactPreviewSource(homeId, attachment.artifact.artifactRef)}
                    style={styles.attachmentImage}
                    resizeMode="cover"
                    accessibilityLabel={attachment.state === 'pending'
                      ? attachment.file.name
                      : attachment.artifact.displayName}
                  />
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
                      disabled={busy}
                      onPress={removePhoto}
                      hitSlop={8}
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
                  {photosLoading ? <Text style={styles.photoAttachHint}>Opening private photos…</Text> : null}
                  {photosError ? <Text style={styles.photoAttachHint}>Saved photos are unavailable here right now.</Text> : null}
                  {savedPhotos.length > 0 ? (
                    <View style={styles.savedPhotoChoices}>
                      <Text style={styles.savedPhotoLabel}>
                        {previewMode ? 'Use a no-network sample' : 'Or use a saved photo'}
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
                            <Image
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
                      ? 'Write your question below first, then approve this exact photo and message.'
                      : attachment.state === 'pending'
                      ? 'Save this photo privately and let Rolo inspect a metadata-free copy for this message only.'
                      : 'Let Rolo inspect this photo for this message only.'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <TextField
            label="Message Rolo"
            value={input}
            onChangeText={value => {
              setInput(value)
              setApprovedPhotoMessage(null)
            }}
            multiline
            placeholder="Tell me what you need fixed, planned, serviced, or answered…"
          />
          <Button
            label={busy ? (attachment?.state === 'pending' ? 'Saving photo…' : 'Thinking…') : 'Send'}
            icon="arrow-up"
            onPress={() => void send()}
            disabled={busy || photoBusy || !input.trim() || (!!attachment && !photoConsent)}
          />
        </Card>
        <Text style={styles.safety}>
          Your message and a limited home index may be processed by OpenAI. The saved street-address field is not sent. File and photo contents are not sent by default.
          {visionEnabled ? ' A new attachment is saved privately first. After you approve that message, only one fresh metadata-free copy is sent for that request.' : ''}
          {' '}Rolo can describe visible details but does not replace a licensed professional or emergency service.
        </Text>
      </Page>
    </KeyboardAvoidingView>
  )
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
  roloMark: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  introTitle: { color: colors.cream, fontSize: 22, lineHeight: 27, fontWeight: '900' },
  introCopy: { color: colors.slate, fontSize: 14, lineHeight: 21 },
  starter: {
    minHeight: 54, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkRaised, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  starterText: { flex: 1, color: colors.cream, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  bubble: { maxWidth: '90%', borderRadius: 22, padding: 15, gap: 5 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: colors.lime },
  roloBubble: { alignSelf: 'flex-start', backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.line },
  bubbleName: { color: colors.aqua, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  bubbleText: { color: colors.cream, fontSize: 15, lineHeight: 22 },
  threadPhoto: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 3 },
  threadPhotoText: { color: colors.aqua, flexShrink: 1, fontSize: 12, fontWeight: '800' },
  thinking: { maxHeight: 150, overflow: 'hidden' },
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
  photoAttach: { gap: 11, paddingBottom: 3 },
  photoAttachHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
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
  safety: { color: colors.smoke, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: space.lg },
})
