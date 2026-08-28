import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import type { ArtifactKind } from '../../../src/api/model.ts'
import { friendlyError } from '../../../src/api/errors.ts'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { ArtifactFileCard } from '../../../src/components/ArtifactFileCard.tsx'
import { PhotoPreview } from '../../../src/components/PhotoPreview.tsx'
import { ProtectedImage } from '../../../src/components/ProtectedImage.tsx'
import { Button, Card, Chip, Loading, Notice, Page, SectionTitle, TextField } from '../../../src/components/ui.tsx'
import { useHomeId } from '../../../src/home/HomeRouteProvider.tsx'
import { HOME_CHECKUP_AREA_LABEL } from '../../../src/home/checkups.ts'
import {
  homeLibraryEntries,
  homeLibraryPage,
  visibleHomeLibraryEntries,
  type HomeLibraryEntry,
  type HomeLibraryFilter,
  type HomeLibrarySort,
  type HomeLibrarySource,
} from '../../../src/home/library.ts'
import { useResource } from '../../../src/hooks/useResource.ts'
import { pickDocument, pickPhoto } from '../../../src/native/pickers.ts'
import { revokeBrowserDeviceFileUrl } from '../../../src/native/device-file-url.ts'
import { PREVIEW_UPLOAD_NOTICE } from '../../../src/preview/api.ts'
import { colors, radius, space } from '../../../src/theme.ts'

const PHOTO_PAGE_SIZE = 12
const FILE_PAGE_SIZE = 6

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
      work: work.filter(item => !item.archived),
      artifacts,
      checkups: checkupResult.value,
      checkupsUnavailable: checkupResult.unavailable,
    }
  }, [api, homeId, photoCheckupsEnabled])
  const resource = useResource(loader, auth.kind === 'signed_in')
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [previewPhoto, setPreviewPhoto] = useState<HomeLibraryEntry | null>(null)
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryFilter, setLibraryFilter] = useState<HomeLibraryFilter>(requestedLibraryFilter)
  const [librarySource, setLibrarySource] = useState<HomeLibrarySource>('all')
  const [libraryProject, setLibraryProject] = useState('all')
  const [librarySort, setLibrarySort] = useState<HomeLibrarySort>('newest')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [photoLimit, setPhotoLimit] = useState(PHOTO_PAGE_SIZE)
  const [fileLimit, setFileLimit] = useState(FILE_PAGE_SIZE)

  useEffect(() => {
    setPhotoLimit(PHOTO_PAGE_SIZE)
    setFileLimit(FILE_PAGE_SIZE)
  }, [libraryFilter, libraryProject, libraryQuery, librarySort, librarySource])

  useEffect(() => {
    if (requestedLibraryFilter !== 'all') setLibraryFilter(requestedLibraryFilter)
  }, [requestedLibraryFilter])

  const values = useMemo(() => {
    if (resource.state.kind !== 'ready') return null
    const { work, artifacts, checkups } = resource.state.value
    const newest = [...work].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    const entries = homeLibraryEntries(artifacts, checkups, work)
    const visible = visibleHomeLibraryEntries(
      entries,
      libraryQuery,
      libraryFilter,
      librarySource,
      libraryProject,
      librarySort,
    )
    return {
      newest,
      entries,
      photos: visible.filter(item => item.kind === 'photo'),
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
  const photoPage = homeLibraryPage(values.photos, photoLimit)
  const filePage = homeLibraryPage(values.files, fileLimit)
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
  }

  async function upload(kind: ArtifactKind, source: 'camera' | 'library' | 'document' | 'warranty') {
    if (previewMode) {
      setUploadError(PREVIEW_UPLOAD_NOTICE)
      return
    }
    if (!uploadsEnabled) return
    let file: Awaited<ReturnType<typeof pickPhoto>> = null
    try {
      setUploadError(null)
      setUploading(source)
      file = source === 'document' || source === 'warranty'
        ? await pickDocument()
        : await pickPhoto(source)
      if (!file) return
      await api.uploadArtifact(homeId, kind, file)
      resource.reload()
    } catch (error) { setUploadError(friendlyError(error)) } finally {
      if (file) revokeBrowserDeviceFileUrl(file)
      setUploading(null)
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
      </View>

      {showUploadActions ? (
        <>
          <SectionTitle title="Add to this home" detail="Capture a photo, document, or warranty without creating work first." />
          <View style={styles.captureGrid}>
            <Capture icon="camera-outline" label="Take photo" busy={uploading === 'camera'} onPress={() => void upload('photo', 'camera')} />
            <Capture icon="images-outline" label="Choose photo" busy={uploading === 'library'} onPress={() => void upload('photo', 'library')} />
            <Capture icon="document-attach-outline" label="Add file" busy={uploading === 'document'} onPress={() => void upload('document', 'document')} />
            <Capture icon="shield-checkmark-outline" label="Add warranty" busy={uploading === 'warranty'} onPress={() => void upload('warranty', 'warranty')} />
          </View>
          {uploadError ? <Notice message={uploadError} /> : null}
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={moreFiltersOpen ? 'Close library filters' : 'Open library filters'}
          accessibilityHint="Shows source, work, and sort choices"
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
            <Text style={styles.filterLabel}>Filed with</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip}>
              <Chip label="Any work" selected={libraryProject === 'all'} accessibilityHint="Shows items from all work and the whole home" onPress={() => setLibraryProject('all')} />
              <Chip label="Whole home" selected={libraryProject === 'unfiled'} accessibilityHint="Shows items not filed with one work record" onPress={() => setLibraryProject('unfiled')} />
              {values.newest.map(item => (
                <Chip
                  key={item.projectRef}
                  label={item.title}
                  selected={libraryProject === item.projectRef}
                  accessibilityHint={`Shows items filed with ${item.title}`}
                  onPress={() => setLibraryProject(item.projectRef)}
                />
              ))}
            </ScrollView>
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
          <SectionTitle title={`Photos · ${values.photos.length}`} detail="Private images saved to this home. Tap one to look closer." />
          {values.photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
            {photoPage.items.map(photo => (
              <Pressable
                key={photo.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${photo.title}`}
                accessibilityHint="Opens the full private home photo"
                onPress={() => setPreviewPhoto(photo)}
                style={({ pressed }) => [styles.photoCard, pressed && styles.pressed]}
              >
                <ProtectedImage
                  source={photo.source === 'uploads'
                    ? api.artifactPreviewSource(homeId, photo.artifact.artifactRef)
                    : api.homeCheckupPhotoSource(homeId, photo.checkup.photoRef, 'thumbnail')}
                  style={styles.photo}
                  resizeMode="cover"
                />
                <View style={styles.photoCopy}>
                  <Text style={styles.photoName} numberOfLines={2}>{photo.title}</Text>
                  <Text style={styles.photoMeta} numberOfLines={2}>{photo.source === 'home_watch'
                    ? `${HOME_CHECKUP_AREA_LABEL[photo.checkup.area]} · ${libraryDate(photo.date)}`
                    : `${photo.projectLabel} · ${libraryDate(photo.date)}`}</Text>
                  <Text style={styles.photoSource}>{photo.source === 'home_watch'
                    ? 'Home Watch'
                    : photo.projectRef ? 'Work photo' : 'Home photo'}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          ) : <Text style={styles.emptyLine}>{hasLibraryConstraint ? 'No photos match this view.' : 'No photos saved yet.'}</Text>}
          {photoPage.remaining > 0 ? (
            <Button
              label={`Show ${Math.min(PHOTO_PAGE_SIZE, photoPage.remaining)} more photos`}
              accessibilityHint={`${photoPage.remaining} more matching photos are available`}
              onPress={() => setPhotoLimit(current => current + PHOTO_PAGE_SIZE)}
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
          onClose={() => setPreviewPhoto(null)}
        />
      ) : null}
    </Page>
  )
}

function Capture({ icon, label, busy, onPress }: {
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly label: string
  readonly busy: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Adds a private item to this home"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.capture, pressed && styles.pressed]}
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
  captureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  capture: {
    width: '48%', minHeight: 96, gap: 9, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.medium, borderColor: colors.line, borderWidth: 1,
    backgroundColor: colors.inkRaised, paddingHorizontal: 8,
  },
  captureText: { color: colors.cream, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  libraryFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  photoStrip: { gap: 12, paddingRight: space.lg },
  photoCard: {
    width: 190, borderRadius: radius.medium, overflow: 'hidden',
    backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.line,
  },
  photo: { width: 190, height: 145, backgroundColor: colors.inkSoft },
  photoCopy: { gap: 4, padding: 11 },
  photoName: { color: colors.cream, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  photoMeta: { color: colors.slate, fontSize: 10, lineHeight: 14, textTransform: 'capitalize' },
  photoSource: { color: colors.lime, fontSize: 9, lineHeight: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
})
