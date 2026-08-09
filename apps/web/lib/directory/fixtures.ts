/**
 * Synthetic fixtures.
 *
 * Every company, project, credential, and link on this list is invented for
 * demonstration. Nothing here describes a real business, and no rating, review
 * text, testimonial, customer count, or real credential appears anywhere —
 * fabricating those is how a directory becomes defamatory or deceptive, not
 * merely inaccurate.
 *
 * External links are https example.com only. Real provider links need
 * permission or a licensed API plus attribution review, which V1 does not have.
 */

import { type PublicProfile, PUBLIC_DIRECTORY_CONTRACT_VERSION } from './public-profile.v1.ts'

/** Rendered wherever a synthetic record is shown. */
/** Used after a bold lead-in, so it does not repeat one. */
export const SYNTHETIC_NOTICE =
  'This company, its projects, and its credentials are synthetic examples created to demonstrate the ' +
  'format. Nothing here describes a real business.'

export const DEMO_PROFILE_SLUG = 'demo'

const demoProfile: PublicProfile = {
  contractVersion: PUBLIC_DIRECTORY_CONTRACT_VERSION,
  slug: DEMO_PROFILE_SLUG,
  displayName: 'Demo Exteriors (Sample Listing)',
  isSynthetic: true,
  noindex: true,
  tradeCategories: ['roofing', 'gutters', 'siding'],
  serviceAreas: ['Sample Metro — North', 'Sample Metro — West'],
  summary:
    'A synthetic company profile used to show how Homesrolo presents a professional: neutral trade '
    + 'categories, coarse service areas, fact-level verification with sources and dates, and project '
    + 'records a homeowner chose to release. No part of this profile is real.',
  verificationFacts: [
    {
      dimension: 'business_identity',
      status: 'confirmed',
      source: 'business_registry',
      statement: 'A registered business entity matching this name was found in the sample registry.',
      checkedAt: '2026-07-02',
      asOf: '2026-06-30',
    },
    {
      dimension: 'license_jurisdiction',
      status: 'self_reported',
      source: 'company_self_reported',
      statement:
        'The company states it holds the licences its trades require. Homesrolo has not checked a registry '
        + 'for this sample, and licensing rules differ by state and trade.',
      checkedAt: '2026-07-02',
    },
    {
      dimension: 'insurance',
      status: 'expired',
      source: 'insurer_certificate',
      statement:
        'A sample liability certificate was supplied. Its own coverage period has now ended, so it no longer '
        + 'evidences current cover.',
      checkedAt: '2026-07-02',
      asOf: '2025-07-01',
      expiresAt: '2026-07-01',
    },
    {
      dimension: 'project_proof',
      status: 'confirmed',
      source: 'homeowner_released_project',
      statement:
        'Two sample projects were released by the homeowner who owned the record, with materials, dates, and '
        + 'approved photos attached to the release.',
      checkedAt: '2026-07-02',
    },
    {
      dimension: 'review_provenance',
      status: 'not_checked',
      source: 'not_collected',
      statement:
        'Homesrolo publishes no reviews for this listing. Verified-project reviews are not built yet, and '
        + 'reviews are never copied from other sites.',
      checkedAt: '2026-07-02',
    },
  ],
  externalLinks: [
    {
      kind: 'company_website',
      url: 'https://demo-exteriors.example.com',
      attribution: 'Company-operated site. Homesrolo does not review or endorse its contents.',
    },
    {
      kind: 'google_business_profile',
      url: 'https://google-business.example.com/demo-exteriors',
      attribution: 'Synthetic stand-in. Ratings and reviews stay on the source and are not copied here.',
    },
    {
      kind: 'bbb',
      url: 'https://bbb.example.com/demo-exteriors',
      attribution: 'Synthetic stand-in. Any rating belongs to that organisation, not to Homesrolo.',
    },
  ],
  portfolioPreview: [
    {
      id: 'sample-roof-replacement',
      title: 'Full roof replacement, architectural shingle',
      tradeCategory: 'roofing',
      serviceArea: 'Sample Metro — North',
      completedOn: '2026-05-18',
      homeownerReleased: true,
      summary:
        'Tear-off and replacement with a 30-year architectural shingle, new underlayment, and replaced pipe '
        + 'boots. Materials, dates, and approved photos were released by the homeowner.',
      illustration: 'roofline',
    },
    {
      id: 'sample-gutter-run',
      title: 'Seamless gutter and downspout replacement',
      tradeCategory: 'gutters',
      serviceArea: 'Sample Metro — West',
      completedOn: '2026-06-09',
      homeownerReleased: true,
      summary:
        'Replaced the full gutter run with seamless aluminium and repositioned two downspouts. Released with '
        + 'the maintenance note attached.',
      illustration: 'gutter',
    },
    {
      id: 'sample-siding-repair',
      title: 'Partial siding repair after storm damage',
      tradeCategory: 'siding',
      serviceArea: 'Sample Metro — North',
      completedOn: '2026-06-27',
      homeownerReleased: false,
      summary:
        'Sample project the company recorded but the homeowner has not released. It appears here without '
        + 'project proof, which is what an unreleased record looks like.',
      illustration: 'siding',
    },
  ],
  relationshipDisclosures: [
    'This is a synthetic listing created by Homesrolo to demonstrate the format.',
    'No payment, sponsorship, or advertising relationship exists, and none could change this listing’s position.',
  ],
}

/**
 * Two further synthetic listings. They exist so the index page can demonstrate
 * neutral ordering across more than one row, and so a test can shuffle a real
 * list rather than a list of one.
 */
const alsoSynthetic: PublicProfile[] = [
  {
    ...demoProfile,
    slug: 'sample-roofworks',
    displayName: 'Aspen Sample Roofworks (Sample Listing)',
    tradeCategories: ['roofing'],
    serviceAreas: ['Sample Metro — South'],
    summary:
      'A second synthetic listing, included so the directory can show more than one row and demonstrate that '
      + 'ordering is by name alone. Nothing here describes a real business.',
    externalLinks: [
      {
        kind: 'company_website',
        url: 'https://aspen-sample.example.com',
        attribution: 'Company-operated site. Homesrolo does not review or endorse its contents.',
      },
    ],
    portfolioPreview: [],
    verificationFacts: demoProfile.verificationFacts.map(fact =>
      fact.dimension === 'project_proof'
        ? {
            ...fact,
            status: 'not_checked' as const,
            source: 'not_collected' as const,
            statement: 'No homeowner-released project record exists for this sample listing yet.',
          }
        : fact,
    ),
  },
  {
    ...demoProfile,
    slug: 'sample-windowcraft',
    displayName: 'Meridian Sample Windowcraft (Sample Listing)',
    tradeCategories: ['windows_doors', 'exterior_painting'],
    serviceAreas: ['Sample Metro — West'],
    summary:
      'A third synthetic listing. Its facts differ from the others on purpose, to show that dimensions are '
      + 'independent and that a gap in one is not a verdict on the rest.',
    externalLinks: [],
    portfolioPreview: [],
  },
]

export const SYNTHETIC_PROFILES: readonly PublicProfile[] = Object.freeze([
  demoProfile,
  ...alsoSynthetic,
])

export function findSyntheticProfile(slug: string): PublicProfile | undefined {
  return SYNTHETIC_PROFILES.find(profile => profile.slug === slug)
}
