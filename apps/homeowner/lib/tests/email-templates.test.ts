import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const directory = new URL('../../email-templates/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8')) as Record<string, {
  providerTemplate: string
  subject: string
  preheader: string
  file: string
}>

function contrast(first: string, second: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(offset => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
  }
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (values[0]! + 0.05) / (values[1]! + 0.05)
}

test('both Supabase email entry points have explicit subjects and installation files', () => {
  assert.deepEqual(Object.keys(manifest).sort(), ['confirmSignup', 'magicLink'])
  assert.equal(manifest.magicLink!.providerTemplate, 'Magic Link')
  assert.equal(manifest.confirmSignup!.providerTemplate, 'Confirm signup')
  assert.equal(manifest.magicLink!.file, 'magic-link.html')
  assert.equal(manifest.confirmSignup!.file, 'confirm-signup.html')
})

for (const template of Object.values(manifest)) {
  const html = readFileSync(new URL(template.file, directory), 'utf8')
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1]

  test(`${template.providerTemplate}: one selectable code, safe subject and useful preheader`, () => {
    assert.equal(template.subject, 'Your Homesrolo sign-in code')
    assert.doesNotMatch(template.subject, /OTP|\d{6}|\{\{/i)
    assert.ok(body)
    assert.deepEqual(html.match(/\{\{[\s\S]*?\}\}/g), ['{{ .Token }}'],
      'the code is the only interpolated value and appears exactly once')
    assert.equal(body!.split('{{ .Token }}').length - 1, 1)
    assert.match(body!, /<p\b[^>]*class="code-text"[^>]*dir="ltr"[^>]*user-select: all;[^>]*>\{\{ \.Token \}\}<\/p>/)
    assert.match(body!, /Expires in 10 minutes\./)
    assert.match(body!, /Never share this code\./)
    assert.match(body!, /safely ignore this email/)
    const preheader = /<div\b[^>]*mso-hide: all;[^>]*>([^<]*)<\/div>/.exec(body!)
    assert.equal(preheader?.[1], template.preheader)
    assert.doesNotMatch(preheader![1]!, /\{\{|\d{6}/,
      'inbox preview must not duplicate or disclose the sign-in code')
    // Rendering must keep the code textual, including a leading zero.
    assert.match(body!.replace('{{ .Token }}', '012345'), />012345<\/p>/)
  })

  test(`${template.providerTemplate}: self-contained HTML with no links, tracking or active content`, () => {
    assert.match(html, /^<!DOCTYPE html>/i)
    assert.match(html, /<html lang="en">/)
    assert.match(html, /<meta charset="utf-8">/)
    assert.match(html, /<title>Your Homesrolo sign-in code<\/title>/)
    assert.doesNotMatch(html, /ConfirmationURL|TokenHash|token_hash|RedirectTo|SiteURL|password/i)
    assert.doesNotMatch(html, /<(?:a|img|svg|script|iframe|form|input|button|link|object|embed|video|audio)\b/i)
    assert.doesNotMatch(html, /\b(?:href|src|srcset|action|background|on\w+)\s*=|url\s*\(|@import|https?:|data:|javascript:/i)
    assert.ok(Buffer.byteLength(html, 'utf8') < 12_000,
      'keep the message compact and well below common email clipping thresholds')
  })

  test(`${template.providerTemplate}: mobile-width table layout with inline fallbacks`, () => {
    assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/)
    const tables = [...html.matchAll(/<table\b([^>]*)>/gi)]
    assert.ok(tables.length >= 3)
    for (const [, attributes] of tables) {
      assert.match(attributes!, /role="presentation"/)
      assert.match(attributes!, /cellpadding="0" cellspacing="0" border="0"/)
    }
    assert.equal(tables.length, [...html.matchAll(/<\/table>/gi)].length)
    for (const tag of ['tr', 'td']) {
      assert.equal([...html.matchAll(new RegExp(`<${tag}\\b`, 'gi'))].length,
        [...html.matchAll(new RegExp(`</${tag}>`, 'gi'))].length)
    }
    assert.match(html, /class="panel" width="100%"[^>]*max-width: 480px;/)
    assert.match(html, /<!--\[if mso\]><table[^>]*width="480"/,
      'Word-based Outlook gets a bounded table without relying on max-width')
    assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ''), /\bwidth="\d+"/,
      'non-Outlook tables remain fluid at narrow mobile widths')
    assert.doesNotMatch(html, /display:\s*(?:flex|grid)|position:\s*(?:absolute|fixed)|min-width:/i)
    assert.match(html, /<body[^>]*bgcolor="#f5f2e8"[^>]*background-color: #f5f2e8;/)
    assert.match(html, /class="panel"[^>]*bgcolor="#ffffff"[^>]*background-color: #ffffff;/)
    assert.match(html, /class="code-panel"[^>]*bgcolor="#c9ff31"[^>]*background-color: #c9ff31;/)
  })

  test(`${template.providerTemplate}: explicitly paired light/dark text colors remain legible`, () => {
    assert.match(html, /name="color-scheme" content="light dark"/)
    assert.match(html, /@media \(prefers-color-scheme: dark\)/)
    assert.match(html, /\.panel \{ background-color: #102b35 !important;/)
    assert.match(html, /\.primary \{ color: #f5f2e8 !important;/)
    assert.match(html, /\.secondary \{ color: #b8c9c1 !important;/)
    assert.match(html, /\.code-panel \{ background-color: #c9ff31 !important;/)
    assert.match(html, /\.code-text \{ color: #071c27 !important;/)
    for (const [foreground, background] of [
      ['#071c27', '#ffffff'], ['#53675d', '#ffffff'],
      ['#53675d', '#f5f2e8'], ['#f5f2e8', '#102b35'],
      ['#b8c9c1', '#102b35'], ['#b8c9c1', '#071c27'],
      ['#071c27', '#c9ff31'],
    ]) {
      assert.ok(contrast(foreground!, background!) >= 4.5,
        `${foreground} on ${background} must meet normal-text AA contrast`)
    }
  })
}

test('signup and returning-user templates differ only in their explanatory copy', () => {
  const magic = readFileSync(new URL(manifest.magicLink!.file, directory), 'utf8')
  const signup = readFileSync(new URL(manifest.confirmSignup!.file, directory), 'utf8')
  assert.equal(signup
    .replace(manifest.confirmSignup!.preheader, manifest.magicLink!.preheader)
    .replace('to verify your email and get started.', 'to finish signing in.'), magic)
})
