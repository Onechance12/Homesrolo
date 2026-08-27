import { useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { ArtifactKind } from '../api/model.ts'
import { friendlyError } from '../api/errors.ts'
import { useSession } from '../auth/SessionProvider.tsx'
import { useResource } from '../hooks/useResource.ts'
import { pickDocument, pickPhoto } from '../native/pickers.ts'
import { PREVIEW_UPLOAD_NOTICE } from '../preview/api.ts'
import { colors, radius, space } from '../theme.ts'
import { Loading, Notice, SectionTitle } from './ui.tsx'
import { PhotoPreview } from './PhotoPreview.tsx'
import { ArtifactFileCard } from './ArtifactFileCard.tsx'
import { ProtectedImage } from './ProtectedImage.tsx'

export function ProjectFiles({ homeId, projectRef }: {
  readonly homeId: string
  readonly projectRef: string
}) {
  const { state: auth, api, previewMode } = useSession()
  const loader = useCallback(async () => (await api.listArtifacts(homeId))
    .filter(artifact => artifact.projectRef === projectRef), [api, homeId, projectRef])
  const resource = useResource(loader, auth.kind === 'signed_in')
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewPhotoRef, setPreviewPhotoRef] = useState<string | null>(null)

  async function upload(kind: ArtifactKind, source: 'camera' | 'library' | 'document') {
    if (previewMode) {
      setError(PREVIEW_UPLOAD_NOTICE)
      return
    }
    setUploading(source)
    setError(null)
    try {
      const file = source === 'document' ? await pickDocument() : await pickPhoto(source)
      if (!file) return
      await api.uploadArtifact(homeId, kind, file, projectRef)
      resource.reload()
    } catch (caught) {
      setError(friendlyError(caught))
    } finally {
      setUploading(null)
    }
  }

  const artifacts = resource.state.kind === 'ready' ? resource.state.value : []
  const photos = artifacts.filter(item => item.kind === 'photo')
  const files = artifacts.filter(item => item.kind !== 'photo')

  return (
    <View style={styles.wrap}>
      <SectionTitle title="Photos & files" detail="Keep the evidence with this work, then choose exactly what a company may review." />
      <View style={styles.actions}>
        <FileAction icon="camera-outline" label="Take photo" busy={uploading === 'camera'} onPress={() => void upload('photo', 'camera')} />
        <FileAction icon="images-outline" label="Choose photo" busy={uploading === 'library'} onPress={() => void upload('photo', 'library')} />
        <FileAction icon="document-attach-outline" label="Add file" busy={uploading === 'document'} onPress={() => void upload('document', 'document')} />
      </View>
      {resource.state.kind === 'loading' ? <Loading label="Opening project files…" /> : null}
      {resource.state.kind === 'error' ? <Notice message="Project files could not load." actionLabel="Try again" onAction={resource.reload} /> : null}
      {error ? <Notice message={error} /> : null}

      {photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
          {photos.map(photo => (
            <Pressable
              key={photo.artifactRef}
              accessibilityRole="button"
              accessibilityLabel={`Open ${photo.displayName}`}
              onPress={() => setPreviewPhotoRef(photo.artifactRef)}
              style={({ pressed }) => [styles.photoCard, pressed && styles.pressed]}
            >
              <ProtectedImage source={api.artifactPreviewSource(homeId, photo.artifactRef)} style={styles.photo} resizeMode="cover" />
              <Text style={styles.photoName} numberOfLines={2}>{photo.displayName}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {files.map(file => (
        <ArtifactFileCard
          key={file.artifactRef}
          title={file.displayName}
          detail={`${file.kind} · ${Math.max(1, Math.round(file.byteLength / 1024))} KB`}
          kind={file.kind}
          load={() => api.readArtifactContent(homeId, file)}
        />
      ))}
      {resource.state.kind === 'ready' && artifacts.length === 0 ? (
        <Text style={styles.empty}>Nothing attached yet. Add the first photo, estimate, receipt, or warranty when it matters.</Text>
      ) : null}
      {previewPhotoRef ? (
        <PhotoPreview
          source={api.artifactPreviewSource(homeId, previewPhotoRef)}
          title={photos.find(photo => photo.artifactRef === previewPhotoRef)?.displayName ?? 'Project photo'}
          onClose={() => setPreviewPhotoRef(null)}
        />
      ) : null}
    </View>
  )
}

function FileAction({ icon, label, busy, onPress }: {
  readonly icon: keyof typeof Ionicons.glyphMap
  readonly label: string
  readonly busy: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable disabled={busy} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <Ionicons name={icon} size={22} color={colors.lime} />
      <Text style={styles.actionText}>{busy ? 'Saving…' : label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 72, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkRaised, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 6 },
  actionText: { color: colors.cream, fontSize: 11, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  photoStrip: { gap: 10, paddingRight: space.md },
  photoCard: { width: 168, borderRadius: radius.medium, overflow: 'hidden', backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.line },
  photo: { width: 168, height: 124, backgroundColor: colors.inkSoft },
  photoName: { color: colors.cream, fontSize: 11, lineHeight: 16, fontWeight: '700', padding: 10 },
  empty: { color: colors.slate, fontSize: 13, lineHeight: 19, paddingHorizontal: 2 },
})
