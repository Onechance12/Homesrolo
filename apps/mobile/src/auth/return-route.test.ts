import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_POST_SIGN_IN_DESTINATION,
  postSignInDestination,
  workDetailReturnPath,
} from './return-route.ts'

const homeId = `hhom_${'h'.repeat(43)}`
const projectRef = `hprj_${'p'.repeat(43)}`

test('work detail creates a valid return path and restores its typed destination', () => {
  const path = workDetailReturnPath(homeId, projectRef)
  assert.equal(path, `/home/${homeId}/work/${projectRef}`)
  assert.deepEqual(postSignInDestination(path), {
    pathname: '/home/[homeId]/work/[projectRef]',
    params: { homeId, projectRef },
  })
})

test('post-sign-in routing rejects external, malformed, ambiguous, and unsupported targets', () => {
  const rejected: unknown[] = [
    undefined,
    [`/home/${homeId}/work/${projectRef}`],
    'https://example.com',
    '//example.com',
    `/home/${homeId}/people`,
    `/home/hhom_bad/work/${projectRef}`,
    `/home/${homeId}/work/hprj_bad`,
    `/home/${homeId}/work/${projectRef}/extra`,
  ]
  for (const value of rejected) {
    assert.equal(postSignInDestination(value), DEFAULT_POST_SIGN_IN_DESTINATION)
  }
  assert.equal(workDetailReturnPath('hhom_bad', projectRef), null)
})
