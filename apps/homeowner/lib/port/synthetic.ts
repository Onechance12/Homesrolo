/**
 * MOCK ADAPTER — the synthetic implementation of the UI data port.
 *
 * Everything here is in-memory and invented. There is no account system, no
 * database, no storage, no upload, no sharing, and no network: state lives in
 * module scope, survives client-side navigation only, and a hard refresh
 * resets it. That is deliberate and honest — the shell must never look more
 * persistent than it is.
 *
 * FOR CODEX: replace this by implementing `HomeownerDataPort` against the real
 * authenticated runtime and swapping the instance in `provider.tsx`. The
 * artificial latency below exists so loading states are real, exercised UI,
 * not dead code that lights up for the first time in production.
 */

import {
  BIRCH_REF, COTTAGE_REF, FIXTURE_HOMES, FIXTURE_MAINTENANCE,
  FIXTURE_PROJECTS, FIXTURE_WARRANTIES, allDocuments, projectSummaries, timelineFor,
} from '../fixtures/homes.ts'
import type {
  AddProjectInput, CreateHomeInput, HomeFile, HomeSummary, HomeownerDataPort,
  HomeownerSession, PortResult, Project, ProjectSummary, SessionState,
} from './types.ts'

const LATENCY_MS = 350

const wait = () => new Promise(resolve => setTimeout(resolve, LATENCY_MS))
const ok = <T,>(value: T): PortResult<T> => ({ ok: true, value })
const err = <T,>(error: 'not_found' | 'not_signed_in' | 'unavailable'): PortResult<T> =>
  ({ ok: false, error })

/** In-memory only. A refresh clears it, which is the truthful behaviour. */
type MemoryState = {
  session: HomeownerSession | null
  createdHomes: HomeFile[]
  createdProjects: Project[]
}
const memory: MemoryState = { session: null, createdHomes: [], createdProjects: [] }

let mintCounter = 0
/** Mock id mint. The real runtime mints real opaque ids; the UI never cares. */
const mint = (prefix: string) => {
  mintCounter += 1
  const seed = `demo${mintCounter}`.padEnd(43, '0').slice(0, 43)
  return `${prefix}_${seed}`
}

const homes = (): HomeFile[] => [...FIXTURE_HOMES, ...memory.createdHomes]

function requireSession<T>(): PortResult<T> | null {
  return memory.session ? null : err<T>('not_signed_in')
}

export const syntheticPort: HomeownerDataPort = {
  async getSession(): Promise<SessionState> {
    await wait()
    return memory.session
      ? { kind: 'signed_in', session: memory.session }
      : { kind: 'signed_out' }
  },

  async enterDemoSession(displayName: string) {
    await wait()
    memory.session = {
      accountRef: mint('hacct'),
      displayName: displayName.trim() || 'Sample homeowner',
      isSynthetic: true,
    }
    return memory.session
  },

  async signOut() {
    await wait()
    memory.session = null
  },

  async listHomes() {
    await wait()
    const gate = requireSession<readonly HomeSummary[]>()
    if (gate) return gate
    return ok(homes().map(({ homeRef, alias, locality, projectCount, openMaintenanceCount }) => ({
      homeRef, alias, locality, projectCount, openMaintenanceCount, isSynthetic: true as const,
    })))
  },

  async getHome(homeRef) {
    await wait()
    const gate = requireSession<HomeFile>()
    if (gate) return gate
    const home = homes().find(h => h.homeRef === homeRef)
    return home ? ok(home) : err('not_found')
  },

  async createHome(input: CreateHomeInput) {
    await wait()
    const gate = requireSession<HomeSummary>()
    if (gate) return gate
    const home: HomeFile = {
      homeRef: mint('hhom'),
      alias: input.alias.trim() || 'Untitled home',
      locality: input.locality.trim() || 'Not recorded',
      homeType: input.homeType,
      yearBuilt: input.yearBuilt,
      projectCount: 0,
      openMaintenanceCount: 0,
      keyFacts: [
        { label: 'Built', value: input.yearBuilt ? String(input.yearBuilt) : 'Not recorded' },
        { label: 'Records', value: '1 entry' },
        { label: 'File opened', value: 'Just now (demo)' },
      ],
      isSynthetic: true,
    }
    memory.createdHomes.push(home)
    return ok(home)
  },

  async listProjects(homeRef) {
    await wait()
    const gate = requireSession<readonly ProjectSummary[]>()
    if (gate) return gate
    if (!homes().some(h => h.homeRef === homeRef)) return err('not_found')
    const created = memory.createdProjects
      .filter(p => p.homeRef === homeRef)
      .map(({ projectRef, homeRef: hr, title, trade, performedOn, status, photoCount, documentCount }) => ({
        projectRef, homeRef: hr, title, trade, performedOn, status, photoCount, documentCount, isSynthetic: true as const,
      }))
    const fixture = homeRef === BIRCH_REF ? projectSummaries() : []
    return ok([...created, ...fixture])
  },

  async getProject(homeRef, projectRef) {
    await wait()
    const gate = requireSession<Project>()
    if (gate) return gate
    const project = [...FIXTURE_PROJECTS, ...memory.createdProjects]
      .find(p => p.homeRef === homeRef && p.projectRef === projectRef)
    return project ? ok(project) : err('not_found')
  },

  async addProject(homeRef, input: AddProjectInput) {
    await wait()
    const gate = requireSession<ProjectSummary>()
    if (gate) return gate
    if (!homes().some(h => h.homeRef === homeRef)) return err('not_found')
    const project: Project = {
      projectRef: mint('hwrk'),
      homeRef,
      title: input.title.trim() || 'Untitled project',
      trade: input.trade.trim() || 'General',
      performedOn: input.performedOn,
      status: 'recorded',
      photoCount: 0,
      documentCount: 0,
      summary: input.summary.trim() || 'No summary recorded.',
      contractor: `${input.contractor.trim() || 'Not recorded'} (synthetic)`,
      materials: [],
      photos: [],
      documents: [],
      warranty: null,
      isSynthetic: true,
    }
    memory.createdProjects.push(project)
    const { projectRef, title, trade, performedOn, status, photoCount, documentCount } = project
    return ok({ projectRef, homeRef, title, trade, performedOn, status, photoCount, documentCount, isSynthetic: true as const })
  },

  async listDocuments(homeRef) {
    await wait()
    const gate = requireSession<readonly import('./types.ts').DocumentSummary[]>()
    if (gate) return gate
    if (!homes().some(h => h.homeRef === homeRef)) return err('not_found')
    return ok(homeRef === BIRCH_REF ? allDocuments() : [])
  },

  async listWarranties(homeRef) {
    await wait()
    const gate = requireSession<readonly import('./types.ts').Warranty[]>()
    if (gate) return gate
    if (!homes().some(h => h.homeRef === homeRef)) return err('not_found')
    return ok(homeRef === BIRCH_REF ? FIXTURE_WARRANTIES : [])
  },

  async listTimeline(homeRef) {
    await wait()
    const gate = requireSession<readonly import('./types.ts').TimelineEntry[]>()
    if (gate) return gate
    if (!homes().some(h => h.homeRef === homeRef)) return err('not_found')
    const created = memory.createdProjects
      .filter(p => p.homeRef === homeRef)
      .map(p => ({
        entryRef: `${p.projectRef}-entry`,
        homeRef,
        kind: 'project' as const,
        on: p.performedOn,
        title: p.title,
        detail: `${p.trade} — ${p.contractor}`,
        href: `/home/${homeRef}/projects/${p.projectRef}`,
        isSynthetic: true as const,
      }))
    return ok([...created, ...timelineFor(homeRef)].sort((a, b) => (a.on < b.on ? 1 : -1)))
  },

  async listMaintenance(homeRef) {
    await wait()
    const gate = requireSession<readonly import('./types.ts').MaintenanceItem[]>()
    if (gate) return gate
    if (!homes().some(h => h.homeRef === homeRef)) return err('not_found')
    return ok(homeRef === BIRCH_REF ? FIXTURE_MAINTENANCE : [])
  },
}

export { BIRCH_REF, COTTAGE_REF }
