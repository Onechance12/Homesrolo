import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const exportDirectory = fileURLToPath(new URL('../apps/web/out/', import.meta.url))

// Render can restore the previous static export before a build. Next replaces
// files that still exist, but a route removed from source may otherwise survive
// in that restored directory and remain publicly reachable. Remove only this
// app's generated export before Next writes the reviewed route set.
rmSync(exportDirectory, { recursive: true, force: true })
