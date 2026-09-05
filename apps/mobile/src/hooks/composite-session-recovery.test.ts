import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Script } from 'node:vm'
import ts from 'typescript'
import { isCurrentHouseholdController } from '../api/household.ts'
import { SessionCheckRequired, SessionFence } from '../auth/session-fence.ts'
import type { ServerSession } from '../api/model.ts'
import { homeTimelineEntries } from '../home/timeline.ts'
import { findExactWork } from '../work/detail.ts'
import { retryResourceAfterSessionCheck } from './session-resource-retry.ts'

const HOME = `hhom_${'h'.repeat(43)}`
const PROJECT = `hprj_${'p'.repeat(43)}`
type ReadApi = Record<string, () => Promise<unknown>>
type Loaded = Record<string, unknown>

/** Exercise each actual route loader, without importing React/Expo or any IO. */
function routeLoader(route: string, api: ReadApi): () => Promise<Loaded> {
  const filename = new URL(`../../app/home/[homeId]/${route}.tsx`, import.meta.url)
  const source = ts.createSourceFile(filename.pathname, readFileSync(filename, 'utf8'),
    ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX)
  const inline = route === 'checkups' || route === 'details'
  let callback: ts.ArrowFunction | undefined
  function visit(node: ts.Node): void {
    if (callback) return
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.name.text === (inline ? 'resource' : 'loader') && node.initializer
      && ts.isCallExpression(node.initializer)) {
      const call = inline ? node.initializer.arguments[0] : node.initializer
      if (call && ts.isCallExpression(call) && ts.isIdentifier(call.expression)
        && call.expression.text === 'useCallback' && call.arguments[0]
        && ts.isArrowFunction(call.arguments[0])) callback = call.arguments[0]
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(callback, `missing ${route} read loader`)
  const javascript = ts.transpileModule(`(${callback.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  return new Script(javascript, { filename: `${route}:read-loader` }).runInNewContext({
    api, homeId: HOME, projectRef: PROJECT, enabled: true,
    photoCheckupsEnabled: true, checkupsEnabled: true,
    professionalFeaturesEnabled: true, householdSharingEnabled: true,
    SessionCheckRequired, isCurrentHouseholdController, homeTimelineEntries, findExactWork,
  }) as () => Promise<Loaded>
}

function readApi(route: string): ReadApi {
  return {
    getHome: async () => ({ homeRef: HOME }),
    listWork: async () => route === 'people' || route === 'work/[projectRef]'
      ? [{ homeRef: HOME, projectRef: PROJECT }] : [],
    listArtifacts: async () => [],
    listHomeCheckups: async () => [],
    getHousehold: async () => ({ members: [] }),
    getHomeRecord: async () => ({}),
    listProfessionals: async () => [],
    listProjectInvitations: async () => [],
    listProjectActivity: async () => [],
  }
}

const paths: readonly {
  readonly route: string
  readonly optionalRead: string
  readonly fallback: (result: Loaded) => void
}[] = [
  { route: 'people', optionalRead: 'getHousehold', fallback: result => {
    assert.equal(result.household, null)
    assert.equal(result.householdLoadFailed, true)
  } },
  { route: 'people', optionalRead: 'listProjectInvitations', fallback: result => {
    assert.equal(result.invitationLoadFailures, 1)
    assert.equal((result.invitations as unknown[]).length, 0)
  } },
  { route: 'care', optionalRead: 'getHousehold', fallback: result => {
    assert.equal(result.householdUnavailable, true)
    assert.equal((result.householdMembers as unknown[]).length, 0)
  } },
  { route: 'care', optionalRead: 'listHomeCheckups', fallback: result => assert.equal(result.checkupsUnavailable, true) },
  { route: 'timeline', optionalRead: 'listArtifacts', fallback: result => assert.equal(result.artifactsUnavailable, true) },
  { route: 'timeline', optionalRead: 'listHomeCheckups', fallback: result => assert.equal(result.checkupsUnavailable, true) },
  { route: 'details', optionalRead: 'getHousehold', fallback: result => assert.equal(result.canEdit, false) },
  { route: 'checkups', optionalRead: 'getHousehold', fallback: result => assert.equal(result.canManage, false) },
  { route: 'work/index', optionalRead: 'getHousehold', fallback: result => assert.equal((result.members as unknown[]).length, 0) },
  { route: 'work/[projectRef]', optionalRead: 'getHousehold', fallback: result => assert.equal((result.members as unknown[]).length, 0) },
]

for (const path of paths) {
  test(`${path.route} propagates ${path.optionalRead} session interruption without a partial ready result`, async () => {
    const blocked = new SessionCheckRequired()
    const api = readApi(path.route)
    api[path.optionalRead] = async () => { throw blocked }
    await assert.rejects(routeLoader(path.route, api)(), error => error === blocked)
  })

  test(`${path.route} retains ${path.optionalRead} ordinary-error fallback`, async () => {
    const api = readApi(path.route)
    api[path.optionalRead] = async () => { throw new Error('service_unavailable') }
    path.fallback(await routeLoader(path.route, api)())
  })
}

test('actual optional household loader recovers after same-person confirmation without replaying a mutation', async () => {
  const session: Extract<ServerSession, { kind: 'signed_in' }> = {
    apiVersion: 'homeowner-api.v1-draft', kind: 'signed_in', principalRef: `hprn_${'a'.repeat(43)}`,
    capabilities: {
      emailCodeSignIn: true, magicLinkSignIn: false, persistence: true, projectQuotes: false,
      homeResearch: false, homeAssistant: false, homeAssistantVision: false, uploads: false,
      photoCheckups: false, projectReview: false, projectReviewAttachments: false,
      homeRecordHandoffs: false, invitations: false, sharing: true,
    },
  }
  const fence = new SessionFence()
  fence.confirm(0, session)
  const check = fence.capture()
  fence.invalidate()
  const api = readApi('details')
  let reads = 0
  api.getHousehold = async () => { reads += 1; check(); return { members: [] } }
  const loader = routeLoader('details', api)
  let blocked: unknown
  try { await loader() } catch (error) { blocked = error }
  assert.ok(blocked instanceof SessionCheckRequired)
  let recoveryLoad: Promise<Loaded> | undefined
  const recovered = retryResourceAfterSessionCheck(blocked, () => true, () => { recoveryLoad = loader() })
  assert.equal(reads, 1)
  api.getHousehold = async () => {
    reads += 1
    fence.capture()()
    return { members: [{ state: 'active', role: 'workspace_controller', isCurrentPrincipal: true }] }
  }
  fence.confirm(fence.invalidate(), session)
  await recovered
  assert.ok(recoveryLoad)
  assert.equal((await recoveryLoad).canEdit, true)
  assert.equal(reads, 2)
  // The fixture exposes only read methods. Any attempt to replay a mutation fails.
})
