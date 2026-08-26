import type { ExpoConfig } from 'expo/config'

const apiUrl = process.env.EXPO_PUBLIC_HOMESROLO_API_URL?.trim()
  || 'https://app.homesrolo.com'

const config: ExpoConfig = {
  name: 'Homesrolo',
  slug: 'homesrolo',
  scheme: 'homesrolo',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  icon: '../homeowner/public/icon-512.png',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.homesrolo.app',
    associatedDomains: ['applinks:app.homesrolo.com'],
    infoPlist: {
      NSCameraUsageDescription: 'Homesrolo uses the camera only when you choose to photograph something for your private home record.',
      NSPhotoLibraryUsageDescription: 'Homesrolo opens your photo library only when you choose a photo for your private home record.',
    },
  },
  android: {
    package: 'com.homesrolo.app',
    adaptiveIcon: {
      foregroundImage: '../homeowner/public/icon-maskable-512.png',
      backgroundColor: '#071c27',
    },
    intentFilters: [{
      action: 'VIEW',
      autoVerify: true,
      data: [{ scheme: 'https', host: 'app.homesrolo.com', pathPrefix: '/' }],
      category: ['BROWSABLE', 'DEFAULT'],
    }],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-document-picker',
    ['expo-image-picker', {
      cameraPermission: 'Homesrolo uses the camera only when you choose to add a home photo.',
      photosPermission: 'Homesrolo opens your photos only when you choose something to save.',
    }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiUrl,
    clientContract: 'native.v1',
  },
}

export default config
