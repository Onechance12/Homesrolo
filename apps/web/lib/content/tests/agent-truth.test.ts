import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const agentPage = readFileSync('apps/web/app/for-agents/page.tsx', 'utf8')

test('agent page distinguishes today from future account and sharing features', () => {
  assert.match(agentPage, /does not receive reports, project details, photo checkups, or account access/)
  assert.match(agentPage, /does not replace your CRM/i)
  assert.match(agentPage, /past, current, or planned work across the property/)
  assert.match(agentPage, /AGENT_PHONE_DISPLAY/)
  assert.match(agentPage, /AGENT_SMS_URL/)
  assert.match(agentPage, /publicPageMetadata/)

  for (const roadmapOrUnsupported of [
    /coming soon/i,
    /not live yet/i,
    /still being built/i,
    /listing-ready export/i,
    /automatically receive/i,
  ]) {
    assert.doesNotMatch(agentPage, roadmapOrUnsupported)
  }
})
