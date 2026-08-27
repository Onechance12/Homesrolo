import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import { Platform } from 'react-native'
import type { ArtifactMediaType, DeviceFile } from '../api/model.ts'
import {
  ownedWebPhotoDeviceFile,
  pickWebCameraPhoto,
  WEB_PHOTO_PICKER_MEDIA_TYPES,
} from './web-photo-file.ts'

function mediaType(value: string | null | undefined, name: string): ArtifactMediaType | null {
  const normalized = value?.toLowerCase()
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'image/jpeg'
  if (normalized === 'image/png') return 'image/png'
  if (normalized === 'application/pdf') return 'application/pdf'
  const extension = name.toLowerCase().split('.').pop()
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'pdf') return 'application/pdf'
  return null
}

function sizeFor(
  uri: string,
  supplied: number | null | undefined,
  browserFile?: Blob,
): number {
  if (typeof supplied === 'number' && Number.isInteger(supplied) && supplied > 0) return supplied
  if (browserFile && Number.isSafeInteger(browserFile.size) && browserFile.size > 0) {
    return browserFile.size
  }
  return new File(uri).size ?? 0
}

function photoFromResult(
  result: ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult | null,
): DeviceFile | null {
  if (!result) return null
  if ('code' in result) throw new Error('photo_picker_recovery_failed')
  if (result.canceled || !result.assets[0]) return null
  const asset = result.assets[0]
  const uriExtension = asset.uri.toLowerCase().split(/[?#]/, 1)[0]?.split('.').pop()
  const fallbackExtension = asset.mimeType?.toLowerCase() === 'image/png' || uriExtension === 'png'
    ? 'png'
    : 'jpg'
  // Keep the fallback stable so reselecting identical bytes after an ambiguous
  // upload does not create a new command merely because the clock changed.
  const name = asset.fileName?.trim() || `home-photo.${fallbackExtension}`
  const type = mediaType(asset.mimeType, name)
  if (!type || type === 'application/pdf') throw new Error('choose_jpeg_or_png')
  const byteLength = sizeFor(asset.uri, asset.fileSize, asset.file)
  if (byteLength < 1) throw new Error('empty_file')
  // Treat picker/camera results conservatively. In particular, a photo-library
  // URI is never ours to delete.
  return {
    uri: asset.uri,
    name,
    mediaType: type,
    byteLength,
    ...(asset.file ? { browserFile: asset.file } : {}),
    lifecycle: 'external-source',
  }
}

export async function pickPhoto(source: 'camera' | 'library'): Promise<DeviceFile | null> {
  if (Platform.OS === 'web' && source === 'camera') return pickWebCameraPhoto()
  if (Platform.OS === 'web') {
    const result = await DocumentPicker.getDocumentAsync({
      type: [...WEB_PHOTO_PICKER_MEDIA_TYPES],
      multiple: false,
      copyToCacheDirectory: false,
      base64: false,
    })
    if (result.canceled || !result.assets[0]) return null
    return ownedWebPhotoDeviceFile(result.assets[0])
  }
  if (source === 'camera') {
    const recovered = photoFromResult(await ImagePicker.getPendingResultAsync())
    if (recovered) return recovered
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) throw new Error('camera_permission_required')
  }
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.92 })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.92,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      })
  return photoFromResult(result)
}

export async function pickDocument(): Promise<DeviceFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/jpeg', 'image/png'],
    multiple: false,
    copyToCacheDirectory: true,
  })
  if (result.canceled || !result.assets[0]) return null
  const asset = result.assets[0]
  const type = mediaType(asset.mimeType, asset.name)
  if (!type) throw new Error('choose_pdf_jpeg_or_png')
  const byteLength = sizeFor(asset.uri, asset.size, asset.file)
  if (byteLength < 1) throw new Error('empty_file')
  return {
    uri: asset.uri,
    name: asset.name,
    mediaType: type,
    byteLength,
    ...(asset.file ? { browserFile: asset.file } : {}),
    lifecycle: asset.file ? 'external-source' : 'staged-cache',
  }
}
