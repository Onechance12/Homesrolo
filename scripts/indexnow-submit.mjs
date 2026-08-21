#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ORIGIN = 'https://homesrolo.com'
const HOST = 'homesrolo.com'
const KEY = 'ae05831592254a7653354c33657a5584'
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`
const DEFAULT_SITEMAP = path.join(process.cwd(), 'apps', 'web', 'out', 'sitemap.xml')

function usage() {
  console.log(`Usage: node scripts/indexnow-submit.mjs [--sitemap path] (--url https://homesrolo.com/path/ | --all) [--submit]

Without --submit, this command validates and prints a dry run. With --submit,
it first confirms the public key file is live, then posts the URL list to the
global IndexNow endpoint. Use it only after a production deployment containing
the matching key file. Each --url must exactly match a current sitemap entry.
Use --all only for a reviewed first activation or a true all-pages release.
Deleted-URL notifications are intentionally outside this command's scope.`)
}

export function parseArguments(argv) {
  const parsed = { submit: false, all: false, sitemap: DEFAULT_SITEMAP, urls: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--submit') parsed.submit = true
    else if (value === '--all') parsed.all = true
    else if (value === '--help' || value === '-h') parsed.help = true
    else if (value === '--sitemap') parsed.sitemap = path.resolve(argv[++index] ?? '')
    else if (value === '--url') parsed.urls.push(argv[++index] ?? '')
    else throw new Error(`unknown argument: ${value}`)
  }
  return parsed
}

export function readSitemapUrls(sitemapPath) {
  if (!existsSync(sitemapPath)) {
    throw new Error(`sitemap not found at ${sitemapPath}; run npm run web:build first`)
  }
  const xml = readFileSync(sitemapPath, 'utf8')
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
}

export function validateUrls(candidates, sitemapUrls) {
  const urls = [...new Set(candidates)]
  const sitemapSet = new Set(sitemapUrls)
  if (urls.length === 0) throw new Error('no URLs supplied or found in the sitemap')
  if (urls.length > 10_000) throw new Error(`IndexNow accepts at most 10,000 URLs; received ${urls.length}`)
  for (const candidate of urls) {
    const url = new URL(candidate)
    if (url.origin !== ORIGIN) throw new Error(`URL must use the canonical origin ${ORIGIN}: ${candidate}`)
    if (url.username || url.password || url.search || url.hash) throw new Error(`URL must be a clean canonical page URL: ${candidate}`)
    if (url.pathname !== '/' && !url.pathname.endsWith('/')) throw new Error(`page URL must use its canonical trailing slash: ${candidate}`)
    if (!sitemapSet.has(candidate)) throw new Error(`URL is not a current canonical sitemap entry: ${candidate}`)
  }
  return urls
}

export function selectCandidates(args, sitemapUrls) {
  if (args.all && args.urls.length > 0) throw new Error('choose either --all or one or more --url values')
  if (!args.all && args.urls.length === 0) throw new Error('provide at least one --url, or use explicit --all')
  return args.all ? sitemapUrls : args.urls
}

export async function verifyLiveKey(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(KEY_LOCATION, { headers: { 'user-agent': 'Homesrolo-IndexNow/1.0' } })
  const body = (await response.text()).trim()
  if (!response.ok || body !== KEY) {
    throw new Error(`public IndexNow key is not live at ${KEY_LOCATION}; deploy this change before submitting`)
  }
}

export async function submitUrlList(urlList, fetchImpl = globalThis.fetch) {
  await verifyLiveKey(fetchImpl)
  const payload = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }
  const response = await fetchImpl('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  })
  if (![200, 202].includes(response.status)) {
    const retryAfter = response.headers.get('retry-after')
    throw new Error(`IndexNow returned HTTP ${response.status}${retryAfter ? ` (retry after ${retryAfter})` : ''}`)
  }
  return response.status
}

export async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (args.help) return usage()

  const localKeyPath = path.join(process.cwd(), 'apps', 'web', 'public', `${KEY}.txt`)
  if (!existsSync(localKeyPath) || readFileSync(localKeyPath, 'utf8').trim() !== KEY) {
    throw new Error(`local IndexNow key file is missing or does not match: ${localKeyPath}`)
  }

  const sitemapUrls = readSitemapUrls(args.sitemap)
  const candidates = selectCandidates(args, sitemapUrls)
  const urlList = validateUrls(candidates, sitemapUrls)

  if (!args.submit) {
    console.log(`IndexNow dry run: ${urlList.length} canonical URL(s)`)
    console.log(`Key location: ${KEY_LOCATION}`)
    console.log('No request sent. Add --submit after the key file is deployed.')
    return
  }

  const status = await submitUrlList(urlList)
  console.log(`IndexNow accepted ${urlList.length} URL(s) with HTTP ${status}. Acceptance does not guarantee indexing or ranking.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`IndexNow submission failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
