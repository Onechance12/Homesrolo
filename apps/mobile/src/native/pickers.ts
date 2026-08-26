import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import type { ArtifactMediaType, DeviceFile } from '../api/model.ts'

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

function sizeFor(uri: string, supplied: number | null | undefined): number {
  if (typeof supplied === 'number' && Number.isInteger(supplied) && supplied > 0) return supplied
  return new File(uri).size ?? 0
}

function photoFromResult(
  result: ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult | null,
): DeviceFile | null {
  if (!result) return null
  if ('code' in result) throw new Error('photo_picker_recovery_failed')
  if (result.canceled || !result.assets[0]) return null
  const asset = result.assets[0]
  const name = asset.fileName || `home-photo-${Date.now()}.jpg`
  const type = mediaType(asset.mimeType, name)
  if (!type || type === 'application/pdf') throw new Error('choose_jpeg_or_png')
  const byteLength = sizeFor(asset.uri, asset.fileSize)
  if (byteLength < 1) throw new Error('empty_file')
  return { uri: asset.uri, name, mediaType: type, byteLength }
}

export async function pickPhoto(source: 'camera' | 'library'): Promise<DeviceFile | null> {
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
  const byteLength = sizeFor(asset.uri, asset.size)
  if (byteLength < 1) throw new Error('empty_file')
  return {
    uri: asset.uri,
    name: asset.name,
    mediaType: type,
    byteLength,
  }
}
