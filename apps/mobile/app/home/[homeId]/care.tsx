import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import type { ArtifactGeoPin, ArtifactKind, DeviceFile, ResolvedArtifactRecord } from '../../../src/api/model.ts'
import { NativeApiError } from '../../../src/api/client.ts'
import { friendlyError } from '../../../src/api/errors.ts'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { ArtifactFileCard } from '../../../src/components/ArtifactFileCard.tsx'
import { PhotoUploadDetails } from '../../../src/components/PhotoUploadDetails.tsx'
import { SavedPhotoDetailsEditor } from '../../../src/components/SavedPhotoDetailsEditor.tsx'
import { PhotoPreview } from '../../../src/components/PhotoPreview.tsx'
import { ProtectedImage } from '../../../src/components/ProtectedImage.tsx'
import { Button, Card, Chip, Loading, Notice, Page, SectionTitle, TextField } from '../../../src/components/ui.tsx'
import { useHomeId } from '../../../src/home/HomeRouteProvider.tsx'
import {
  newPhotoMetadataDraft,
  normalizeExistingPhotoMetadataDraft,
  normalizePhotoMetadataDraft,
  PHOTO_PHASE_LABEL,
  type PhotoMetadataDraft,
} from '../../../src/home/photo-metadata.ts'
import {
  homeLibraryEntries,
  homeLibraryPage,
  homePhotoAlbums,
  matchingWorkChoices,
  visibleHomeLibraryEntries,
  type HomeLibraryEntry,
  type HomeLibraryFilter,
  type HomeLibrarySort,
  type HomeLibrarySource,
  type HomePhotoAlbum,
} from '../../../src/home/library.ts'
import { useResource } from '../../../src/hooks/useResource.ts'
import { pickDocument, pickPhoto } from '../../../src/native/pickers.ts'
import { revokeBrowserDeviceFileUrl } from '../../../src/native/device-file-url.ts'
import { captureConfirmedDeviceLocation } from '../../../src/native/current-location.ts'
import { PREVIEW_UPLOAD_NOTICE } from '../../../src/preview/api.ts'
import { colors, radius, space } from '../../../src/theme.ts'

const FILE_PAGE_SIZE = 6
const ALBUM_PAGE_SIZE = 8
const ALBUM_PHOTO_PAGE_SIZE = 12

type PendingPhoto = {
  readonly file: DeviceFile
  readonly source: 'camera' | 'library'
}

export default function MyHomeScreen() {
  const homeId = useHomeId()
  const { library: rawLibrary } = useLocalSearchParams<{ library?: string | string[] }>()
  const requestedLibraryFilter = requestedHomeLibrary(rawLibrary)
  const { state: auth, api, previewMode, refreshSession } = useSession()
  const photoCheckupsEnabled = auth.kind === 'signed_in' && auth.session.capabilities.photoCheckups
  const uploadsEnabled = auth.kind === 'signed_in' && auth.session.capabilities.uploads
  const showUploadActions = uploadsEnabled || previewMode
  const loader = useCallback(async () => {
    const [home, work, artifacts, checkupResult] = await Promise.all([
      api.getHome(homeId),
      api.listWork(homeId),
      api.listArtifacts(homeId),
      photoCheckupsEnabled
        ? api.listHomeCheckups(homeId)
          .then(value => ({ value, unavailable: false as const }))
          .catch(() => ({ value: [], unavailable: true as const }))
        : Promise.resolve({ value: [], unavailable: false as const }),
    ])
    return {
      home,
      work,
      artifacts,
      checkups: checkupResult.value,
      checkupsUnavailable: checkupResult.unavailable,
    }
  }, [api, homeId, photoCheckupsEnabled])
  const resource = useResource(loader, auth.kind === 'signed_in')
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [uploadProject, setUploadProject] = useState<string>('whole_home')
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null)
  const [photoDraft, setPhotoDraft] = useState<PhotoMetadataDraft>(() => newPhotoMetadataDraft())
  const [pendingGeoPin, setPendingGeoPin] = useState<ArtifactGeoPin | null>(null)
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [editingPhoto, setEditingPhoto] = useState<ResolvedArtifactRecord | null>(null)
  const [editingProject, setEditingProject] = useState<string | 'whole_home'>('whole_home')
  const [editDraft, setEditDraft] = useState<PhotoMetadataDraft>(() => newPhotoMetadataDraft())
  const [removeEditGeoPin, setRemoveEditGeoPin] = useState(false)
  const [editingBusy, setEditingBusy] = useState(false)
  const editAttempt = useRef<{ readonly intent: string; readonly commandRef: string } | null>(null)
  const [previewPhoto, setPreviewPhoto] = useState<HomeLibraryEntry | null>(null)
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryFilter, setLibraryFilter] = useState<HomeLibraryFilter>(requestedLibraryFilter)
  const [librarySource, setLibrarySource] = useState<HomeLibrarySource>('all')
  const [libraryProject, setLibraryProject] = useState('all')
  const [librarySort, setLibrarySort] = useState<HomeLibrarySort>('newest')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [uploadWorkQuery, setUploadWorkQuery] = useState('')
  const [browseWorkQuery, setBrowseWorkQuery] = useState('')
  const [fileLimit, setFileLimit] = useState(FILE_PAGE_SIZE)
  const [albumLimit, setAlbumLimit] = useState(ALBUM_PAGE_SIZE)
  const [expandedPhotoAlbum, setExpandedPhotoAlbum] = useState<string | null>(null)
  const [albumPhotoLimit, setAlbumPhotoLimit] = useState(ALBUM_PHOTO_PAGE_SIZE)

  useEffect(() => {
    setFileLimit(FILE_PAGE_SIZE)
    setAlbumLimit(ALBUM_PAGE_SIZE)
    setExpandedPhotoAlbum(null)
    setAlbumPhotoLimit(ALBUM_PHOTO_PAGE_SIZE)
  }, [libraryFilter, libraryProject, libraryQuery, librarySort, librarySource])

  useEffect(() => {
    if (uploadProject === 'whole_home' || resource.state.kind !== 'ready') return
    if (!resource.state.value.work.some(item => !item.archived && item.projectRef === uploadProject)) {
      setUploadProject('whole_home')
    }
  }, [resource.state, uploadProject])

  useEffect(() => {
    if (!pendingPhoto) return undefined
    const file = pendingPhoto.file
    return () => { revokeBrowserDeviceFileUrl(file) }
  }, [pendingPhoto])

  useEffect(() => {
    if (requestedLibraryFilter !== 'all') setLibraryFilter(requestedLibraryFilter)
  }, [requestedLibraryFilter])

  const values = useMemo(() => {
    if (resource.state.kind !== 'ready') return null
    const { work, artifacts, checkups } = resource.state.value
    const historyNewest = [...work].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    const newest = historyNewest.filter(item => !item.archived)
    const entries = homeLibraryEntries(artifacts, checkups, work)
    const visible = visibleHomeLibraryEntries(
      entries,
      libraryQuery,
      libraryFilter,
      librarySource,
      libraryProject,
      librarySort,
    )
    const photos = visible.filter(item => item.kind === 'photo')
    return {
      newest,
      historyNewest,
      entries,
      photos,
      photoAlbums: homePhotoAlbums(photos, librarySort),
      files: visible.filter((item): item is Extract<HomeLibraryEntry, { source: 'uploads' }> => (
        item.source === 'uploads' && item.kind !== 'photo'
      )),
    }
  }, [libraryFilter, libraryProject, libraryQuery, librarySort, librarySource, resource.state])

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Loading label="Opening your home…" />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }
  if (resource.state.kind === 'loading') return <Loading label="Opening your home…" />
  if (resource.state.kind === 'error' || !values) {
    const previewDetail = previewMode && resource.state.kind === 'error' ? ` (${resource.state.message})` : ''
    return <Page><Notice message={`My Home could not load.${previewDetail}`} actionLabel="Try again" onAction={resource.reload} /></Page>
  }

  const { home } = resource.state.value
  const filePage = homeLibraryPage(values.files, fileLimit)
  const albumPage = homeLibraryPage(values.photoAlbums, albumLimit)
  const uploadWorkChoices = matchingWorkChoices(
    values.newest,
    uploadWorkQuery,
    uploadProject === 'whole_home' ? null : uploadProject,
  )
  const browseWorkChoices = matchingWorkChoices(
    values.historyNewest,
    browseWorkQuery,
    libraryProject === 'all' || libraryProject === 'unfiled' ? null : libraryProject,
  )
  const hasLibraryConstraint = libraryFilter !== 'all' || librarySource !== 'all'
    || libraryProject !== 'all' || librarySort !== 'newest' || libraryQuery.trim().length > 0
  const showPhotos = libraryFilter === 'all' || libraryFilter === 'photos' || libraryFilter === 'unfiled'
  const showFiles = libraryFilter !== 'photos'

  function clearLibraryFilters() {
    setLibraryQuery('')
    setLibraryFilter('all')
    setLibrarySource('all')
    setLibraryProject('all')
    setLibrarySort('newest')
    setBrowseWorkQuery('')
  }

  async function selectPhoto(source: 'camera' | 'library') {
    if (previewMode) {
      setUploadError(PREVIEW_UPLOAD_NOTICE)
      return
    }
    if (!uploadsEnabled) return
    if (uploading || pendingPhoto) return
    try {
      setUploadError(null)
      setUploadNotice(null)
      setUploading(source)
      const file = await pickPhoto(source)
      if (!file) return
      setPhotoDraft(newPhotoMetadataDraft())
      setPendingGeoPin(null)
      setLocationMessage(null)
      setPendingPhoto({ file, source })
    } catch (error) { setUploadError(friendlyError(error)) } finally {
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
      setUploadError(PREVIEW_UPLOAD_NOTICE)
      return
    }
    if (!uploadsEnabled) return
    if (uploading || pendingPhoto) return
    let file: Awaited<ReturnType<typeof pickDocument>> = null
    try {
      setUploadError(null)
      setUploadNotice(null)
      setUploading(source)
      file = await pickDocument()
      if (!file) return
      await api.uploadArtifact(homeId, kind, file, uploadProject === 'whole_home' ? undefined : uploadProject)
      setUploadNotice(`${kind === 'warranty' ? 'Warranty' : 'File'} saved privately${uploadProject === 'whole_home' ? ' with this home' : ' with the selected work'}.`)
      resource.reload()
    } catch (error) { setUploadError(friendlyError(error)) } finally {
      if (file) revokeBrowserDeviceFileUrl(file)
      setUploading(null)
    }
  }

  async function savePendingPhoto() {
    if (!pendingPhoto || !uploadsEnabled || uploading) return
    let uploaded = false
    try {
      setUploadError(null)
      setUploadNotice(null)
      const details = normalizePhotoMetadataDraft(photoDraft)
      setUploading('photo')
      const geoPin = pendingPhoto.source === 'camera' && details.pinCurrentLocation
        ? pendingGeoPin
        : null
      if (details.pinCurrentLocation && !geoPin) throw new Error('Read and review the current location before saving this pin.')
      const projectRef = uploadProject === 'whole_home' ? null : uploadProject
      const artifact = await api.uploadArtifact(homeId, 'photo', pendingPhoto.file, projectRef ?? undefined)
      uploaded = true
      await api.updateArtifactMetadata(homeId, artifact.artifactRef, {
        commandRef: await api.newCommandRef(),
        expectedRevision: artifact.revision,
        projectRef,
        observedOn: details.observedOn,
        phase: details.phase,
        areaLabel: details.areaLabel,
        geoPin,
      })
      setPendingPhoto(null)
      setPendingGeoPin(null)
      setPhotoDraft(newPhotoMetadataDraft())
      setLocationMessage(null)
      setUploadNotice(`Photo saved to ${projectRef ? 'the selected work' : 'your home'}${geoPin ? ' with the private location pin you confirmed' : ''}.`)
      resource.reload()
    } catch (caught) {
      if (uploaded) {
        setPendingPhoto(null)
        setPendingGeoPin(null)
        setLocationMessage(null)
        resource.reload()
        setUploadError('The photo is saved privately, but its date and organization details could not be attached. Open it from the library and try again.')
      } else {
        setUploadError(caught instanceof Error ? caught.message : friendlyError(caught))
      }
    } finally {
      setUploading(null)
    }
  }

  function openPhotoEditor(artifact: ResolvedArtifactRecord) {
    setEditingPhoto(artifact)
    setEditingProject(artifact.projectRef ?? 'whole_home')
    setEditDraft({
      observedOn: artifact.observedOn ?? '',
      phase: artifact.phase ?? 'reference',
      areaLabel: artifact.areaLabel ?? '',
      pinCurrentLocation: false,
    })
    setRemoveEditGeoPin(false)
    editAttempt.current = null
    setUploadError(null)
    setUploadNotice(null)
  }

  async function savePhotoEditor() {
    if (!editingPhoto || editingBusy) return
    let details: ReturnType<typeof normalizeExistingPhotoMetadataDraft>
    try {
      details = normalizeExistingPhotoMetadataDraft(editDraft)
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : friendlyError(caught))
      return
    }
    try {
      setEditingBusy(true)
      setUploadError(null)
      setUploadNotice(null)
      const replacement = {
        projectRef: editingProject === 'whole_home' ? null : editingProject,
        observedOn: details.observedOn,
        phase: details.phase,
        areaLabel: details.areaLabel,
        geoPin: removeEditGeoPin ? null : editingPhoto.geoPin,
      } as const
      const intent = JSON.stringify({
        artifactRef: editingPhoto.artifactRef,
        expectedRevision: editingPhoto.revision,
        ...replacement,
      })
      const pending = editAttempt.current?.intent === intent
        ? editAttempt.current
        : { intent, commandRef: await api.newCommandRef() }
      editAttempt.current = pending
      await api.updateArtifactMetadata(homeId, editingPhoto.artifactRef, {
        commandRef: pending.commandRef,
        expectedRevision: editingPhoto.revision,
        ...replacement,
      })
      editAttempt.current = null
      setEditingPhoto(null)
      setRemoveEditGeoPin(false)
      setUploadNotice('Photo details saved. Search, albums, and the linked work now use them.')
      resource.reload()
    } catch (caught) {
      if (caught instanceof NativeApiError && caught.code === 'conflict') {
        editAttempt.current = null
        setEditingPhoto(null)
        setRemoveEditGeoPin(false)
        setUploadError('This photo changed on another screen. The latest library is loading; reopen the photo to edit it.')
        resource.reload()
      } else {
        setUploadError(friendlyError(caught))
      }
    } finally {
      setEditingBusy(false)
    }
  }

  return (
    <Page>
      <HomeHeader
        section="My Home"
        title={home.displayLabel}
        detail={home.privateLocationLabel}
      />

      <View style={styles.privacyRow}>
        <Ionicons name="lock-closed" size={15} color={colors.mint} />
        <Text style={styles.privateLine}>Private to this home. You decide what leaves it.</Text>
      </View>

      <SectionTitle title="Home record" detail="Property facts, systems, checkups, and the history that stays with this home." />
      <View style={styles.homeTools}>
        <HomeTool
          icon="information-circle-outline"
          title="Home details"
          detail="Address, year built, and major systems"
          onPress={() => router.push({ pathname: '/home/[homeId]/details', params: { homeId } })}
        />
        {auth.session.capabilities.photoCheckups ? (
          <HomeTool
            icon="eye-outline"
            title="Home Watch"
            detail="Whole-home checkups, including Roof Watch"
            onPress={() => router.push({ pathname: '/home/[homeId]/checkups', params: { homeId } })}
          />
        ) : null}
        <HomeTool
          icon="time-outline"
          title="Home timeline"
          detail="Work, photos, files, and checkups in date order"
          onPress={() => router.push({ pathname: '/home/[homeId]/timeline', params: { homeId } })}
        />
        <HomeTool
          icon="people-outline"
          title="People & companies"
          detail="Find, invite, and return to professionals for this home"
          onPress={() => router.push({ pathname: '/home/[homeId]/people', params: { homeId } })}
        />
      </View>

      {showUploadActions ? (
        <>
          <SectionTitle title="Add to this home" detail="Capture a photo, document, or warranty without creating work first." />
          {values.newest.length > 0 ? (
            <View style={styles.uploadTarget}>
              <Text style={styles.filterLabel}>File new uploads with</Text>
              {values.newest.length > 8 ? (
                <TextField
                  label="Find active work"
                  value={uploadWorkQuery}
                  onChangeText={setUploadWorkQuery}
                  placeholder="Kitchen, roof, wall repair…"
                  returnKeyType="search"
                  autoCorrect={false}
                  editable={!uploading && !pendingPhoto}
                />
              ) : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip}>
                <Chip label="Whole home" selected={uploadProject === 'whole_home'} disabled={Boolean(uploading || pendingPhoto)} accessibilityHint="Saves the next upload to the whole home" onPress={() => setUploadProject('whole_home')} />
                {uploadWorkChoices.map(item => (
                  <Chip
                    key={item.projectRef}
                    label={item.title}
                    selected={uploadProject === item.projectRef}
                    disabled={Boolean(uploading || pendingPhoto)}
                    accessibilityHint={`Files the next upload with ${item.title}`}
                    onPress={() => setUploadProject(item.projectRef)}
                  />
                ))}
              </ScrollView>
              {uploadWorkQuery.trim() && uploadWorkChoices.length === 0 ? <Text style={styles.choiceEmpty}>No active work matches that search.</Text> : null}
            </View>
          ) : null}
          <View style={styles.captureGrid}>
            <Capture icon="camera-outline" label="Take photo" busy={uploading === 'camera'} disabled={Boolean(uploading || pendingPhoto)} onPress={() => void selectPhoto('camera')} />
            <Capture icon="images-outline" label="Choose photo" busy={uploading === 'library'} disabled={Boolean(uploading || pendingPhoto)} onPress={() => void selectPhoto('library')} />
            <Capture icon="document-attach-outline" label="Add file" busy={uploading === 'document'} disabled={Boolean(uploading || pendingPhoto)} onPress={() => void uploadFile('document', 'document')} />
            <Capture icon="shield-checkmark-outline" label="Add warranty" busy={uploading === 'warranty'} disabled={Boolean(uploading || pendingPhoto)} onPress={() => void uploadFile('warranty', 'warranty')} />
          </View>
          {pendingPhoto ? (
            <PhotoUploadDetails
              file={pendingPhoto.file}
              source={pendingPhoto.source}
              contextLabel={uploadProject === 'whole_home'
                ? 'the whole home'
                : values.newest.find(item => item.projectRef === uploadProject)?.title ?? 'the selected work'}
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
          {uploadError ? <Notice message={uploadError} /> : null}
          {uploadNotice ? <Text style={styles.savedLine}>{uploadNotice}</Text> : null}
        </>
      ) : (
        <Notice message="Adding photos and files isn’t available right now. Your saved library is still here." />
      )}

      <SectionTitle title="Home library" detail="Photos, Home Watch views, documents, and warranties in one private place." />
      <Card>
        <TextField
          label="Find something"
          value={libraryQuery}
          onChangeText={setLibraryQuery}
          placeholder="Photo, warranty, file, or work name"
          returnKeyType="search"
          autoCorrect={false}
          hint="Searches saved photos, Home Watch views, files, areas, and related work."
        />
        <View style={styles.libraryFilters} accessibilityRole="tablist">
          {([
            ['all', 'Everything'], ['photos', 'Photos'], ['documents', 'Documents'],
            ['warranties', 'Warranties'], ['unfiled', 'Whole home'],
          ] as const).map(([value, label]) => (
            <Chip
              key={value}
              label={label}
              selected={libraryFilter === value}
              accessibilityHint={`Shows ${label.toLocaleLowerCase('en-US')} saved to this home`}
              onPress={() => setLibraryFilter(value)}
            />
          ))}
        </View>
        {values.historyNewest.length > 0 ? (
          <View style={styles.projectBrowse}>
            <Text style={styles.filterLabel}>Browse by work</Text>
            {values.historyNewest.length > 8 ? (
              <TextField
                label="Find a work record"
                value={browseWorkQuery}
                onChangeText={setBrowseWorkQuery}
                placeholder="Project name or category"
                returnKeyType="search"
                autoCorrect={false}
              />
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip}>
              <Chip label="All work" selected={libraryProject === 'all'} accessibilityHint="Shows every project and whole-home item" onPress={() => setLibraryProject('all')} />
              <Chip label="Whole home" selected={libraryProject === 'unfiled'} accessibilityHint="Shows items not filed with one work record" onPress={() => setLibraryProject('unfiled')} />
              {browseWorkChoices.map(item => (
                <Chip
                  key={item.projectRef}
                  label={item.title}
                  selected={libraryProject === item.projectRef}
                  accessibilityHint={`Shows items filed with ${item.title}`}
                  onPress={() => setLibraryProject(item.projectRef)}
                />
              ))}
            </ScrollView>
            {browseWorkQuery.trim() && browseWorkChoices.length === 0 ? <Text style={styles.choiceEmpty}>No work records match that search.</Text> : null}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={moreFiltersOpen ? 'Close library filters' : 'Open library filters'}
          accessibilityHint="Shows source and sort choices"
          accessibilityState={{ expanded: moreFiltersOpen }}
          onPress={() => setMoreFiltersOpen(current => !current)}
          style={({ pressed }) => [styles.filterToggle, pressed && styles.pressed]}
        >
          <Ionicons name="options-outline" size={18} color={colors.lime} />
          <Text style={styles.filterToggleText}>Filter & sort</Text>
          <Ionicons name={moreFiltersOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.slate} />
        </Pressable>
        {moreFiltersOpen ? (
          <View style={styles.advancedFilters}>
            <Text style={styles.filterLabel}>Source</Text>
            <View style={styles.libraryFilters} accessibilityRole="tablist">
              {([
                ['all', 'Every source'], ['uploads', 'Saved uploads'], ['home_watch', 'Home Watch'],
              ] as const).filter(([value]) => value !== 'home_watch' || photoCheckupsEnabled).map(([value, label]) => (
                <Chip
                  key={value}
                  label={label}
                  selected={librarySource === value}
                  accessibilityHint={`Limits the library to ${label.toLocaleLowerCase('en-US')}`}
                  onPress={() => setLibrarySource(value)}
                />
              ))}
            </View>
            <Text style={styles.filterLabel}>Order</Text>
            <View style={styles.libraryFilters} accessibilityRole="tablist">
              {([
                ['newest', 'Newest'], ['oldest', 'Oldest'], ['name', 'A–Z'],
              ] as const).map(([value, label]) => (
                <Chip
                  key={value}
                  label={label}
                  selected={librarySort === value}
                  accessibilityHint={`Sorts matching items by ${label.toLocaleLowerCase('en-US')}`}
                  onPress={() => setLibrarySort(value)}
                />
              ))}
            </View>
          </View>
        ) : null}
        <View style={styles.resultRow}>
          <Text style={styles.resultCount}>{values.photos.length + values.files.length} of {values.entries.length} saved items</Text>
          {hasLibraryConstraint ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear library filters"
              accessibilityHint="Shows the complete private library again"
              onPress={clearLibraryFilters}
              style={({ pressed }) => [styles.clearFilters, pressed && styles.pressed]}
            >
              <Text style={styles.clearFiltersText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      </Card>

      {resource.state.value.checkupsUnavailable ? (
        <Notice message="Saved uploads are shown, but Home Watch photos could not be added to this view." actionLabel="Try again" onAction={resource.reload} />
      ) : null}

      {showPhotos ? (
        <>
          {editingPhoto ? (
            <SavedPhotoDetailsEditor
              artifact={editingPhoto}
              work={values.historyNewest}
              projectRef={editingProject}
              draft={editDraft}
              busy={editingBusy}
              removeGeoPin={removeEditGeoPin}
              onProjectChange={setEditingProject}
              onChange={setEditDraft}
              onRemoveGeoPinChange={setRemoveEditGeoPin}
              onCancel={() => {
                editAttempt.current = null
                setEditingPhoto(null)
                setRemoveEditGeoPin(false)
              }}
              onSave={() => void savePhotoEditor()}
            />
          ) : null}
          <SectionTitle
            title={`Photo albums · ${values.photoAlbums.length}`}
            detail={`${values.photos.length} private photos grouped by work, area, and repeatable Home Watch view. Compare before and after—or earlier and later records.`}
          />
          {values.photoAlbums.length > 0 ? albumPage.items.map(album => {
            const expanded = expandedPhotoAlbum === album.id
            const previews = photoAlbumPreviews(album, expanded, albumPhotoLimit)
            const remaining = expanded ? Math.max(0, album.items.length - previews.length) : 0
            return (
              <Card key={album.id} style={styles.album}>
                <View style={styles.albumHeader}>
                  <View style={styles.albumHeading}>
                    <Text style={styles.albumTitle} numberOfLines={2}>{album.title}</Text>
                    <Text style={styles.albumMeta} numberOfLines={3}>{album.detail} · {album.items.length} {album.items.length === 1 ? 'photo' : 'photos'}</Text>
                  </View>
                  {album.projectRef ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${album.title} work record`}
                      hitSlop={8}
                      onPress={() => router.push({ pathname: '/home/[homeId]/work/[projectRef]', params: { homeId, projectRef: album.projectRef! } })}
                      style={({ pressed }) => [styles.albumLink, pressed && styles.pressed]}
                    >
                      <Text style={styles.albumLinkText}>Open work</Text>
                      <Ionicons name="arrow-forward" size={15} color={colors.lime} />
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.albumGrid}>
                  {previews.map(({ photo, label }) => (
                    <Pressable
                      key={`${album.id}:${photo.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${label.toLowerCase()} photo, ${photo.title}`}
                      accessibilityHint="Opens the full private home photo"
                      onPress={() => setPreviewPhoto(photo)}
                      style={({ pressed }) => [
                        styles.albumPhoto,
                        previews.length === 1 && styles.albumPhotoSingle,
                        pressed && styles.pressed,
                      ]}
                    >
                      <ProtectedImage
                        source={photo.source === 'uploads'
                          ? api.artifactPreviewSource(homeId, photo.artifact.artifactRef)
                          : api.homeCheckupPhotoSource(homeId, photo.checkup.photoRef, 'thumbnail')}
                        style={styles.albumImage}
                        resizeMode="cover"
                      />
                      <View style={styles.albumPhotoCopy}>
                        <Text style={styles.albumStage}>{label}</Text>
                        <Text style={styles.albumPhotoDate}>{photo.dateSource === 'observed' ? 'Observed' : 'Saved'} {libraryDate(photo.date)}</Text>
                        {photo.source === 'uploads' && (photo.artifact.areaLabel || photo.artifact.geoPin) ? (
                          <View style={styles.photoFacts}>
                            {photo.artifact.areaLabel ? <Text style={styles.photoFact} numberOfLines={1}>{photo.artifact.areaLabel}</Text> : null}
                            {photo.artifact.geoPin ? (
                              <View style={styles.pinFact}>
                                <Ionicons name="location-outline" size={11} color={colors.aqua} />
                                <Text style={styles.photoFact}>Pinned</Text>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
                {album.items.length > 2 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={expanded ? `Collapse ${album.title} photos` : `Show all ${album.items.length} ${album.title} photos`}
                    accessibilityState={{ expanded }}
                    onPress={() => {
                      setAlbumPhotoLimit(ALBUM_PHOTO_PAGE_SIZE)
                      setExpandedPhotoAlbum(current => current === album.id ? null : album.id)
                    }}
                    style={({ pressed }) => [styles.albumToggle, pressed && styles.pressed]}
                  >
                    <Text style={styles.albumToggleText}>{expanded ? 'Show earliest & latest' : `Open album · ${album.items.length}`}</Text>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.aqua} />
                  </Pressable>
                ) : null}
                {remaining > 0 ? (
                  <Button
                    label={`Show ${Math.min(ALBUM_PHOTO_PAGE_SIZE, remaining)} more photos`}
                    accessibilityHint={`${remaining} more photos remain in ${album.title}`}
                    onPress={() => setAlbumPhotoLimit(current => current + ALBUM_PHOTO_PAGE_SIZE)}
                    quiet
                  />
                ) : null}
              </Card>
            )
          }) : <Text style={styles.emptyLine}>{hasLibraryConstraint ? 'No photos match this view.' : 'No photos saved yet.'}</Text>}
          {albumPage.remaining > 0 ? (
            <Button
              label={`Show ${Math.min(ALBUM_PAGE_SIZE, albumPage.remaining)} more albums`}
              accessibilityHint={`${albumPage.remaining} more matching photo albums are available`}
              onPress={() => setAlbumLimit(current => current + ALBUM_PAGE_SIZE)}
              quiet
            />
          ) : null}
        </>
      ) : null}

      {showFiles ? (
        <>
          <SectionTitle title={`Files & warranties · ${values.files.length}`} />
          {values.files.length > 0 ? filePage.items.map(file => (
            <ArtifactFileCard
              key={file.artifact.artifactRef}
              title={file.title}
              detail={`${file.projectLabel} · ${libraryDate(file.date)} · ${file.kind} · ${Math.max(1, Math.round(file.artifact.byteLength / 1024))} KB`}
              kind={file.kind}
              load={() => api.readArtifactContent(homeId, file.artifact)}
            />
          )) : <Text style={styles.emptyLine}>{hasLibraryConstraint ? 'No files or warranties match this view.' : 'No files or warranties saved yet.'}</Text>}
          {filePage.remaining > 0 ? (
            <Button
              label={`Show ${Math.min(FILE_PAGE_SIZE, filePage.remaining)} more files`}
              accessibilityHint={`${filePage.remaining} more matching files are available`}
              onPress={() => setFileLimit(current => current + FILE_PAGE_SIZE)}
              quiet
            />
          ) : null}
        </>
      ) : null}

      {previewPhoto ? (
        <PhotoPreview
          source={previewPhoto.source === 'uploads'
            ? api.artifactPreviewSource(homeId, previewPhoto.artifact.artifactRef)
            : api.homeCheckupPhotoSource(homeId, previewPhoto.checkup.photoRef, 'full')}
          title={previewPhoto.title}
          detail={photoPreviewDetail(previewPhoto)}
          geoPin={previewPhoto.source === 'uploads' ? previewPhoto.artifact.geoPin : null}
          {...(previewPhoto.source === 'uploads' ? {
            actionLabel: 'Edit details',
            onAction: () => {
              openPhotoEditor(previewPhoto.artifact)
              setPreviewPhoto(null)
            },
          } : {})}
          onClose={() => setPreviewPhoto(null)}
        />
      ) : null}
    </Page>
  )
}

function Capture({ icon, label, busy, disabled, onPress }: {
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
      accessibilityHint="Adds a private item to this home"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.capture, disabled && styles.captureDisabled, pressed && !disabled && styles.pressed]}
    >
      <Ionicons name={icon} size={25} color={colors.lime} />
      <Text style={styles.captureText}>{busy ? 'Saving…' : label}</Text>
    </Pressable>
  )
}

function HomeTool({ icon, title, detail, onPress }: {
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
      style={({ pressed }) => [styles.homeTool, pressed && styles.pressed]}
    >
      <View style={styles.toolIcon}><Ionicons name={icon} size={22} color={colors.ink} /></View>
      <View style={styles.toolCopy}><Text style={styles.toolTitle}>{title}</Text><Text style={styles.toolDetail}>{detail}</Text></View>
      <Ionicons name="chevron-forward" size={20} color={colors.lime} />
    </Pressable>
  )
}

function libraryDate(value: string): string {
  const calendar = value.slice(0, 10)
  const parsed = new Date(`${calendar}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime())) return calendar
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(parsed)
}

function photoAlbumPreviews(album: HomePhotoAlbum, expanded: boolean, limit: number): readonly {
  readonly photo: HomeLibraryEntry
  readonly label: string
}[] {
  if (expanded) return album.items.slice(0, limit).map(photo => ({ photo, label: photoStageLabel(photo) }))
  if (album.items.length === 1) return [{ photo: album.latest, label: photoStageLabel(album.latest) }]
  const before = album.items.find(photo => photo.source === 'uploads' && photo.artifact.phase === 'before')
  const after = album.items.find(photo => photo.source === 'uploads' && photo.artifact.phase === 'after')
  if (before && after && before.id !== after.id) {
    return [{ photo: before, label: 'Before' }, { photo: after, label: 'After' }]
  }
  const bothObserved = album.first.dateSource === 'observed' && album.latest.dateSource === 'observed'
  return [
    { photo: album.first, label: bothObserved ? 'Earlier observed' : 'Earlier record' },
    { photo: album.latest, label: bothObserved ? 'Later observed' : 'Later record' },
  ]
}

function photoStageLabel(photo: HomeLibraryEntry): string {
  if (photo.source === 'home_watch') return 'Home Watch'
  return photo.artifact.phase ? PHOTO_PHASE_LABEL[photo.artifact.phase] : 'Saved photo'
}

function photoPreviewDetail(photo: HomeLibraryEntry): string {
  if (photo.source === 'home_watch') {
    return `Home Watch · ${libraryDate(photo.date)}${photo.checkup.caption ? ` · ${photo.checkup.caption}` : ''}`
  }
  return [
    photo.artifact.phase ? PHOTO_PHASE_LABEL[photo.artifact.phase] : 'Unsorted',
    photo.artifact.areaLabel,
    `${photo.artifact.observedOn ? 'Observed' : 'Saved'} ${libraryDate(photo.date)}`,
    photo.projectLabel,
  ].filter(Boolean).join(' · ')
}

function requestedHomeLibrary(value: string | string[] | undefined): HomeLibraryFilter {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'photos' || raw === 'documents' || raw === 'warranties' || raw === 'unfiled'
    ? raw
    : 'all'
}

const styles = StyleSheet.create({
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 },
  privateLine: { color: colors.slate, flex: 1, fontSize: 12, lineHeight: 17 },
  homeTools: { gap: space.sm },
  homeTool: { minHeight: 72, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkRaised, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  toolIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  toolCopy: { flex: 1, gap: 3 },
  toolTitle: { color: colors.cream, fontSize: 15, lineHeight: 19, fontWeight: '900' },
  toolDetail: { color: colors.slate, fontSize: 11, lineHeight: 16 },
  emptyLine: { color: colors.smoke, fontSize: 13, lineHeight: 18, paddingHorizontal: 2 },
  savedLine: { color: colors.mint, fontSize: 12, lineHeight: 17, paddingHorizontal: 2 },
  captureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  capture: {
    width: '48%', minHeight: 96, gap: 9, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.medium, borderColor: colors.line, borderWidth: 1,
    backgroundColor: colors.inkRaised, paddingHorizontal: 8,
  },
  captureDisabled: { opacity: 0.48 },
  captureText: { color: colors.cream, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  uploadTarget: { gap: 7 },
  libraryFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  projectBrowse: { gap: 7 },
  choiceEmpty: { color: colors.smoke, fontSize: 11, lineHeight: 16 },
  filterToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 },
  filterToggleText: { flex: 1, color: colors.cream, fontSize: 13, fontWeight: '800' },
  advancedFilters: { gap: 8 },
  filterLabel: { color: colors.slate, fontSize: 11, lineHeight: 15, fontWeight: '800' },
  filterStrip: { gap: 8, paddingRight: space.md },
  resultRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  resultCount: { color: colors.smoke, fontSize: 11, lineHeight: 16 },
  clearFilters: { minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  clearFiltersText: { color: colors.lime, fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  album: { gap: 11 },
  albumHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  albumHeading: { flex: 1, minWidth: 0, gap: 3 },
  albumTitle: { color: colors.cream, fontSize: 17, lineHeight: 21, fontWeight: '900' },
  albumMeta: { color: colors.slate, fontSize: 11, lineHeight: 16 },
  albumLink: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  albumLinkText: { color: colors.lime, fontSize: 11, fontWeight: '900' },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  albumPhoto: {
    flexGrow: 1, flexBasis: '47%', minWidth: 120, borderRadius: radius.medium, overflow: 'hidden',
    backgroundColor: colors.inkSoft, borderWidth: 1, borderColor: colors.line,
  },
  albumPhotoSingle: { width: '100%' },
  albumImage: { width: '100%', height: 118, backgroundColor: colors.inkSoft },
  albumPhotoCopy: { paddingHorizontal: 9, paddingVertical: 7, gap: 2 },
  albumStage: { color: colors.lime, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.45 },
  albumPhotoDate: { color: colors.slate, fontSize: 10, lineHeight: 14 },
  photoFacts: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  pinFact: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  photoFact: { color: colors.aqua, fontSize: 9, lineHeight: 13, fontWeight: '700' },
  albumToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: 1, borderTopColor: colors.line },
  albumToggleText: { color: colors.aqua, fontSize: 12, fontWeight: '900' },
})
