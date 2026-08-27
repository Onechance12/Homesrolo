import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  collectGeneratedShellDependencies,
  createShellRevision,
  FIXED_HOSTED_SHELL_ASSETS,
  MAX_HOSTED_SHELL_ASSETS,
  renderShellPrecacheManifest,
} from './shell-precache.mjs'

async function withExportFixture(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'homesrolo-shell-precache-test-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function fixtureFile(directory, assetPath, content = 'fixture') {
  const filePath = path.join(directory, assetPath.slice(1))
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content)
}

test('collects only the exact recursive dependency graph emitted by Expo', async () => {
  await withExportFixture(async exportDirectory => {
    await fixtureFile(exportDirectory, '/_expo/static/js/web/entry.abc123.js', `
      const font = '/assets/font.111aaa.ttf'
      const logo = '/assets/logo.222bbb.png?platform=web'
      const chunk = '/_expo/static/js/web/chunk.333ccc.js'
      const privateData = '/api/v1/session'
    `)
    await fixtureFile(exportDirectory, '/_expo/static/js/web/chunk.333ccc.js',
      `const styles = '/assets/theme.444ddd.css'`)
    await fixtureFile(exportDirectory, '/assets/theme.444ddd.css',
      `body { background: url('/assets/background.555eee.png') }`)
    await fixtureFile(exportDirectory, '/assets/font.111aaa.ttf')
    await fixtureFile(exportDirectory, '/assets/logo.222bbb.png')
    await fixtureFile(exportDirectory, '/assets/background.555eee.png')

    const dependencies = await collectGeneratedShellDependencies({
      exportDirectory,
      sourceShell: '<script src="/_expo/static/js/web/entry.abc123.js"></script>',
    })

    assert.deepEqual(dependencies, [
      '/_expo/static/js/web/chunk.333ccc.js',
      '/_expo/static/js/web/entry.abc123.js',
      '/assets/background.555eee.png',
      '/assets/font.111aaa.ttf',
      '/assets/logo.222bbb.png',
      '/assets/theme.444ddd.css',
    ])
    assert.ok(!dependencies.some(assetPath => assetPath.startsWith('/api/')))
  })
})

test('fails the export when a referenced shell dependency is missing', async () => {
  await withExportFixture(async exportDirectory => {
    await assert.rejects(
      collectGeneratedShellDependencies({
        exportDirectory,
        sourceShell: '<script src="/_expo/static/js/web/missing.js"></script>',
      }),
      /dependency is missing/,
    )
  })
})

test('renders a deterministic, bounded, public-only manifest', () => {
  const revision = createShellRevision([
    { url: '/b', content: Buffer.from('two') },
    { url: '/a', content: Buffer.from('one') },
  ])
  assert.equal(revision, createShellRevision([
    { url: '/a', content: Buffer.from('one') },
    { url: '/b', content: Buffer.from('two') },
  ]))

  const manifest = renderShellPrecacheManifest({
    assets: [...FIXED_HOSTED_SHELL_ASSETS, '/assets/logo.abc123.png'],
    revision,
  })
  assert.match(manifest, new RegExp(`homesrolo-shell-${revision}`))
  assert.match(manifest, /"\/assets\/logo\.abc123\.png"/)
  assert.throws(() => renderShellPrecacheManifest({
    assets: [...FIXED_HOSTED_SHELL_ASSETS, '/api/v1/private-home'],
    revision,
  }), /unsafe/)
  assert.throws(() => renderShellPrecacheManifest({
    assets: Array.from({ length: MAX_HOSTED_SHELL_ASSETS + 1 }, (_, index) => (
      `/assets/generated-${index}.hash.png`
    )),
    revision,
  }), /invalid asset count/)
})
