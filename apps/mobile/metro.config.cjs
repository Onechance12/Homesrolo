const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const config = getDefaultConfig(__dirname)

// The browser and PWA share a credential-free session invalidation protocol.
// Metro must see that source outside this package for web and native exports.
config.watchFolders = [
  ...config.watchFolders,
  path.resolve(__dirname, '../../shared'),
]

// ExFAT/APFS bridge volumes can create AppleDouble companions such as
// `._rolo.tsx`. They are metadata, not source files, and Expo Router must never
// discover or compile them as routes.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  /[/\\]\._[^/\\]+$/,
]

module.exports = config
