import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CanonicalizationError,
  canonicalDigest,
  canonicalJson,
  isBase64Url,
  isCanonicalInstant,
  isSha256Hex,
  sha256Hex,
  utf8ByteLength,
} from '../canonical.ts'

// Everything downstream is a digest of a canonical encoding, so a disagreement
// here is a silent disagreement about what was authorized. These tests pin the
// encoding rather than trusting the manifest golden vector to have covered it.

test('keys are sorted recursively, not just at the top level', () => {
  const nested = { b: { d: 1, c: { f: 2, e: 3 } }, a: 0 }
  assert.equal(canonicalJson(nested), '{"a":0,"b":{"c":{"e":3,"f":2},"d":1}}')
})

test('insertion order never changes the encoding', () => {
  const one = { alpha: 1, beta: [{ y: 2, x: 1 }] }
  const two = { beta: [{ x: 1, y: 2 }], alpha: 1 }
  assert.equal(canonicalJson(one), canonicalJson(two))
  assert.equal(canonicalDigest(one), canonicalDigest(two))
})

test('array order is preserved, because order is meaning', () => {
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]))
})

test('canonicalization fails loudly rather than dropping a field', () => {
  // A silently dropped key is a key one side signed and the other never saw.
  for (const value of [
    { a: undefined },
    { a: Number.NaN },
    { a: Number.POSITIVE_INFINITY },
    { a: -0 },
    { a: () => 1 },
    { a: Symbol('x') },
    { a: 1n },
    { a: new Date(0) },
    { a: new Map() },
  ]) {
    assert.throws(() => canonicalJson(value), CanonicalizationError, `must refuse: ${JSON.stringify(Object.keys(value))}`)
  }
})

test('the error names the path so a rejection is diagnosable', () => {
  try {
    canonicalJson({ outer: { inner: [1, Number.NaN] } })
    assert.fail('expected a CanonicalizationError')
  } catch (error) {
    assert.ok(error instanceof CanonicalizationError)
    assert.equal(error.path, 'outer.inner[1]')
  }
})

test('digests are lowercase hex over UTF-8 bytes', () => {
  // Known vector: SHA-256 of the empty string.
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(isSha256Hex(sha256Hex('anything')), true)
  assert.equal(isSha256Hex('A'.repeat(64)), false, 'uppercase is a different string')
  assert.equal(isSha256Hex('a'.repeat(63)), false)
})

test('byte length is measured in UTF-8, not code units', () => {
  assert.equal(utf8ByteLength('abc'), 3)
  assert.equal(utf8ByteLength('é'), 2)
  assert.equal(utf8ByteLength('🏠'), 4)
})

test('non-ASCII survives canonicalization unchanged', () => {
  const value = { note: 'ñ', emoji: '🏠' }
  assert.equal(canonicalJson(value), '{"emoji":"🏠","note":"ñ"}')
})

test('only one spelling of an instant is canonical', () => {
  assert.equal(isCanonicalInstant('2026-08-15T12:00:00.000Z'), true)
  for (const bad of [
    '2026-08-15T12:00:00Z',
    '2026-08-15T12:00:00.00Z',
    '2026-08-15T12:00:00.0000Z',
    '2026-08-15T12:00:00.000+00:00',
    '2026-08-15 12:00:00.000Z',
    '2026-02-30T12:00:00.000Z',
    '2026-13-01T12:00:00.000Z',
    1_786_000_000_000,
    null,
  ]) {
    assert.equal(isCanonicalInstant(bad), false, `must refuse: ${String(bad)}`)
  }
})

test('only one spelling of a signature is canonical', () => {
  const signature = Buffer.alloc(64, 7).toString('base64url')
  assert.equal(isBase64Url(signature, 64), true)
  assert.equal(isBase64Url(Buffer.alloc(64, 7).toString('base64'), 64), false, 'standard base64 is refused')
  assert.equal(isBase64Url(`${signature}=`, 64), false, 'padding is refused')
  assert.equal(isBase64Url(signature, 32), false, 'wrong length is refused')
  assert.equal(isBase64Url(` ${signature}`, 64), false)
  assert.equal(isBase64Url('', 64), false)
})
