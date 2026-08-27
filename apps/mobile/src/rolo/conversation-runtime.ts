import { Directory, File, Paths } from 'expo-file-system'
import {
  MAX_ROLO_CONVERSATION_CHARACTERS,
} from './conversation-persistence.ts'
import {
  createRoloConversationStorage,
  memoryRoloRawStorage,
  webRoloRawStorage,
  type RoloConversationStorage,
  type RoloRawStorage,
} from './conversation-storage.ts'

const DIRECTORY_NAME = 'homesrolo-rolo-v1'

export function createRoloStorageForPlatform(
  platform: string,
  previewMode: boolean,
): RoloConversationStorage {
  if (previewMode) return createRoloConversationStorage(memoryRoloRawStorage())
  return createRoloConversationStorage(platform === 'web'
    ? webRoloRawStorage()
    : nativeRoloRawStorage())
}

function nativeRoloRawStorage(): RoloRawStorage {
  const directory = new Directory(Paths.document, DIRECTORY_NAME)
  const fileFor = (key: string) => new File(directory, `${key}.json`)
  return {
    read: async key => {
      const file = fileFor(key)
      if (!file.exists) return null
      // The character limit is smaller than this byte guard. Refuse and remove
      // unexpected large files before allocating their contents.
      if (file.size > MAX_ROLO_CONVERSATION_CHARACTERS * 4) {
        file.delete()
        return null
      }
      return file.text()
    },
    write: async (key, value) => {
      if (value.length > MAX_ROLO_CONVERSATION_CHARACTERS) throw new Error('rolo_conversation_too_large')
      directory.create({ idempotent: true, intermediates: true })
      const file = fileFor(key)
      file.create({ overwrite: true, intermediates: true })
      file.write(value)
    },
    remove: async key => {
      const file = fileFor(key)
      if (file.exists) file.delete()
    },
    clear: async () => {
      if (directory.exists) directory.delete()
    },
  }
}
