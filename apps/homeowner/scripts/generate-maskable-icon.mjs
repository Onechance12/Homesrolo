import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const directory = path.dirname(fileURLToPath(import.meta.url))
const publicDirectory = path.resolve(directory, '../public')
const source = path.join(publicDirectory, 'icon-512.png')
const destination = path.join(publicDirectory, 'icon-maskable-512.png')

// Maskable icons may be cropped to circles, squircles, or vendor-specific
// shapes. Keep the complete Homesrolo loop inside the standard 80% safe zone
// while allowing the navy field to extend through every possible mask.
await sharp(source)
  .resize(400, 400, { fit: 'fill' })
  .flatten({ background: '#071c27' })
  .extend({
    top: 56,
    right: 56,
    bottom: 56,
    left: 56,
    background: '#071c27',
  })
  .png({ compressionLevel: 9 })
  .toFile(destination)
