import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ui = readFileSync(new URL('./components/ui.tsx', import.meta.url), 'utf8')
const entry = readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8')
const startup = readFileSync(new URL('../app/start.tsx', import.meta.url), 'utf8')
const launchLoading = ui.slice(
  ui.indexOf('export function LaunchLoading'),
  ui.indexOf('export function Loading'),
)
const inlineLoading = ui.slice(
  ui.indexOf('export function Loading'),
  ui.indexOf('export function LaunchError'),
)

test('startup loading is a centered Homesrolo card deck instead of a generic spinner', () => {
  assert.match(launchLoading, /<SafeAreaView[\s\S]*edges=\{\['top', 'right', 'bottom', 'left'\]\}/)
  assert.match(launchLoading, /minHeight: Math\.max\(420, window\.height\)/)
  assert.match(ui, /loadingStage: \{[\s\S]*?flex: 1,[\s\S]*?justifyContent: 'center'/)
  assert.match(ui, /source=\{require\('\.\.\/\.\.\/assets\/icon-512\.png'\)\}/)
  assert.match(ui, /styles\.loadingCardBack/)
  assert.match(ui, /styles\.loadingFileTabTop/)
  assert.match(launchLoading, />homesrolo<\/Text>/)
  assert.doesNotMatch(launchLoading, /ActivityIndicator/)
})

test('startup motion follows the device reduced-motion preference', () => {
  assert.match(launchLoading, /useState\(true\)/)
  assert.match(launchLoading, /AccessibilityInfo\.isReduceMotionEnabled\(\)/)
  assert.match(launchLoading, /AccessibilityInfo\.addEventListener\('reduceMotionChanged'/)
  assert.match(launchLoading, /if \(reduceMotion\)/)
  assert.match(launchLoading, /accessibilityRole="progressbar"/)
  assert.match(launchLoading, /accessibilityLiveRegion="polite"/)
})

test('ordinary in-page loading stays compact instead of claiming the phone viewport', () => {
  assert.match(inlineLoading, /styles\.inlineLoading/)
  assert.match(inlineLoading, /styles\.inlineLoadingSegmentLime/)
  assert.doesNotMatch(inlineLoading, /SafeAreaView/)
  assert.doesNotMatch(inlineLoading, /window\.height/)
})

test('launch failures use the same centered Homesrolo surface with one clear retry', () => {
  assert.match(ui, /export function LaunchError/)
  assert.match(ui, /export function LaunchError[\s\S]*?minHeight: Math\.max\(420, window\.height\)/)
  assert.match(ui, /<LaunchDeck \/>/)
  assert.match(ui, /We couldn’t open the door\./)
  assert.match(ui, /icon="refresh-outline"/)
  assert.match(ui, /label=\{retryLabel\}/)
  assert.match(entry, /<LaunchLoading label="Opening Homesrolo…"/)
  assert.match(startup, /<LaunchLoading label="Opening your workspace…"/)
  assert.match(entry, /<LaunchError message=\{state\.message\}/)
  assert.doesNotMatch(entry, /<Page>[\s\S]*?<Notice/)
})
