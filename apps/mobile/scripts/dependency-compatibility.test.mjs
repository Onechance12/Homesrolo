import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const appRequire = createRequire(import.meta.url)
const expoRouterPackage = appRequire.resolve('expo-router/package.json')
const expoRouterRequire = createRequire(expoRouterPackage)

test('Expo Router keeps its CommonJS query-string API with the patched decoder', () => {
  const queryString = expoRouterRequire('query-string')
  const decoderPackage = expoRouterRequire('decode-uri-component/package.json')

  assert.equal(typeof queryString.parse, 'function')
  assert.equal(typeof queryString.stringify, 'function')
  assert.equal(queryString.parse('label=hello%20world').label, 'hello world')
  assert.equal(queryString.stringify({ label: 'hello world' }), 'label=hello%20world')
  assert.equal(queryString.parse('value=%E0%A4%A').value, '%E0%A4%A')
  assert.match(decoderPackage.version, /^0\.5\.0-homesrolo-cjs\./)
})
