/**
 * SYNTHETIC FIXTURES — every value here is invented. No real home, homeowner,
 * address, company, or document exists behind any of it. The two fixture homes
 * are chosen to exercise the two shapes the UI must handle well: a home with a
 * rich record, and a nearly empty one so empty states are real screens rather
 * than untested branches.
 */

import type {
  DocumentSummary, HomeFile, MaintenanceItem, Project, ProjectSummary,
  TimelineEntry, Warranty,
} from '../port/types.ts'

const opaque = (prefix: string, seed: string) =>
  `${prefix}_${seed.repeat(43).slice(0, 43)}`

export const BIRCH_REF = opaque('hhom', 'b')
export const COTTAGE_REF = opaque('hhom', 'c')

export const FIXTURE_HOMES: readonly HomeFile[] = [
  {
    homeRef: BIRCH_REF,
    alias: 'The Birch House',
    locality: 'Sample Metro — North',
    projectCount: 3,
    openMaintenanceCount: 2,
    yearBuilt: 1987,
    homeType: 'house',
    keyFacts: [
      { label: 'Built', value: '1987' },
      { label: 'Roof', value: 'Replaced 2026' },
      { label: 'Records', value: '11 entries' },
      { label: 'File opened', value: 'Mar 2026' },
    ],
    isSynthetic: true,
  },
  {
    homeRef: COTTAGE_REF,
    alias: 'Lakeside Cottage',
    locality: 'Sample Metro — East',
    projectCount: 0,
    openMaintenanceCount: 0,
    yearBuilt: null,
    homeType: 'other',
    keyFacts: [
      { label: 'Built', value: 'Not recorded' },
      { label: 'Records', value: '1 entry' },
      { label: 'File opened', value: 'Aug 2026' },
    ],
    isSynthetic: true,
  },
]

const ROOF_REF = opaque('hprj', 'r')
const GUTTER_REF = opaque('hprj', 'g')
const WINDOW_REF = opaque('hprj', 'w')

export const FIXTURE_PROJECTS: readonly Project[] = [
  {
    projectRef: ROOF_REF,
    homeRef: BIRCH_REF,
    title: 'Roof replacement',
    workKind: 'project',
    category: 'roofing',
    trade: 'Roofing',
    performedOn: '2026-05-18',
    status: 'completed',
    professionalLabel: 'Aspen Sample Roofworks (synthetic)',
    revision: 1,
    archived: false,
    archivedAt: null,
    photoCount: 3,
    documentCount: 3,
    summary: 'Full tear-off and replacement after hail damage. Decking inspected, two sheets replaced, '
      + 'ice and water shield to code, 30-year architectural shingle throughout.',
    contractor: 'Aspen Sample Roofworks (synthetic)',
    materials: [
      { label: 'Shingle', value: '30-year architectural, weathered wood' },
      { label: 'Underlayment', value: 'Synthetic, full coverage' },
      { label: 'Ventilation', value: 'Ridge vent, continuous' },
      { label: 'Flashing', value: 'New at all penetrations' },
    ],
    photos: [
      { photoRef: opaque('hphot', 'a'), caption: 'Tear-off complete, decking exposed', art: 'roof', takenOn: '2026-05-16', isSynthetic: true },
      { photoRef: opaque('hphot', 'b'), caption: 'Ice and water shield at eaves', art: 'roof', takenOn: '2026-05-17', isSynthetic: true },
      { photoRef: opaque('hphot', 'c'), caption: 'Finished ridge line from the street', art: 'exterior', takenOn: '2026-05-18', isSynthetic: true },
    ],
    documents: [
      { documentRef: opaque('hdoc', 'a'), homeRef: BIRCH_REF, projectRef: ROOF_REF, title: 'Roofing contract', kind: 'contract', addedOn: '2026-04-30', pages: 6, isSynthetic: true },
      { documentRef: opaque('hdoc', 'b'), homeRef: BIRCH_REF, projectRef: ROOF_REF, title: 'Final invoice', kind: 'invoice', addedOn: '2026-05-19', pages: 2, isSynthetic: true },
      { documentRef: opaque('hdoc', 'c'), homeRef: BIRCH_REF, projectRef: ROOF_REF, title: 'Shingle warranty registration', kind: 'warranty', addedOn: '2026-05-21', pages: 4, isSynthetic: true },
    ],
    warranty: {
      warrantyRef: opaque('hwar', 'a'),
      homeRef: BIRCH_REF,
      projectRef: ROOF_REF,
      coverage: 'Workmanship — roof system',
      issuedBy: 'Aspen Sample Roofworks (synthetic)',
      startsOn: '2026-05-18',
      endsOn: '2031-05-18',
      isSynthetic: true,
    },
    isSynthetic: true,
  },
  {
    projectRef: GUTTER_REF,
    homeRef: BIRCH_REF,
    title: 'Gutter and downspout rerun',
    workKind: 'repair',
    category: 'exterior',
    trade: 'Gutters',
    performedOn: '2026-06-02',
    status: 'completed',
    professionalLabel: 'Demo Exteriors (synthetic)',
    revision: 1,
    archived: false,
    archivedAt: null,
    photoCount: 1,
    documentCount: 1,
    summary: 'Seamless 6-inch gutters on the north and west runs, two downspouts relocated to move '
      + 'discharge away from the foundation.',
    contractor: 'Demo Exteriors (synthetic)',
    materials: [
      { label: 'Gutter', value: 'Seamless aluminium, 6 inch' },
      { label: 'Downspouts', value: '3 × 4 inch, two relocated' },
    ],
    photos: [
      { photoRef: opaque('hphot', 'd'), caption: 'North run with new hangers', art: 'gutter', takenOn: '2026-06-02', isSynthetic: true },
    ],
    documents: [
      { documentRef: opaque('hdoc', 'd'), homeRef: BIRCH_REF, projectRef: GUTTER_REF, title: 'Gutter invoice', kind: 'invoice', addedOn: '2026-06-03', pages: 1, isSynthetic: true },
    ],
    warranty: {
      warrantyRef: opaque('hwar', 'b'),
      homeRef: BIRCH_REF,
      projectRef: GUTTER_REF,
      coverage: 'Workmanship — gutters and fasteners',
      issuedBy: 'Demo Exteriors (synthetic)',
      startsOn: '2026-06-02',
      endsOn: '2028-06-02',
      isSynthetic: true,
    },
    isSynthetic: true,
  },
  {
    projectRef: WINDOW_REF,
    homeRef: BIRCH_REF,
    title: 'Basement egress window',
    workKind: 'project',
    category: 'exterior',
    trade: 'Windows',
    performedOn: '2026-07-21',
    status: 'in_progress',
    professionalLabel: 'Sample Windowcraft (synthetic)',
    revision: 1,
    archived: false,
    archivedAt: null,
    photoCount: 1,
    documentCount: 2,
    summary: 'Cutting and framing a code-compliant egress window in the south basement wall. '
      + 'Permit issued; well and ladder scheduled.',
    contractor: 'Sample Windowcraft (synthetic)',
    materials: [
      { label: 'Window', value: 'Casement egress, tempered' },
      { label: 'Well', value: 'Galvanised, with ladder' },
    ],
    photos: [
      { photoRef: opaque('hphot', 'e'), caption: 'Rough opening cut and framed', art: 'window', takenOn: '2026-07-21', isSynthetic: true },
    ],
    documents: [
      { documentRef: opaque('hdoc', 'e'), homeRef: BIRCH_REF, projectRef: WINDOW_REF, title: 'Building permit', kind: 'permit', addedOn: '2026-07-10', pages: 2, isSynthetic: true },
      { documentRef: opaque('hdoc', 'f'), homeRef: BIRCH_REF, projectRef: WINDOW_REF, title: 'Window order confirmation', kind: 'invoice', addedOn: '2026-07-12', pages: 1, isSynthetic: true },
    ],
    warranty: null,
    isSynthetic: true,
  },
]

/** Home-level documents that belong to no single project. */
export const FIXTURE_HOME_DOCUMENTS: readonly DocumentSummary[] = [
  { documentRef: opaque('hdoc', 'g'), homeRef: BIRCH_REF, projectRef: null, title: 'Furnace manual', kind: 'manual', addedOn: '2026-03-14', pages: 48, isSynthetic: true },
  { documentRef: opaque('hdoc', 'h'), homeRef: BIRCH_REF, projectRef: null, title: 'Pre-purchase inspection report', kind: 'photo_set', addedOn: '2026-03-12', pages: 31, isSynthetic: true },
]

export const FIXTURE_MAINTENANCE: readonly MaintenanceItem[] = [
  { itemRef: opaque('hmnt', 'a'), homeRef: BIRCH_REF, title: 'Clean gutters and check downspout discharge', cadence: 'Twice a year', dueInSeason: 'Fall 2026', state: 'upcoming', isSynthetic: true },
  { itemRef: opaque('hmnt', 'b'), homeRef: BIRCH_REF, title: 'Furnace filter', cadence: 'Every 3 months', dueInSeason: 'Sep 2026', state: 'upcoming', isSynthetic: true },
  { itemRef: opaque('hmnt', 'c'), homeRef: BIRCH_REF, title: 'Roof walk-over after first winter', cadence: 'Once', dueInSeason: 'Spring 2027', state: 'upcoming', isSynthetic: true },
  { itemRef: opaque('hmnt', 'd'), homeRef: BIRCH_REF, title: 'Sump pump test', cadence: 'Twice a year', dueInSeason: 'Done May 2026', state: 'done', isSynthetic: true },
]

function warranties(): readonly Warranty[] {
  return FIXTURE_PROJECTS.flatMap(p => (p.warranty ? [p.warranty] : []))
}

export const FIXTURE_WARRANTIES: readonly Warranty[] = warranties()

export function projectSummaries(): readonly ProjectSummary[] {
  return FIXTURE_PROJECTS.map(({ projectRef, homeRef, title, workKind, category, trade, performedOn, status, professionalLabel, revision, archived, archivedAt, photoCount, documentCount }) => ({
    projectRef, homeRef, title, workKind, category, trade, performedOn, status,
    professionalLabel, revision, archived, archivedAt, photoCount, documentCount,
    isSynthetic: true,
  }))
}

export function allDocuments(): readonly DocumentSummary[] {
  return [...FIXTURE_PROJECTS.flatMap(p => p.documents), ...FIXTURE_HOME_DOCUMENTS]
    .sort((a, b) => (a.addedOn < b.addedOn ? 1 : -1))
}

/** The ledger, newest first. Built from the records above so it cannot drift. */
export function timelineFor(homeRef: string): readonly TimelineEntry[] {
  if (homeRef !== BIRCH_REF) {
    if (homeRef === COTTAGE_REF) {
      return [{
        entryRef: opaque('hent', 'z'),
        homeRef: COTTAGE_REF,
        kind: 'home',
        on: '2026-08-02',
        title: 'Home file opened',
        detail: 'Lakeside Cottage was added. Its record starts here.',
        href: null,
        isSynthetic: true,
      }]
    }
    return []
  }
  const entries: TimelineEntry[] = [
    {
      entryRef: opaque('hent', 'a'), homeRef, kind: 'home', on: '2026-03-12',
      title: 'Home file opened',
      detail: 'The Birch House was added with its pre-purchase inspection report.',
      href: null, isSynthetic: true,
    },
    ...FIXTURE_PROJECTS
      .filter((p): p is typeof p & { performedOn: string } => p.performedOn !== null)
      .map((p, i) => ({
      entryRef: opaque('hent', 'bcd'[i] ?? 'x'),
      homeRef,
      kind: 'project' as const,
      on: p.performedOn,
      title: p.title,
      detail: `${p.trade} — ${p.contractor}`,
      href: `/home/${homeRef}/projects/${p.projectRef}`,
      isSynthetic: true as const,
      })),
    ...FIXTURE_WARRANTIES.map((w, i) => ({
      entryRef: opaque('hent', 'ef'[i] ?? 'y'),
      homeRef,
      kind: 'warranty' as const,
      on: w.startsOn,
      title: `Warranty recorded — ${w.coverage}`,
      detail: `${w.issuedBy}, through ${w.endsOn}`,
      href: `/home/${homeRef}/warranties`,
      isSynthetic: true as const,
    })),
    ...FIXTURE_HOME_DOCUMENTS.map((d, i) => ({
      entryRef: opaque('hent', 'gh'[i] ?? 'w'),
      homeRef,
      kind: 'document' as const,
      on: d.addedOn,
      title: `Document filed — ${d.title}`,
      detail: `${d.pages} pages`,
      href: `/home/${homeRef}/documents`,
      isSynthetic: true as const,
    })),
  ]
  return entries.sort((a, b) => (a.on < b.on ? 1 : -1))
}
