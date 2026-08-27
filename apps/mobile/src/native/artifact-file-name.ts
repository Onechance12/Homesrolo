import type { ArtifactContent } from '../api/model.ts'

export function safeCacheArtifactFileName(content: Pick<ArtifactContent, 'artifactRef' | 'displayName'>): string {
  const leaf = content.displayName.replace(/\\/g, '/').split('/').at(-1) ?? ''
  const name = leaf
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._ -]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(-120) || 'Homesrolo file'
  const ref = content.artifactRef.replace(/[^A-Za-z0-9_-]/g, '').slice(-12) || 'artifact'
  return `${ref}-${name}`
}
