import { File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import * as Sharing from 'expo-sharing'
import type { ArtifactContent } from '../api/model.ts'
import { safeCacheArtifactFileName } from './artifact-file-name.ts'

function webOpen(content: ArtifactContent): void {
  const copied = new Uint8Array(content.bytes.byteLength)
  copied.set(content.bytes)
  const url = URL.createObjectURL(new Blob([copied.buffer], { type: content.mediaType }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.download = content.displayName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Presents authenticated bytes without ever placing the bearer credential in a URL. */
export async function openArtifactContent(content: ArtifactContent): Promise<void> {
  if (Platform.OS === 'web') {
    webOpen(content)
    return
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('artifact_open_unavailable')
  const file = new File(Paths.cache, 'homesrolo-opened', safeCacheArtifactFileName(content))
  try {
    file.create({ intermediates: true, overwrite: true })
    file.write(content.bytes)
    await Sharing.shareAsync(file.uri, {
      dialogTitle: `Open ${content.displayName}`,
      mimeType: content.mediaType,
    })
  } finally {
    try { if (file.exists) file.delete() } catch { /* Cache cleanup is best effort. */ }
  }
}
