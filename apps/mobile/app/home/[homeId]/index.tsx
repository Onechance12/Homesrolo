import { useCallback, useMemo, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, useLocalSearchParams } from 'expo-router'
import type { ArtifactKind } from '../../../src/api/model.ts'
import { friendlyError } from '../../../src/api/errors.ts'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { WorkCard } from '../../../src/components/WorkCard.tsx'
import { Button, Card, Loading, Metric, Notice, Page, SectionTitle, Tag } from '../../../src/components/ui.tsx'
import { useResource } from '../../../src/hooks/useResource.ts'
import { pickDocument, pickPhoto } from '../../../src/native/pickers.ts'
import { colors, radius, space } from '../../../src/theme.ts'

export default function HomeScreen() {
  const { homeId } = useLocalSearchParams<{ homeId: string }>()
  const { state: auth, api, refreshSession } = useSession()
  const width = useWindowDimensions().width
  const loader = useCallback(async () => {
    const [home, work, artifacts] = await Promise.all([
      api.getHome(homeId), api.listWork(homeId), api.listArtifacts(homeId),
    ])
    return { home, work: work.filter(item => !item.archived), artifacts }
  }, [api, homeId])
  const bundle = useResource(loader, auth.kind === 'signed_in')
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const cardWidth = Math.max(270, width - 64)
  const cards = useMemo(() => bundle.state.kind === 'ready'
    ? bundle.state.value.work.slice(0, 5)
    : [], [bundle.state])

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }
  if (bundle.state.kind === 'loading') return <Loading />
  if (bundle.state.kind === 'error') {
    return <Page><Notice message="This home could not open." actionLabel="Try again" onAction={bundle.reload} /></Page>
  }

  const { home, work, artifacts } = bundle.state.value
  const careCount = work.filter(item => item.workKind === 'service' || item.workKind === 'repair').length
  const photos = artifacts.filter(item => item.kind === 'photo')

  async function upload(kind: ArtifactKind, source: 'camera' | 'library' | 'document' | 'warranty') {
    try {
      setUploadError(null)
      setUploading(source)
      const file = source === 'document' || source === 'warranty'
        ? await pickDocument()
        : await pickPhoto(source)
      if (!file) return
      await api.uploadArtifact(homeId, kind, file)
      bundle.reload()
    } catch (error) { setUploadError(friendlyError(error)) } finally { setUploading(null) }
  }

  return (
    <Page>
      <HomeHeader
        section="Your home Rolo"
        title={home.displayLabel}
        detail={home.privateLocationLabel}
      />
      <Card accent>
        <View style={styles.metricRow}>
          <Metric value={work.length} label="work records" />
          <Metric value={artifacts.length} label="saved files" />
          <Metric value={careCount} label="care entries" />
        </View>
        <Text style={styles.privateLine}>Private by default. You decide what gets shared.</Text>
      </Card>

      <SectionTitle title="The cards in your Rolo" detail="Swipe through what this home has been through." />
      {cards.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + 12}
          decelerationRate="fast"
          contentContainerStyle={styles.carousel}
        >
          {cards.map(item => <View key={item.projectRef} style={{ width: cardWidth }}><WorkCard work={item} compact /></View>)}
        </ScrollView>
      ) : (
        <Card>
          <Tag tone="lime">First card</Tag>
          <Text style={styles.emptyTitle}>Start with anything worth remembering.</Text>
          <Text style={styles.emptyCopy}>An old repair, today’s AC problem, a receipt, or one photo is enough.</Text>
        </Card>
      )}

      <SectionTitle title="Capture it now" detail="Photos and files go straight into this private home record." />
      <View style={styles.captureGrid}>
        <Capture icon="camera-outline" label="Take photo" busy={uploading === 'camera'} onPress={() => void upload('photo', 'camera')} />
        <Capture icon="images-outline" label="Choose photo" busy={uploading === 'library'} onPress={() => void upload('photo', 'library')} />
        <Capture icon="document-attach-outline" label="Add file" busy={uploading === 'document'} onPress={() => void upload('document', 'document')} />
        <Capture icon="shield-checkmark-outline" label="Add warranty" busy={uploading === 'warranty'} onPress={() => void upload('warranty', 'warranty')} />
      </View>
      {uploadError ? <Notice message={uploadError} /> : null}

      {photos.length > 0 ? (
        <>
          <SectionTitle title="Photos this home remembers" detail="Private images saved to this address." />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
            {photos.slice(0, 12).map(photo => (
              <View key={photo.artifactRef} style={styles.photoCard}>
                <Image source={api.artifactPreviewSource(homeId, photo.artifactRef)} style={styles.photo} resizeMode="cover" />
                <Text style={styles.photoName} numberOfLines={2}>{photo.displayName}</Text>
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}

      {artifacts.some(item => item.kind !== 'photo') ? (
        <>
          <SectionTitle title="Files on hand" />
          {artifacts.filter(item => item.kind !== 'photo').slice(0, 4).map(file => (
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

      <Card>
        <View style={styles.watchIcon}><Ionicons name="scan-outline" size={24} color={colors.lime} /></View>
        <Text style={styles.watchTitle}>Home Watch looks at the whole house.</Text>
        <Text style={styles.emptyCopy}>Roof Watch is the roofing part of Home Watch—alongside heating and air, plumbing, exterior, electrical, safety, and seasonal condition photos.</Text>
      </Card>

      <SectionTitle title="Recently remembered" />
      {work.slice(0, 3).map(item => <WorkCard key={item.projectRef} work={item} />)}
      {work.length === 0 ? <Notice message="No work records yet. Tell Rolo what happened or add one from Work." /> : null}
      <Button label="Refresh this home" onPress={bundle.reload} quiet icon="refresh" />
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
    <Pressable disabled={busy} onPress={onPress} style={({ pressed }) => [styles.capture, pressed && styles.capturePressed]}>
      <Ionicons name={icon} size={25} color={colors.lime} />
      <Text style={styles.captureText}>{busy ? 'Saving…' : label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  metricRow: { flexDirection: 'row', gap: space.sm },
  privateLine: { color: colors.slate, fontSize: 12, paddingTop: 4 },
  carousel: { gap: 12, paddingRight: space.lg },
  emptyTitle: { color: colors.cream, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  emptyCopy: { color: colors.slate, fontSize: 14, lineHeight: 21 },
  captureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  capture: {
    width: '48%', minHeight: 96, gap: 9, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.medium, borderColor: colors.line, borderWidth: 1,
    backgroundColor: colors.inkRaised, paddingHorizontal: 8,
  },
  capturePressed: { backgroundColor: colors.inkSoft, transform: [{ scale: 0.98 }] },
  captureText: { color: colors.cream, fontSize: 12, fontWeight: '800', textAlign: 'center' },
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
  watchIcon: {
    width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.limeSoft,
  },
  watchTitle: { color: colors.cream, fontSize: 21, lineHeight: 26, fontWeight: '900' },
})
