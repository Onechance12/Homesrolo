import { useCallback, useMemo, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, router, useGlobalSearchParams } from 'expo-router'
import type { ArtifactKind } from '../../../src/api/model.ts'
import { friendlyError } from '../../../src/api/errors.ts'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { WorkCard } from '../../../src/components/WorkCard.tsx'
import { Button, Card, Loading, Metric, Notice, Page, SectionTitle, Tag } from '../../../src/components/ui.tsx'
import { useResource } from '../../../src/hooks/useResource.ts'
import { pickDocument, pickPhoto } from '../../../src/native/pickers.ts'
import { PREVIEW_UPLOAD_NOTICE } from '../../../src/preview/api.ts'
import { colors, radius, space } from '../../../src/theme.ts'

export default function MyHomeScreen() {
  const { homeId } = useGlobalSearchParams<{ homeId: string }>()
  const { state: auth, api, previewMode, refreshSession } = useSession()
  const width = useWindowDimensions().width
  const loader = useCallback(async () => {
    const [home, work, artifacts] = await Promise.all([
      api.getHome(homeId), api.listWork(homeId), api.listArtifacts(homeId),
    ])
    return { home, work: work.filter(item => !item.archived), artifacts }
  }, [api, homeId])
  const resource = useResource(loader, auth.kind === 'signed_in')
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const cardWidth = Math.max(270, width - 64)

  const values = useMemo(() => {
    if (resource.state.kind !== 'ready') return null
    const { work, artifacts } = resource.state.value
    const newest = [...work].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    const care = work.filter(item => item.workKind === 'service' || item.workKind === 'repair' || item.workKind === 'issue')
    return {
      newest,
      cards: newest.slice(0, 5),
      care,
      categories: new Set(work.map(item => item.category)),
      photos: artifacts.filter(item => item.kind === 'photo'),
      files: artifacts.filter(item => item.kind !== 'photo'),
    }
  }, [resource.state])

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

  const { home, work, artifacts } = resource.state.value

  async function upload(kind: ArtifactKind, source: 'camera' | 'library' | 'document' | 'warranty') {
    if (previewMode) {
      setUploadError(PREVIEW_UPLOAD_NOTICE)
      return
    }
    try {
      setUploadError(null)
      setUploading(source)
      const file = source === 'document' || source === 'warranty'
        ? await pickDocument()
        : await pickPhoto(source)
      if (!file) return
      await api.uploadArtifact(homeId, kind, file)
      resource.reload()
    } catch (error) { setUploadError(friendlyError(error)) } finally { setUploading(null) }
  }

  return (
    <Page>
      <HomeHeader
        section="My Home"
        title={home.displayLabel}
        detail={home.privateLocationLabel}
      />

      <Card accent>
        <View style={styles.metricRow}>
          <Metric value={work.length} label="work records" />
          <Metric value={artifacts.length} label="saved files" />
          <Metric value={values.care.length} label="care entries" />
        </View>
        <Text style={styles.privateLine}>This record grows quietly as you plan, fix, maintain, and finish work.</Text>
      </Card>

      <SectionTitle title="The cards in your Rolo" detail="Swipe through what this home has been through." />
      {values.cards.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + 12}
          decelerationRate="fast"
          contentContainerStyle={styles.carousel}
        >
          {values.cards.map(item => <View key={item.projectRef} style={{ width: cardWidth }}><WorkCard work={item} compact /></View>)}
        </ScrollView>
      ) : (
        <Card>
          <Tag tone="lime">Your first card</Tag>
          <Text style={styles.emptyTitle}>Work you start from Today will land here.</Text>
          <Text style={styles.copy}>You can also add an old repair, service visit, receipt, or photo whenever you have it.</Text>
        </Card>
      )}

      <SectionTitle title="Save to this home" detail="Keep a photo or file even when it is not attached to a plan yet." />
      <View style={styles.captureGrid}>
        <Capture icon="camera-outline" label="Take photo" busy={uploading === 'camera'} onPress={() => void upload('photo', 'camera')} />
        <Capture icon="images-outline" label="Choose photo" busy={uploading === 'library'} onPress={() => void upload('photo', 'library')} />
        <Capture icon="document-attach-outline" label="Add file" busy={uploading === 'document'} onPress={() => void upload('document', 'document')} />
        <Capture icon="shield-checkmark-outline" label="Add warranty" busy={uploading === 'warranty'} onPress={() => void upload('warranty', 'warranty')} />
      </View>
      {uploadError ? <Notice message={uploadError} /> : null}

      {values.photos.length > 0 ? (
        <>
          <SectionTitle title="Photos" detail="Private images saved to this home." />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
            {values.photos.slice(0, 12).map(photo => (
              <View key={photo.artifactRef} style={styles.photoCard}>
                <Image source={api.artifactPreviewSource(homeId, photo.artifactRef)} style={styles.photo} resizeMode="cover" />
                <Text style={styles.photoName} numberOfLines={2}>{photo.displayName}</Text>
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}

      {values.files.length > 0 ? (
        <>
          <SectionTitle title="Documents & warranties" />
          {values.files.slice(0, 6).map(file => (
            <Card key={file.artifactRef}>
              <View style={styles.fileRow}>
                <Ionicons name={file.kind === 'warranty' ? 'shield-checkmark-outline' : 'document-text-outline'} size={23} color={colors.aqua} />
                <View style={styles.fileCopy}>
                  <Text style={styles.fileName}>{file.displayName}</Text>
                  <Text style={styles.fileMeta}>{file.kind} · {Math.max(1, Math.round(file.byteLength / 1024))} KB</Text>
                </View>
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <SectionTitle title="Care & checkups" detail="Small habits make the record more useful without turning homeownership into homework." />
      <Card accent>
        <View style={styles.watchRow}>
          <View style={styles.watchIcon}><Ionicons name="eye-outline" size={27} color={colors.ink} /></View>
          <View style={styles.watchCopy}>
            <Tag tone="lime">Home Watch</Tag>
            <Text style={styles.watchTitle}>Check the whole home over time.</Text>
          </View>
        </View>
        <Text style={styles.copy}>Walk the same areas a few times a year and save what changed. Roof Watch is the roof-specific part of Home Watch.</Text>
        <Button
          label="Talk through a home checkup"
          icon="sparkles-outline"
          onPress={() => router.push({
            pathname: '/home/[homeId]/rolo',
            params: { homeId, prompt: 'Help me do a seasonal Home Watch checkup and record what I see.' },
          })}
        />
      </Card>

      <View style={styles.badges}>
        <Badge icon="camera-outline" title="Photo habit" earned={values.photos.length > 0} detail={`${values.photos.length} saved`} />
        <Badge icon="layers-outline" title="Whole home" earned={values.categories.size >= 3} detail={`${values.categories.size} areas`} />
        <Badge icon="checkmark-circle-outline" title="Care keeper" earned={values.care.length >= 3} detail={`${values.care.length} entries`} />
      </View>

      {values.newest.length > 0 ? (
        <>
          <SectionTitle title="Home history" detail="The same work records, ordered by the latest update." />
          {values.newest.slice(0, 5).map(item => <WorkCard key={item.projectRef} work={item} />)}
        </>
      ) : null}
      <Button label="Refresh My Home" onPress={resource.reload} quiet icon="refresh" />
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
    <Pressable disabled={busy} onPress={onPress} style={({ pressed }) => [styles.capture, pressed && styles.pressed]}>
      <Ionicons name={icon} size={25} color={colors.lime} />
      <Text style={styles.captureText}>{busy ? 'Saving…' : label}</Text>
    </Pressable>
  )
}

function Badge({ icon, title, detail, earned }: {
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly title: string
  readonly detail: string
  readonly earned: boolean
}) {
  return (
    <View style={[styles.badge, earned && styles.badgeEarned]}>
      <Ionicons name={icon} size={22} color={earned ? colors.lime : colors.smoke} />
      <Text style={styles.badgeTitle}>{title}</Text>
      <Text style={styles.badgeDetail}>{earned ? detail : 'Keep building'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  metricRow: { flexDirection: 'row', gap: space.sm },
  privateLine: { color: colors.slate, fontSize: 12, lineHeight: 17, paddingTop: 4 },
  carousel: { gap: 12, paddingRight: space.lg },
  emptyTitle: { color: colors.cream, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  copy: { color: colors.slate, fontSize: 14, lineHeight: 21 },
  captureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  capture: {
    width: '48%', minHeight: 96, gap: 9, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.medium, borderColor: colors.line, borderWidth: 1,
    backgroundColor: colors.inkRaised, paddingHorizontal: 8,
  },
  captureText: { color: colors.cream, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  photoStrip: { gap: 12, paddingRight: space.lg },
  photoCard: {
    width: 190, borderRadius: radius.medium, overflow: 'hidden',
    backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.line,
  },
  photo: { width: 190, height: 145, backgroundColor: colors.inkSoft },
  photoName: { color: colors.cream, fontSize: 12, lineHeight: 17, fontWeight: '700', padding: 11 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fileCopy: { flex: 1, gap: 3 },
  fileName: { color: colors.cream, fontSize: 15, fontWeight: '800' },
  fileMeta: { color: colors.slate, fontSize: 11, textTransform: 'capitalize' },
  watchRow: { flexDirection: 'row', gap: 13, alignItems: 'center' },
  watchIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  watchCopy: { flex: 1, gap: 7 },
  watchTitle: { color: colors.cream, fontSize: 19, lineHeight: 23, fontWeight: '900' },
  badges: { flexDirection: 'row', gap: space.sm },
  badge: {
    flex: 1, minHeight: 120, borderRadius: radius.medium, borderWidth: 1,
    borderColor: colors.line, backgroundColor: colors.inkRaised, padding: 12, gap: 6,
  },
  badgeEarned: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  badgeTitle: { color: colors.cream, fontWeight: '900', fontSize: 13 },
  badgeDetail: { color: colors.slate, fontSize: 11, lineHeight: 15 },
})
