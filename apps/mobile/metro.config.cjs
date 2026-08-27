const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// ExFAT/APFS bridge volumes can create AppleDouble companions such as
// `._rolo.tsx`. They are metadata, not source files, and Expo Router must never
// discover or compile them as routes.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  /[/\\]\._[^/\\]+$/,
]

module.exports = config
