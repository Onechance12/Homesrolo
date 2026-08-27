import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectGeneratedShellDependencies,
  createShellRevision,
  FIXED_HOSTED_SHELL_ASSETS,
  renderShellPrecacheManifest,
} from './shell-precache.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const mobileDirectory = path.resolve(scriptDirectory, '..')
const homeownerDirectory = path.resolve(mobileDirectory, '../homeowner')
const homeownerPublicDirectory = path.join(homeownerDirectory, 'public')
const expoCli = path.join(mobileDirectory, 'node_modules/expo/bin/cli')
const shellManifestPath = path.join(homeownerPublicDirectory, 'expo-shell-assets.js')

const STATIC_SHELL_FINGERPRINTS = [
  ['/apple-icon.png', path.join(homeownerDirectory, 'app/apple-icon.png')],
  ['/icon.svg', path.join(homeownerDirectory, 'app/icon.svg')],
  ['/icon-192.png', path.join(homeownerPublicDirectory, 'icon-192.png')],
  ['/icon-512.png', path.join(homeownerPublicDirectory, 'icon-512.png')],
  ['/icon-maskable-512.png', path.join(homeownerPublicDirectory, 'icon-maskable-512.png')],
  ['/manifest.webmanifest', path.join(homeownerDirectory, 'app/manifest.ts')],
  ['/register-sw.js', path.join(homeownerPublicDirectory, 'register-sw.js')],
]

const hostedHead = `
    <meta name="theme-color" content="#071c27" />
    <meta name="application-name" content="Homesrolo" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Homesrolo" />
    <meta name="robots" content="noindex,nofollow" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/apple-icon.png" />
    <link rel="icon" href="/icon-192.png" sizes="192x192" type="image/png" />`

const serviceWorkerRegistration = '<script src="/register-sw.js" defer></script>'

function hostedShell(source) {
  if (!source.includes('</head>') || !source.includes('</body>')) {
    throw new Error('Expo web export did not contain a complete HTML shell.')
  }
  return source
    .replace('<title>Homesrolo</title>', '<title>Homesrolo — your home, handled</title>')
    .replace('</head>', `${hostedHead}\n  </head>`)
    .replace('</body>', `${serviceWorkerRegistration}\n</body>`)
}

async function removeMacMetadata(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.name === '.DS_Store' || entry.name.startsWith('._')) {
      await rm(entryPath, { recursive: true, force: true })
    } else if (entry.isDirectory()) {
      await removeMacMetadata(entryPath)
    }
  }
}

function exportWeb(outputDirectory) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      expoCli,
      'export',
      '--platform', 'web',
      '--output-dir', outputDirectory,
    ], {
      cwd: mobileDirectory,
      stdio: 'inherit',
      env: {
        ...process.env,
        CI: '1',
        EXPO_PUBLIC_HOMESROLO_API_URL: 'https://app.homesrolo.com',
        EXPO_PUBLIC_HOMESROLO_PREVIEW_MODE: '0',
      },
    })
    child.once('error', reject)
    child.once('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`Expo web export exited with code ${code ?? 'unknown'}.`))
    })
  })
}

const exportDirectory = await mkdtemp(path.join(tmpdir(), 'homesrolo-hosted-web-'))

try {
  await exportWeb(exportDirectory)
  const sourceShell = await readFile(path.join(exportDirectory, 'index.html'), 'utf8')

  await mkdir(homeownerPublicDirectory, { recursive: true })
  await rm(path.join(homeownerPublicDirectory, '_expo'), { recursive: true, force: true })
  await rm(path.join(homeownerPublicDirectory, 'assets'), { recursive: true, force: true })
  await rm(path.join(homeownerPublicDirectory, 'expo-shell.html'), { force: true })
  await rm(shellManifestPath, { force: true })

  await cp(path.join(exportDirectory, '_expo'), path.join(homeownerPublicDirectory, '_expo'), {
    recursive: true,
  })
  await cp(path.join(exportDirectory, 'assets'), path.join(homeownerPublicDirectory, 'assets'), {
    recursive: true,
  })
  await removeMacMetadata(path.join(homeownerPublicDirectory, '_expo'))
  await removeMacMetadata(path.join(homeownerPublicDirectory, 'assets'))
  const shell = hostedShell(sourceShell)
  const generatedDependencies = await collectGeneratedShellDependencies({
    exportDirectory,
    sourceShell: shell,
  })
  const revisionEntries = [
    { url: '/expo-shell.html', content: shell },
    ...await Promise.all(STATIC_SHELL_FINGERPRINTS.map(async ([url, filePath]) => ({
      url,
      content: await readFile(filePath),
    }))),
    ...await Promise.all(generatedDependencies.map(async url => ({
      url,
      content: await readFile(path.resolve(exportDirectory, `.${url}`)),
    }))),
  ]
  const shellAssets = [
    ...new Set([...FIXED_HOSTED_SHELL_ASSETS, ...generatedDependencies]),
  ].sort()
  const shellManifest = renderShellPrecacheManifest({
    assets: shellAssets,
    revision: createShellRevision(revisionEntries),
  })

  await writeFile(path.join(homeownerPublicDirectory, 'expo-shell.html'), shell, 'utf8')
  await writeFile(shellManifestPath, shellManifest, 'utf8')
} finally {
  await rm(exportDirectory, { recursive: true, force: true })
}
