import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EXTERNAL_LINK_KINDS,
  NO_BLANKET_VERIFICATION_NOTICE,
  PROHIBITED_PUBLIC_FIELDS,
  PUBLIC_DIRECTORY_CONTRACT_VERSION,
  TRADE_CATEGORIES,
  VERIFICATION_DIMENSIONS,
  effectiveStatus,
  missingDimensions,
  parsePublicProfile,
  publicProfileSchema,
  type PublicProfile,
} from '../public-profile.v1.ts'
import * as profileModule from '../public-profile.v1.ts'
import {
  PUBLIC_PROFILE_FIELD_ALLOWLIST,
  displayFact,
  toPublicProjection,
} from '../projection.ts'
import { NEUTRAL_ORDERING_STATEMENT, neutralOrder } from '../ordering.ts'
import { DEMO_PROFILE_SLUG, SYNTHETIC_PROFILES, SYNTHETIC_NOTICE, findSyntheticProfile } from '../fixtures.ts'
import {
  CONSTITUTION_DISCLOSURES,
  FOR_PROFESSIONALS,
  HOW_IT_WORKS_STEPS,
  IDEAS_INTRO,
  LISTING_NOT_ENDORSEMENT,
  READING_A_LISTING,
  ROOFING_GUIDE,
  VERIFY_PRINCIPLES,
  type EducationalSection,
} from '../../content/education.ts'
import { auditResponse } from '../../../../../src/constitution/detector.ts'
import { REQUIRED_DISCLOSURES } from '../../../../../src/constitution/categories.ts'

const TODAY = '2026-08-09'

// =============================================================================
// Every fixture is synthetic and noindex
// =============================================================================

test('every synthetic profile parses and declares itself synthetic and noindex', () => {
  assert.ok(SYNTHETIC_PROFILES.length >= 3, 'need more than one row to demonstrate ordering')
  for (const profile of SYNTHETIC_PROFILES) {
    const parsed = parsePublicProfile(profile)
    assert.equal(parsed.isSynthetic, true, `${profile.slug} must be synthetic`)
    assert.equal(parsed.noindex, true, `${profile.slug} must be noindex`)
    assert.equal(parsed.contractVersion, PUBLIC_DIRECTORY_CONTRACT_VERSION)
    assert.match(parsed.displayName, /Sample Listing/, 'the synthetic status must be visible in the name')
  }
})

test('the demo profile resolves and a missing slug does not', () => {
  assert.ok(findSyntheticProfile(DEMO_PROFILE_SLUG), 'the demo slug must resolve')
  assert.equal(findSyntheticProfile('not-a-real-company'), undefined)
  assert.equal(findSyntheticProfile(''), undefined)
})

test('a profile cannot be marked real or indexable', () => {
  const [demo] = SYNTHETIC_PROFILES
  assert.ok(demo)
  assert.throws(() => publicProfileSchema.parse({ ...demo, isSynthetic: false }))
  assert.throws(() => publicProfileSchema.parse({ ...demo, noindex: false }))
})

test('no fabricated rating, review, testimonial, or customer count exists anywhere', () => {
  // Naming a rating in a disclaimer ("ratings stay on the source") is the
  // opposite of fabricating one, so this looks for rating-shaped VALUES and
  // for fields capable of carrying one — not for the word.
  const serialized = JSON.stringify(SYNTHETIC_PROFILES)
  for (const fabricated of [
    /\b\d(?:\.\d)?\s*(?:\/\s*5|out of 5|stars?)\b/i,
    /\b\d+\s*(?:reviews?|testimonials?)\b/i,
    /\b(?:over|more than)\s+[\d,]+\s+(?:customers|homeowners|jobs|projects)\b/i,
    /\b\d+%\s*(?:satisfaction|recommend)/i,
  ]) {
    assert.doesNotMatch(serialized, fabricated, 'fixtures must not fabricate social proof')
  }
  // And no field could carry one even if someone tried.
  for (const field of ['rating', 'ratings', 'reviews', 'reviewCount', 'stars', 'testimonials', 'customersServed']) {
    assert.equal(Object.keys(publicProfileSchema.shape).includes(field), false,
      `the profile model must have no "${field}" field`)
  }
})

// =============================================================================
// Strict rejection of unknown and private fields
// =============================================================================

test('every named private field rejects the whole profile', () => {
  const [demo] = SYNTHETIC_PROFILES
  assert.ok(demo)
  for (const field of PROHIBITED_PUBLIC_FIELDS) {
    assert.throws(
      () => parsePublicProfile({ ...demo, [field]: 'leaked' }),
      new RegExp(field),
      `private field "${field}" must be refused by name`,
    )
  }
})

test('any unknown field rejects the whole profile', () => {
  const [demo] = SYNTHETIC_PROFILES
  assert.ok(demo)
  assert.throws(() => parsePublicProfile({ ...demo, somethingNew: 1 }))
  assert.throws(() => parsePublicProfile({
    ...demo,
    portfolioPreview: [{ ...demo.portfolioPreview[0], secretCost: 1200 }],
  }))
  assert.throws(() => parsePublicProfile({
    ...demo,
    verificationFacts: [{ ...demo.verificationFacts[0], overallVerified: true }],
  }))
})

test('one bad nested item rejects the profile rather than being filtered out', () => {
  const [demo] = SYNTHETIC_PROFILES
  assert.ok(demo)
  const first = demo.portfolioPreview[0]
  assert.ok(first)
  assert.throws(() => parsePublicProfile({
    ...demo,
    portfolioPreview: [first, { ...first, id: 'Not A Slug', address: '123 Main St' }],
  }))
})

// =============================================================================
// External provider links
// =============================================================================

test('external links must be https and clearly synthetic', () => {
  const [demo] = SYNTHETIC_PROFILES
  assert.ok(demo)
  for (const link of demo.externalLinks) {
    const url = new URL(link.url)
    assert.equal(url.protocol, 'https:', `${link.kind} must be https`)
    assert.ok(
      url.hostname === 'example.com' || url.hostname.endsWith('.example.com'),
      `${link.kind} must be a synthetic example.com host, got ${url.hostname}`,
    )
    assert.ok(link.attribution.length >= 4, 'every external link must carry attribution')
  }
})

test('real provider hosts and insecure schemes are refused', () => {
  const [demo] = SYNTHETIC_PROFILES
  assert.ok(demo)
  for (const bad of [
    'https://www.bbb.org/us/tx/austin/profile/roofing/real-co',
    'https://www.angi.com/companylist/us/tx/real-co.htm',
    'https://www.pinterest.com/realco/',
    'https://maps.google.com/?cid=12345',
    'http://demo-exteriors.example.com',
    'ftp://demo-exteriors.example.com',
  ]) {
    assert.throws(
      () => parsePublicProfile({
        ...demo,
        externalLinks: [{ kind: 'company_website', url: bad, attribution: 'Company-operated site.' }],
      }),
      `${bad} must be refused in V1`,
    )
  }
})

test('the link kinds cover the named providers without implying a partnership', () => {
  for (const kind of ['company_website', 'google_business_profile', 'bbb', 'angi', 'pinterest']) {
    assert.ok((EXTERNAL_LINK_KINDS as readonly string[]).includes(kind))
  }
})

// =============================================================================
// Public projection allowlist
// =============================================================================

test('the projection emits exactly the allowlisted keys', () => {
  const [demo] = SYNTHETIC_PROFILES
  assert.ok(demo)
  const projected = toPublicProjection(demo)
  assert.deepEqual(Object.keys(projected).sort(), [...PUBLIC_PROFILE_FIELD_ALLOWLIST].sort())
})

test('no prohibited field can survive the projection', () => {
  const allowlist = new Set<string>(PUBLIC_PROFILE_FIELD_ALLOWLIST)
  for (const field of PROHIBITED_PUBLIC_FIELDS) {
    assert.equal(allowlist.has(field), false, `"${field}" must never be allowlisted`)
  }
  const [demo] = SYNTHETIC_PROFILES
  assert.ok(demo)
  // Even if a private field were smuggled past the schema, the projection drops it.
  const smuggled = { ...demo, address: '123 Main St', sponsorshipTier: 'gold' } as unknown as PublicProfile
  const projected = toPublicProjection(smuggled) as Record<string, unknown>
  assert.equal('address' in projected, false)
  assert.equal('sponsorshipTier' in projected, false)
})

// =============================================================================
// Verification is dimensional, never one boolean
// =============================================================================

test('there is no blanket verified boolean anywhere in the model', () => {
  assert.equal(Object.keys(publicProfileSchema.shape).includes('verified'), false)
  assert.equal(Object.keys(publicProfileSchema.shape).includes('isVerified'), false)
  for (const exported of Object.keys(profileModule)) {
    assert.doesNotMatch(exported, /^is[A-Z].*Verified$/, `${exported} would collapse five dimensions into one`)
  }
  assert.match(NO_BLANKET_VERIFICATION_NOTICE, /does not publish an overall verified badge/)
  assert.match(NO_BLANKET_VERIFICATION_NOTICE, /not an endorsement/)
})

test('the demo profile speaks to all five dimensions', () => {
  const demo = findSyntheticProfile(DEMO_PROFILE_SLUG)
  assert.ok(demo)
  assert.deepEqual(missingDimensions(demo), [], 'silence on a dimension reads as approval; state it explicitly')
  assert.equal(VERIFICATION_DIMENSIONS.length, 5)
})

test('an expired fact reads as expired regardless of its stored status', () => {
  const fact = {
    dimension: 'insurance',
    status: 'confirmed',
    source: 'insurer_certificate',
    statement: 'A sample certificate was supplied for the period shown.',
    checkedAt: '2026-01-01',
    expiresAt: '2026-07-01',
  } as const
  assert.equal(effectiveStatus(fact, '2026-06-30'), 'confirmed')
  assert.equal(effectiveStatus(fact, '2026-08-09'), 'expired')
})

test('every displayed fact carries status, source, and a checked date', () => {
  for (const profile of SYNTHETIC_PROFILES) {
    for (const fact of profile.verificationFacts) {
      const shown = displayFact(fact, TODAY)
      assert.ok(shown.dimension.length > 0, 'a fact must name its dimension')
      assert.ok(shown.statusLabel.length > 0, 'a fact must show a status')
      assert.ok(shown.sourceLabel.length > 0, 'a fact must show where it came from')
      assert.match(shown.asOfLabel, /^Checked \d{4}-\d{2}-\d{2}/, 'a fact must show when it was checked')
      assert.ok(shown.statement.length >= 8)
      if (fact.expiresAt) assert.ok(shown.expiresLabel, 'a lapsing fact must show its expiry')
    }
  }
})

test('self-reported facts are never labelled as confirmation', () => {
  const demo = findSyntheticProfile(DEMO_PROFILE_SLUG)
  assert.ok(demo)
  const selfReported = demo.verificationFacts.filter(fact => fact.source === 'company_self_reported')
  assert.ok(selfReported.length > 0, 'the demo should show what a self-reported fact looks like')
  for (const fact of selfReported) {
    assert.notEqual(fact.status, 'confirmed')
    assert.match(displayFact(fact, TODAY).sourceLabel, /company itself/i)
  }
})

// =============================================================================
// Neutral ordering
// =============================================================================

test('ordering is deterministic and independent of input order', () => {
  const expected = neutralOrder(SYNTHETIC_PROFILES).map(profile => profile.slug)
  const shuffles = [
    [...SYNTHETIC_PROFILES].reverse(),
    [...SYNTHETIC_PROFILES].slice(1).concat(SYNTHETIC_PROFILES[0] as PublicProfile),
  ]
  for (const shuffled of shuffles) {
    assert.deepEqual(neutralOrder(shuffled).map(profile => profile.slug), expected)
  }
  // Alphabetical by display name: Aspen, Demo, Meridian.
  assert.deepEqual(expected, ['sample-roofworks', 'demo', 'sample-windowcraft'])
})

test('ordering ignores verification, portfolio size, and any injected commercial field', () => {
  const baseline = neutralOrder(SYNTHETIC_PROFILES).map(profile => profile.slug)

  const stripped = SYNTHETIC_PROFILES.map(profile => ({
    ...profile,
    verificationFacts: [],
    portfolioPreview: [],
  })) as unknown as PublicProfile[]
  assert.deepEqual(neutralOrder(stripped).map(profile => profile.slug), baseline,
    'confirming a credential must not move a company up the page')

  const bribed = SYNTHETIC_PROFILES.map((profile, index) => ({
    ...profile,
    sponsorshipTier: index === 2 ? 'platinum' : 'none',
    rankBoost: index === 2 ? 9999 : 0,
    placementFee: index === 2 ? 50_000 : 0,
  })) as unknown as PublicProfile[]
  assert.deepEqual(neutralOrder(bribed).map(profile => profile.slug), baseline,
    'placement must not be purchasable')
})

test('the neutrality statement is explicit about what does not influence order', () => {
  for (const term of ['payment', 'sponsorship', 'advertising', 'verification status']) {
    assert.ok(NEUTRAL_ORDERING_STATEMENT.toLowerCase().includes(term), `neutrality must name ${term}`)
  }
})

// =============================================================================
// Constitution: disclosures and audited copy
// =============================================================================

test('the site disclosures match the constitution verbatim', () => {
  assert.deepEqual([...CONSTITUTION_DISCLOSURES], [...REQUIRED_DISCLOSURES])
})

const ALL_SECTIONS: ReadonlyArray<[string, readonly EducationalSection[]]> = [
  ['roofing guide', ROOFING_GUIDE],
  ['how it works', HOW_IT_WORKS_STEPS],
  ['how we verify', VERIFY_PRINCIPLES],
  ['reading a listing', READING_A_LISTING],
  ['ideas', IDEAS_INTRO],
  ['for professionals', FOR_PROFESSIONALS],
]

test('all educational copy passes the constitutional response audit', () => {
  for (const [name, sections] of ALL_SECTIONS) {
    for (const section of sections) {
      const heading = auditResponse(section.heading)
      assert.deepEqual(heading.violations, [],
        `${name} heading crosses a boundary: "${section.heading}" (${heading.violations.join(', ')})`)
      for (const paragraph of section.body) {
        const audit = auditResponse(paragraph)
        assert.deepEqual(audit.violations, [],
          `${name} copy crosses a boundary (${audit.violations.join(', ')}): "${paragraph}"`)
      }
    }
  }
})

test('fixture prose and site notices pass the audit too', () => {
  const prose = [
    SYNTHETIC_NOTICE,
    LISTING_NOT_ENDORSEMENT,
    NO_BLANKET_VERIFICATION_NOTICE,
    NEUTRAL_ORDERING_STATEMENT,
    ...SYNTHETIC_PROFILES.flatMap(profile => [
      profile.summary,
      ...profile.verificationFacts.map(fact => fact.statement),
      ...profile.portfolioPreview.map(item => item.summary),
      ...profile.relationshipDisclosures,
      ...profile.externalLinks.map(link => link.attribution),
    ]),
  ]
  for (const text of prose) {
    const audit = auditResponse(text)
    assert.deepEqual(audit.violations, [], `copy crosses a boundary (${audit.violations.join(', ')}): "${text}"`)
  }
})

test('the roofing guide stays educational and names the deductible warning sign', () => {
  const joined = ROOFING_GUIDE.flatMap(section => section.body).join(' ')
  assert.match(joined, /replacement cost value/i)
  assert.match(joined, /actual cash value/i)
  assert.match(joined, /treated as fraud in many states/i,
    'the deductible prohibition is education a homeowner can act on safely')
  assert.doesNotMatch(joined, /\byou should\b/i, 'a guide describes; it does not instruct')
})

// =============================================================================
// Trade categories stay neutral
// =============================================================================

test('trade categories are descriptive and carry no quality or tier signal', () => {
  for (const category of TRADE_CATEGORIES) {
    assert.match(category, /^[a-z_]+$/)
    assert.doesNotMatch(category, /premium|elite|preferred|pro_plus|gold|silver|partner/)
  }
})

test('relationship disclosures are present and state the absence of a paid relationship', () => {
  const demo = findSyntheticProfile(DEMO_PROFILE_SLUG)
  assert.ok(demo)
  assert.ok(demo.relationshipDisclosures.length > 0, 'an empty disclosure list is itself a claim')
  assert.ok(
    demo.relationshipDisclosures.some(line => /no payment, sponsorship, or advertising/i.test(line)),
    'the listing must state that no paid relationship exists',
  )
})
