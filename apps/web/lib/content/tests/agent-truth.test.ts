import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const agentPage = readFileSync('apps/web/app/for-agents/page.tsx', 'utf8')

test('agent page distinguishes today from future account and sharing features', () => {
  assert.match(agentPage, /Secure uploads, homeowner-controlled sharing, an agent view, and listing-ready exports are not live yet/)
  assert.match(agentPage, /does not automatically receive reports, project details, or account access/)
  assert.match(agentPage, /publicPageMetadata/)

  for (const unsupported of [
    /reports build in their own account/i,
    /homeowners can release records they choose to share/i,
    /every enrollment traces back to you/i,
    /small stuff gets fixed free/i,
    /a documented home is an easier sale/i,
  ]) {
    assert.doesNotMatch(agentPage, unsupported)
  }
})

