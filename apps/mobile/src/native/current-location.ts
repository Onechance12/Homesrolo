import * as Location from 'expo-location'

export interface ConfirmedDeviceGeoPin {
  readonly latitude: number
  readonly longitude: number
  readonly accuracyMeters: number
  readonly capturedAt: string
  readonly provenance: 'device_confirmed'
}

/**
 * Called only after the homeowner explicitly asks to pin the current device
 * location to one new photo. It never reads photo EXIF or runs in background.
 */
export async function captureConfirmedDeviceLocation(): Promise<ConfirmedDeviceGeoPin> {
  const permission = await Location.requestForegroundPermissionsAsync()
  if (permission.status !== 'granted') {
    throw new Error('Location was not allowed. The photo can still be saved without a pin.')
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  })
  const { latitude, longitude, accuracy } = location.coords
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Your current location could not be read. The photo can still be saved without a pin.')
  }

  return {
    latitude,
    longitude,
    accuracyMeters: Number.isFinite(accuracy) && accuracy !== null
      ? Math.max(0, Math.min(100_000, accuracy))
      : 100_000,
    capturedAt: new Date(Math.min(location.timestamp, Date.now())).toISOString(),
    provenance: 'device_confirmed',
  }
}
