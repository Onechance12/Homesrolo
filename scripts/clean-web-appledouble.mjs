import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const exportDirectory = fileURLToPath(new URL('../apps/web/out/', import.meta.url))

function removeAppleDouble(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)
    if (entry.name.startsWith('._')) {
      rmSync(entryPath, { recursive: true, force: true })
      continue
    }
    if (entry.isDirectory()) removeAppleDouble(entryPath)
  }
}

// macOS stores extended attributes as `._*` files on some external drives.
// They are not site assets and must never reach the static deploy or its guard.
removeAppleDouble(exportDirectory)
