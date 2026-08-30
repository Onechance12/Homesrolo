import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import type { ArtifactGeoPin, ArtifactKind, DeviceFile, ResolvedArtifactRecord } from '../api/model.ts'
import { friendlyError } from '../api/errors.ts'
import { useSession } from '../auth/SessionProvider.tsx'
import {
  artifactMetadataReplacement,
  newPhotoMetadataDraft,
  normalizePhotoMetadataDraft,
  PHOTO_PHASE_LABEL,
  type PhotoMetadataDraft,
} from '../home/photo-metadata.ts'
import { homeLibraryEntries } from '../home/library.ts'
import { homeLibraryEntryCards, type HomesroloCard } from '../home/rolodex.ts'
import { useResource } from '../hooks/useResource.ts'
import { pickDocument, pickPhoto } from '../native/pickers.ts'
import { captureConfirmedDeviceLocation } from '../native/current-location.ts'
import { revokeBrowserDeviceFileUrl } from '../native/device-file-url.ts'
import { PREVIEW_UPLOAD_NOTICE } from '../preview/api.ts'
import { colors, radius, space } from '../theme.ts'
import { Button, Loading, Notice, SectionTitle } from './ui.tsx'
import { PhotoPreview } from './PhotoPreview.tsx'
import { PhotoUploadDetails } from './PhotoUploadDetails.tsx'
import { ArtifactFileCard } from './ArtifactFileCard.tsx'
import { ProtectedImage } from './ProtectedImage.tsx'
import { RoloDeck, type RoloDeckDivider } from './RoloDeck.tsx'

const FILE_PAGE_SIZE = 8

const PROJECT_PHOTO_DIVIDERS: readonly RoloDeckDivider[] = [
  { id: 'all', label: 'All', includes: card => card.kind === 'photo' },
  { id: 'before', label: 'Before', includes: card => card.kind === 'photo' && card.data.phase === 'before' },
  { id: 'during', label: 'During', includes: card => card.kind === 'photo' && card.data.phase === 'during' },
  { id: 'after', label: 'After', includes: card => card.kind === 'photo' && card.data.phase === 'after' },
  { id: 'reference', label: 'Reference', includes: card => card.kind === 'photo' && card.data.phase === 'reference' },
]

type PendingPhoto = {
  readonly file: DeviceFile
  readonly source: 'camera' | 'library'
}

export function ProjectFiles({ homeId, projectRef, projectTitle, readOnly = false }: {
  readonly homeId: string
  readonly projectRef: string
  readonly projectTitle: string
  readonly readOnly?: boolean
}) {
  const { state: auth, api, previewMode } = useSession()
  const uploadsEnabled = auth.kind === 'signed_in' && auth.session.capabilities.uploads
  const showUploadActions = !readOnly && (uploadsEnabled || previewMode)
  const loader = useCallback(async () => (await api.listArtifacts(homeId))
    .filter(artifact => artifact.projectRef === projectRef), [api, homeId, projectRef])
  const resource = useResource(loader, auth.kind === 'signed_in')
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null)
  const [photoDraft, setPhotoDraft] = useState<PhotoMetadataDraft>(() => newPhotoMetadataDraft())
  const [pendingGeoPin, setPendingGeoPin] = useState<ArtifactGeoPin | null>(null)
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [previewPhotoRef, setPreviewPhotoRef] = useState<string | null>(null)
  const [photoQuery, setPhotoQuery] = useState('')
  const [photoPhase, setPhotoPhase] = useState('all')
  const [fileLimit, setFileLimit] = useState(FILE_PAGE_SIZE)

  useEffect(() => {
    setPhotoQuery('')
    setPhotoPhase('all')
    setFileLimit(FILE_PAGE_SIZE)
    setPreviewPhotoRef(null)
    setPendingPhoto(null)
    setPendingGeoPin(null)
    setLocationBusy(false)
    setLocationMessage(null)
    setPhotoDraft(newPhotoMetadataDraft())
  }, [projectRef])

  useEffect(() => {
    if (!pendingPhoto) return undefined
    const file = pendingPhoto.file
    return () => { revokeBrowserDeviceFileUrl(file) }
  }, [pendingPhoto])

  async function selectPhoto(source: 'camera' | 'library') {
    if (previewMode) {
      setError(PREVIEW_UPLOAD_NOTICE)
      return
    }
    if (!uploadsEnabled) return
    if (uploading) return
    setUploading(source)
    setError(null)
    setNotice(null)
    try {
      const file = await pickPhoto(source)
      if (!file) return
      setPhotoDraft(newPhotoMetadataDraft())
      setPendingGeoPin(null)
      setLocationMessage(null)
      setPendingPhoto({ file, source })
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      setUploading(null)
    }
  }

  async function requestPendingPhotoLocation() {
    if (!pendingPhoto || pendingPhoto.source !== 'camera' || locationBusy || uploading) return
    setLocationBusy(true)
    setLocationMessage(null)
    try {
      const pin = await captureConfirmedDeviceLocation()
      setPendingGeoPin(pin)
      setPhotoDraft(current => ({ ...current, pinCurrentLocation: true }))
    } catch (caught) {
      setPendingGeoPin(null)
      setPhotoDraft(current => ({ ...current, pinCurrentLocation: false }))
      setLocationMessage(caught instanceof Error ? caught.message : 'Current location was unavailable. The photo can still be saved without a pin.')
    } finally {
      setLocationBusy(false)
    }
  }

  function clearPendingPhotoLocation() {
    if (locationBusy || uploading) return
    setPendingGeoPin(null)
    setLocationMessage(null)
    setPhotoDraft(current => ({ ...current, pinCurrentLocation: false }))
  }

  function cancelPendingPhoto() {
    if (locationBusy || uploading) return
    setPendingPhoto(null)
    setPendingGeoPin(null)
    setLocationMessage(null)
    setPhotoDraft(newPhotoMetadataDraft())
  }

  async function uploadFile(kind: Exclude<ArtifactKind, 'photo'>, source: 'document' | 'warranty') {
    if (previewMode) {
      setError(PREVIEW_UPLOAD_NOTICE)
      return
    }
    if (!uploadsEnabled) return
    if (uploading) return
    setUploading(source)
    setError(null)
    setNotice(null)
    let file: Awaited<ReturnType<typeof pickDocument>> = null
    try {
      file = await pickDocument()
      if (!file) return
      await api.uploadArtifact(homeId, kind, file, projectRef)
      setNotice(`${kind === 'warranty' ? 'Warranty' : 'File'} saved to this work.`)
      resource.reload()
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      if (file) revokeBrowserDeviceFileUrl(file)
      setUploading(null)
    }
  }

  async function savePendingPhoto() {
    if (!pendingPhoto || !uploadsEnabled || uploading) return
    let uploaded = false
    try {
      setError(null)
      setNotice(null)
      const details = normalizePhotoMetadataDraft(photoDraft)
      setUploading('photo')
      const geoPin = pendingPhoto.source === 'camera' && details.pinCurrentLocation
        ? pendingGeoPin
        : null
      if (details.pinCurrentLocation && !geoPin) throw new Error('Read and review the current location before saving this pin.')
      const artifact = await api.uploadArtifact(homeId, 'photo', pendingPhoto.file, projectRef)
      uploaded = true
      const metadata = artifactMetadataReplacement(artifact, {
        projectRef,
        observedOn: details.observedOn,
        phase: details.phase,
        areaLabel: details.areaLabel,
        geoPin,
      })
      await api.updateArtifactMetadata(homeId, artifact.artifactRef, {
        commandRef: await api.newCommandRef(),
        expectedRevision: artifact.revision,
        ...metadata,
      })
      setPendingPhoto(null)
      setPendingGeoPin(null)
      setLocationMessage(null)
      setPhotoDraft(newPhotoMetadataDraft())
      setNotice(`Photo saved and organized with this work${geoPin ? ' and the private location pin you confirmed' : ''}.`)
      resource.reload()
    } catch (caught) {
      if (uploaded) {
        setPendingPhoto(null)
        setPendingGeoPin(null)
        setLocationMessage(null)
        resource.reload()
        setError('The photo is saved to this work, but its date, area, stage, or location detail did not finish saving. The staged photo was cleared so retrying cannot upload a duplicate.')
      } else {
        setError(caught instanceof Error ? caught.message : friendlyError(caught))
      }
    } finally {
      setUploading(null)
    }
  }

  const artifacts = resource.state.kind === 'ready' ? resource.state.value : []
  const photos = artifacts
    .filter((item): item is ResolvedArtifactRecord => item.kind === 'photo')
    .sort((left, right) => (
      photoOrderDate(right).localeCompare(photoOrderDate(left))
      || right.createdAt.localeCompare(left.createdAt)
      || right.artifactRef.localeCompare(left.artifactRef)
    ))
  const photoEntries = homeLibraryEntries(photos, [], []).map(entry => entry.source === 'uploads'
    ? { ...entry, projectLabel: projectTitle, searchText: `${entry.searchText} ${projectTitle}` }
    : entry)
  const photoCards = homeLibraryEntryCards(photoEntries)
  const files = artifacts.filter(item => item.kind !== 'photo')
  const previewPhoto = previewPhotoRef
    ? photos.find(photo => photo.artifactRef === previewPhotoRef) ?? null
    : null

  return (
    <View style={styles.wrap}>
      <SectionTitle title="Photos & files" detail="Keep the evidence with this work, then choose exactly what a company may review." />
      {showUploadActions ? (
        <View style={styles.actions}>
          <FileAction icon="camera-outline" label="Take photo" busy={uploading === 'camera'} disabled={Boolean(uploading || pendingPhoto)} onPress={() => void selectPhoto('camera')} />
          <FileAction icon="images-outline" label="Choose photo" busy={uploading === 'library'} disabled={Boolean(uploading || pendingPhoto)} onPress={() => void selectPhoto('library')} />
          <FileAction icon="document-attach-outline" label="Add file" busy={uploading === 'document'} disabled={Boolean(uploading || pendingPhoto)} onPress={() => void uploadFile('document', 'document')} />
          <FileAction icon="shield-checkmark-outline" label="Add warranty" busy={uploading === 'warranty'} disabled={Boolean(uploading || pendingPhoto)} onPress={() => void uploadFile('warranty', 'warranty')} />
        </View>
      ) : !readOnly ? (
        <Notice message="Adding photos and files isn’t available for this work right now. Saved files are still readable." />
      ) : null}
      {resource.state.kind === 'loading' ? <Loading label="Opening project files…" /> : null}
      {resource.state.kind === 'error' ? <Notice message="Project files could not load." actionLabel="Try again" onAction={resource.reload} /> : null}
      {showUploadActions && error ? <Notice message={error} /> : null}
      {showUploadActions && notice ? <Text style={styles.savedNotice}>{notice}</Text> : null}

      {pendingPhoto ? (
        <PhotoUploadDetails
          file={pendingPhoto.file}
          source={pendingPhoto.source}
          contextLabel="this work record"
          draft={photoDraft}
          busy={uploading === 'photo'}
          locationPin={pendingGeoPin}
          locationBusy={locationBusy}
          locationMessage={locationMessage}
          onChange={setPhotoDraft}
          onRequestLocation={() => void requestPendingPhotoLocation()}
          onClearLocation={clearPendingPhotoLocation}
          onCancel={cancelPendingPhoto}
          onSave={() => void savePendingPhoto()}
        />
      ) : null}

      {photos.length > 0 ? (
        <RoloDeck
          testID="project-photo-rolo-deck"
          cards={photoCards}
          axis="horizontal"
          variant="full"
          cardHeight={430}
          peekSize={30}
          query={photoQuery}
          onQueryChange={setPhotoQuery}
          selectedDivider={photoPhase}
          onSelectedDividerChange={setPhotoPhase}
          dividers={PROJECT_PHOTO_DIVIDERS}
          searchPlaceholder="Search this work’s photos"
          emptyTitle="No photos match"
          emptyDetail="Try another stage or search term."
          renderMedia={card => card.kind === 'photo' ? (
            <ProtectedImage
              source={api.artifactPreviewSource(homeId, card.data.artifactRef)}
              style={styles.deckPhoto}
              resizeMode="cover"
            />
          ) : null}
          onOpen={openPhotoCard}
          onAskRolo={askRoloAboutPhoto}
        />
      ) : null}
      {files.slice(0, fileLimit).map(file => (
        <ArtifactFileCard
          key={file.artifactRef}
          title={file.displayName}
          detail={`${file.kind} · ${Math.max(1, Math.round(file.byteLength / 1024))} KB`}
          kind={file.kind}
          load={() => api.readArtifactContent(homeId, file)}
        />
      ))}
      {files.length > fileLimit ? (
        <Button
          label={`Show ${Math.min(FILE_PAGE_SIZE, files.length - fileLimit)} more files`}
          accessibilityHint={`${files.length - fileLimit} more project files are available`}
          onPress={() => setFileLimit(current => current + FILE_PAGE_SIZE)}
          quiet
        />
      ) : null}
      {resource.state.kind === 'ready' && artifacts.length === 0 ? (
        <Text style={styles.empty}>{showUploadActions
          ? 'Nothing attached yet. Add the first photo, estimate, receipt, or warranty when it matters.'
          : 'No photos or files have been saved with this work yet.'}</Text>
      ) : null}
      {previewPhoto ? (
        <PhotoPreview
          source={api.artifactPreviewSource(homeId, previewPhoto.artifactRef)}
          title={previewPhoto.displayName}
          detail={[
            previewPhoto.phase ? PHOTO_PHASE_LABEL[previewPhoto.phase] : 'Unsorted',
            previewPhoto.areaLabel,
            `${previewPhoto.observedOn ? 'Observed' : 'Saved'} ${friendlyPhotoDate(photoOrderDate(previewPhoto))}`,
          ].filter(Boolean).join(' · ')}
          geoPin={previewPhoto.geoPin}
          actionLabel="Ask Rolo"
          actionIcon="chatbubble-ellipses-outline"
          onAction={() => openPhotoInRolo(previewPhoto.artifactRef)}
          onClose={() => setPreviewPhotoRef(null)}
        />
      ) : null}
    </View>
  )

  function openPhotoCard(card: HomesroloCard) {
    if (card.kind !== 'photo') return
    setPreviewPhotoRef(card.data.artifactRef)
  }

  function askRoloAboutPhoto(card: HomesroloCard) {
    if (card.kind !== 'photo') return
    openPhotoInRolo(card.data.artifactRef)
  }

  function openPhotoInRolo(artifactRef: string) {
    setPreviewPhotoRef(null)
    router.push({
      pathname: '/home/[homeId]/rolo',
      params: {
        homeId,
        projectRef,
        artifactRef,
        prompt: 'Help me review this saved photo in the context of this work. What does it show, what can’t it confirm, and what should I do next?',
      },
    })
  }
}

function photoOrderDate(photo: ResolvedArtifactRecord): string {
  return photo.observedOn ?? photo.createdAt.slice(0, 10)
}

function friendlyPhotoDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(parsed)
}

function FileAction({ icon, label, busy, disabled, onPress }: {
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly label: string
  readonly busy: boolean
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
      style={({ pressed }) => [styles.action, disabled && styles.actionDisabled, pressed && !disabled && styles.pressed]}
    >
      <Ionicons name={icon} size={22} color={colors.lime} />
      <Text style={styles.actionText}>{busy ? 'Saving…' : label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexGrow: 1, flexBasis: '47%', minHeight: 72, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkRaised, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 6 },
  actionDisabled: { opacity: 0.48 },
  actionText: { color: colors.cream, fontSize: 11, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  deckPhoto: { width: '100%', height: '100%', backgroundColor: colors.inkSoft },
  savedNotice: { color: colors.mint, fontSize: 12, lineHeight: 17, paddingHorizontal: 2 },
  empty: { color: colors.slate, fontSize: 13, lineHeight: 19, paddingHorizontal: 2 },
})
