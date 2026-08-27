import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { DeviceFile, HomeCheckupArea, HomeCheckupPhoto } from '../../../src/api/model.ts'
import { friendlyError } from '../../../src/api/errors.ts'
import { HOME_CHECKUP_AREAS } from '../../../src/api/home-checkup.ts'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { PhotoPreview } from '../../../src/components/PhotoPreview.tsx'
import { ProtectedImage } from '../../../src/components/ProtectedImage.tsx'
import { Button, Card, Chip, Loading, Notice, Page, SectionTitle, Tag, TextField } from '../../../src/components/ui.tsx'
import { useHomeId } from '../../../src/home/HomeRouteProvider.tsx'
import {
  groupedHomeCheckups,
  HOME_CHECKUP_AREA_LABEL,
  localCalendarDate,
  normalizeHomeCheckupViewLabel,
  validHomeCheckupDate,
} from '../../../src/home/checkups.ts'
import { useResource } from '../../../src/hooks/useResource.ts'
import { revokeBrowserDeviceFileUrl } from '../../../src/native/device-file-url.ts'
import { pickPhoto } from '../../../src/native/pickers.ts'
import { PREVIEW_UPLOAD_NOTICE } from '../../../src/preview/api.ts'
import { colors, radius, space } from '../../../src/theme.ts'

export default function HomeWatchScreen() {
  const homeId = useHomeId()
  const { state: auth, api, previewMode, refreshSession } = useSession()
  const enabled = auth.kind === 'signed_in' && auth.session.capabilities.photoCheckups
  const resource = useResource(useCallback(
    () => enabled ? api.listHomeCheckups(homeId) : Promise.resolve([]),
    [api, enabled, homeId],
  ), auth.kind === 'signed_in')
  const [formOpen, setFormOpen] = useState(false)
  const [observedOn, setObservedOn] = useState(() => localCalendarDate())
  const [area, setArea] = useState<HomeCheckupArea>('front_exterior')
  const [viewLabel, setViewLabel] = useState('')
  const [caption, setCaption] = useState('')
  const [file, setFile] = useState<DeviceFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [compareKey, setCompareKey] = useState<string | null>(null)
  const [preview, setPreview] = useState<HomeCheckupPhoto | null>(null)
  const [deleteRef, setDeleteRef] = useState<string | null>(null)
  const commandRef = useRef<string | null>(null)

  useEffect(() => () => { if (file) revokeBrowserDeviceFileUrl(file) }, [file])
  const groups = useMemo(() => resource.state.kind === 'ready'
    ? groupedHomeCheckups(resource.state.value)
    : [], [resource.state])

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'error') return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  if (!enabled) {
    return (
      <Page>
        <HomeHeader section="My Home" title="Home Watch" />
        <Notice message="Home Watch photos aren’t available for this account right now." />
        <Button
          label="Back to My Home"
          accessibilityHint="Returns to the Home tab"
          quiet
          onPress={() => router.replace({ pathname: '/home/[homeId]/care', params: { homeId } })}
        />
      </Page>
    )
  }

  const changed = () => { commandRef.current = null; setMessage(null) }
  async function choose(source: 'camera' | 'library') {
    if (previewMode) { setMessage(PREVIEW_UPLOAD_NOTICE); return }
    try {
      const selected = await pickPhoto(source)
      if (!selected) return
      if (file) revokeBrowserDeviceFileUrl(file)
      setFile(selected)
      changed()
    } catch (error) { setMessage(friendlyError(error)) }
  }

  async function save() {
    const normalizedViewLabel = normalizeHomeCheckupViewLabel(viewLabel)
    if (!file || !normalizedViewLabel || busy) return
    if (!validHomeCheckupDate(observedOn)) {
      setMessage('Use a real date in YYYY-MM-DD format. Home Watch cannot be dated in the future.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      commandRef.current ??= await api.newCommandRef()
      await api.uploadHomeCheckup(homeId, {
        commandRef: commandRef.current,
        observedOn,
        area,
        viewLabel: normalizedViewLabel,
        caption,
        file,
      })
      revokeBrowserDeviceFileUrl(file)
      setFile(null)
      setViewLabel('')
      setCaption('')
      commandRef.current = null
      setFormOpen(false)
      setMessage('Photo saved to Home Watch.')
      resource.reload()
    } catch (error) { setMessage(friendlyError(error)) } finally { setBusy(false) }
  }

  async function remove(photoRef: string) {
    if (previewMode) { setMessage('Preview photos stay in the local sample. Nothing was deleted.'); setDeleteRef(null); return }
    setBusy(true)
    setMessage(null)
    try {
      await api.deleteHomeCheckup(homeId, photoRef)
      setDeleteRef(null)
      setMessage('Photo removed from Home Watch.')
      resource.reload()
    } catch (error) { setMessage(friendlyError(error)) } finally { setBusy(false) }
  }

  return (
    <Page>
      <HomeHeader section="My Home" title="Home Watch" detail="Photograph the same spots over time. Roof Watch is the roof-specific part of Home Watch." />
      <Pressable accessibilityRole="button" accessibilityLabel="Back to My Home" accessibilityHint="Returns to the Home tab" onPress={() => router.replace({ pathname: '/home/[homeId]/care', params: { homeId } })} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Ionicons name="chevron-back" size={19} color={colors.lime} /><Text style={styles.backText}>My Home</Text>
      </Pressable>

      <Card accent>
        <View style={styles.watchHead}>
          <View style={styles.watchIcon}><Ionicons name="eye-outline" size={26} color={colors.ink} /></View>
          <View style={styles.flex}><Tag tone="lime">Private photo history</Tag><Text style={styles.watchTitle}>Same view. Different day.</Text></View>
        </View>
        <Text style={styles.copy}>Pick a repeatable spot—like the garage roofline or hall ceiling—then take the same photo again next season.</Text>
        <Button label={formOpen ? 'Close camera setup' : 'Add a checkup photo'} accessibilityHint={formOpen ? 'Closes the Home Watch photo form' : 'Opens the Home Watch photo form'} icon={formOpen ? 'close' : 'camera-outline'} onPress={() => { setFormOpen(current => !current); setMessage(null) }} />
      </Card>

      {formOpen ? (
        <Card>
          <SectionTitle title="What are you checking?" detail="A clear view name makes the next photo easy to match." />
          <Text style={styles.label}>Area</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.areaStrip}>
            {HOME_CHECKUP_AREAS.map(value => <Chip key={value} label={HOME_CHECKUP_AREA_LABEL[value]} selected={area === value} accessibilityHint={`Uses ${HOME_CHECKUP_AREA_LABEL[value].toLocaleLowerCase('en-US')} for this repeatable view`} onPress={() => { setArea(value); changed() }} />)}
          </ScrollView>
          <TextField label="View name" value={viewLabel} onChangeText={value => { setViewLabel(value); changed() }} placeholder="Garage roofline" hint="Use the same name next time so the photos pair up." maxLength={80} />
          <TextField label="Date observed" value={observedOn} onChangeText={value => { setObservedOn(value); changed() }} placeholder="YYYY-MM-DD" hint="Use a real date on or before today." keyboardType="numbers-and-punctuation" maxLength={10} />
          <TextField label="Short note" value={caption} onChangeText={value => { setCaption(value); changed() }} placeholder="Optional—write only what you saw" maxLength={240} multiline />
          <View style={styles.captureRow}>
            <CaptureButton icon="camera-outline" label="Take photo" hint="Opens the camera for this Home Watch view" onPress={() => void choose('camera')} />
            <CaptureButton icon="images-outline" label="Choose photo" hint="Opens your photo library for this Home Watch view" onPress={() => void choose('library')} />
          </View>
          {file ? (
            <View style={styles.selectedFile} accessibilityRole="summary">
              <Image source={{ uri: file.uri }} style={styles.selectedThumb} resizeMode="cover" accessibilityLabel="Selected Home Watch photo" />
              <Text style={styles.selectedText} numberOfLines={2}>{file.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove selected photo" accessibilityHint="Clears the photo before saving this Home Watch entry" hitSlop={8} onPress={() => { revokeBrowserDeviceFileUrl(file); setFile(null); changed() }} style={styles.removeFile}>
                <Ionicons name="close" size={20} color={colors.slate} />
              </Pressable>
            </View>
          ) : null}
          <Button label={busy ? 'Saving photo…' : 'Save to Home Watch'} accessibilityHint="Saves this private photo with its view name and date" icon="checkmark" disabled={busy || !file || !normalizeHomeCheckupViewLabel(viewLabel) || !validHomeCheckupDate(observedOn)} onPress={() => void save()} />
        </Card>
      ) : null}

      {message ? <Notice message={message} /> : null}
      <SectionTitle title={`Saved views · ${groups.length}`} detail="Two photos with the same area and view name can be compared side by side." />
      {resource.state.kind === 'loading' ? <Loading label="Opening Home Watch…" /> : null}
      {resource.state.kind === 'error' ? <Notice message="Home Watch could not load." actionLabel="Try again" onAction={resource.reload} /> : null}
      {groups.map(group => {
        const comparable = group.photos.length > 1
        const comparing = compareKey === group.key
        return (
          <Card key={group.key}>
            <View style={styles.groupHead}>
              <View style={styles.flex}>
                <Text style={styles.areaLabel}>{group.areaLabel}</Text>
                <Text style={styles.groupTitle}>{group.viewLabel}</Text>
                <Text style={styles.groupMeta}>{group.photos.length} {group.photos.length === 1 ? 'photo' : 'photos'} · latest {friendlyDate(group.photos[0]?.observedOn ?? '')}</Text>
              </View>
              {comparable ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${comparing ? 'Close' : 'Compare'} ${group.viewLabel} photos`}
                  accessibilityHint="Shows the latest two saved views side by side"
                  accessibilityState={{ expanded: comparing }}
                  onPress={() => setCompareKey(comparing ? null : group.key)}
                  style={({ pressed }) => [styles.compareButton, pressed && styles.pressed]}
                >
                  <Ionicons name="git-compare-outline" size={19} color={colors.lime} />
                  <Text style={styles.compareText}>{comparing ? 'Close' : 'Compare'}</Text>
                </Pressable>
              ) : null}
            </View>
            {comparing ? (
              <View style={styles.compareGrid}>
                <ComparePhoto label="Previous" photo={group.photos[1]!} source={api.homeCheckupPhotoSource(homeId, group.photos[1]!.photoRef, 'thumbnail')} onOpen={() => setPreview(group.photos[1]!)} />
                <ComparePhoto label="Latest" photo={group.photos[0]!} source={api.homeCheckupPhotoSource(homeId, group.photos[0]!.photoRef, 'thumbnail')} onOpen={() => setPreview(group.photos[0]!)} />
              </View>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyStrip}>
              {group.photos.map(photo => (
                <View key={photo.photoRef} style={styles.photoCard}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${group.viewLabel} photo from ${friendlyDate(photo.observedOn)}`}
                    accessibilityHint="Opens the full Home Watch photo"
                    onPress={() => setPreview(photo)}
                    style={({ pressed }) => [pressed && styles.pressed]}
                  >
                    <ProtectedImage source={api.homeCheckupPhotoSource(homeId, photo.photoRef, 'thumbnail')} style={styles.photo} resizeMode="cover" accessibilityLabel={`${group.viewLabel} on ${friendlyDate(photo.observedOn)}`} />
                    <View style={styles.photoCopy}><Text style={styles.photoDate}>{friendlyDate(photo.observedOn)}</Text><Text style={styles.photoCaption} numberOfLines={2}>{photo.caption || 'No note'}</Text></View>
                  </Pressable>
                  {deleteRef === photo.photoRef ? (
                    <View style={styles.deleteConfirm}>
                      <Text style={styles.deleteText}>Remove this photo?</Text>
                      <View style={styles.deleteActions}>
                        <Pressable accessibilityRole="button" accessibilityLabel="Keep photo" accessibilityHint="Closes this confirmation without removing anything" onPress={() => setDeleteRef(null)} style={styles.smallAction}><Text style={styles.smallActionText}>Keep</Text></Pressable>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${group.viewLabel} photo from ${friendlyDate(photo.observedOn)}`} accessibilityHint="Permanently removes this private Home Watch photo" accessibilityState={{ disabled: busy }} onPress={() => void remove(photo.photoRef)} disabled={busy} style={[styles.smallAction, styles.dangerAction]}><Text style={styles.dangerText}>{busy ? 'Removing…' : 'Delete'}</Text></Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${group.viewLabel} photo from ${friendlyDate(photo.observedOn)}`}
                      accessibilityHint="Asks for confirmation before removing the photo"
                      onPress={() => setDeleteRef(photo.photoRef)}
                      style={styles.deleteButton}
                    >
                      <Ionicons name="trash-outline" size={17} color={colors.smoke} /><Text style={styles.deleteButtonText}>Remove</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
          </Card>
        )
      })}
      {resource.state.kind === 'ready' && groups.length === 0 ? <Notice message="No Home Watch photos yet. Start with one spot you can photograph the same way again later." /> : null}
      <Text style={styles.boundary}>Home Watch keeps observations organized. A photo comparison does not diagnose damage or prove when a condition changed.</Text>

      {preview ? <PhotoPreview title={`${HOME_CHECKUP_AREA_LABEL[preview.area]} · ${preview.viewLabel}`} source={api.homeCheckupPhotoSource(homeId, preview.photoRef, 'full')} onClose={() => setPreview(null)} /> : null}
    </Page>
  )
}

function CaptureButton({ icon, label, hint, onPress }: {
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly label: string
  readonly hint: string
  readonly onPress: () => void
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} onPress={onPress} style={({ pressed }) => [styles.capture, pressed && styles.pressed]}>
      <Ionicons name={icon} size={24} color={colors.lime} /><Text style={styles.captureText}>{label}</Text>
    </Pressable>
  )
}

function ComparePhoto({ label, photo, source, onOpen }: {
  readonly label: string
  readonly photo: HomeCheckupPhoto
  readonly source: ReturnType<import('../../../src/api/contract.ts').HomesroloApi['homeCheckupPhotoSource']>
  readonly onOpen: () => void
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${label.toLowerCase()} photo from ${friendlyDate(photo.observedOn)}`} accessibilityHint="Opens the full Home Watch photo" onPress={onOpen} style={({ pressed }) => [styles.comparePhoto, pressed && styles.pressed]}>
      <ProtectedImage source={source} style={styles.compareImage} resizeMode="cover" />
      <Tag tone={label === 'Latest' ? 'lime' : 'plain'}>{label}</Tag>
      <Text style={styles.compareDate}>{friendlyDate(photo.observedOn)}</Text>
    </Pressable>
  )
}

function friendlyDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(parsed)
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
  backText: { color: colors.lime, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.78 },
  watchHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  watchIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  watchTitle: { color: colors.cream, fontSize: 19, lineHeight: 23, fontWeight: '900', marginTop: 5 },
  copy: { color: colors.slate, fontSize: 14, lineHeight: 21 },
  label: { color: colors.slate, fontSize: 13, fontWeight: '700' },
  areaStrip: { gap: 8, paddingRight: space.md },
  captureRow: { flexDirection: 'row', gap: space.sm },
  capture: { flex: 1, minHeight: 76, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkSoft, alignItems: 'center', justifyContent: 'center', gap: 7, padding: 10 },
  captureText: { color: colors.cream, fontSize: 12, fontWeight: '800' },
  selectedFile: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.mint, paddingLeft: 6 },
  selectedThumb: { width: 60, height: 60, borderRadius: radius.small, backgroundColor: colors.inkSoft },
  selectedText: { flex: 1, color: colors.cream, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  removeFile: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  areaLabel: { color: colors.lime, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  groupTitle: { color: colors.cream, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  groupMeta: { color: colors.slate, fontSize: 11, lineHeight: 16 },
  compareButton: { minHeight: 44, minWidth: 92, borderRadius: 22, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10 },
  compareText: { color: colors.cream, fontSize: 11, fontWeight: '800' },
  compareGrid: { flexDirection: 'row', gap: 9 },
  comparePhoto: { flex: 1, minWidth: 0, gap: 6 },
  compareImage: { width: '100%', aspectRatio: 1.18, borderRadius: radius.small, backgroundColor: colors.inkSoft },
  compareDate: { color: colors.slate, fontSize: 10, fontWeight: '700' },
  historyStrip: { gap: 10, paddingRight: space.md },
  photoCard: { width: 178, borderRadius: radius.medium, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkSoft },
  photo: { width: 176, height: 124, backgroundColor: colors.inkSoft },
  photoCopy: { gap: 4, padding: 10 },
  photoDate: { color: colors.cream, fontSize: 12, fontWeight: '900' },
  photoCaption: { color: colors.slate, fontSize: 11, lineHeight: 15 },
  deleteButton: { minHeight: 44, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  deleteButtonText: { color: colors.smoke, fontSize: 11, fontWeight: '800' },
  deleteConfirm: { minHeight: 80, borderTopWidth: 1, borderTopColor: colors.line, padding: 8, gap: 7 },
  deleteText: { color: colors.cream, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  deleteActions: { flexDirection: 'row', gap: 6 },
  smallAction: { flex: 1, minHeight: 44, borderRadius: radius.small, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  smallActionText: { color: colors.cream, fontSize: 11, fontWeight: '800' },
  dangerAction: { borderColor: colors.danger },
  dangerText: { color: colors.danger, fontSize: 11, fontWeight: '900' },
  boundary: { color: colors.smoke, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: space.md },
})
