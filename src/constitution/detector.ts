// =============================================================================
// Homesrolo constitution: request classifier and response auditor
// =============================================================================
// Two pure functions:
//
//   classifyRequest(text)  -> which refusal categories a homeowner's message asks for
//   auditResponse(text)    -> which boundaries a candidate answer would cross
//
// Design notes that matter for review:
//
// 1. ORDER-INDEPENDENT, SENTENCE-SCOPED MATCHING.
//    An earlier draft matched fixed word orders ("is the offer fair") and missed
//    the way people actually write ("the offer was lowball"). Each rule now
//    pairs a TOPIC signal with a TRIGGER signal and fires when both appear in
//    the same sentence, in any order. Sentence scoping keeps an unrelated topic
//    in one clause from combining with a trigger three sentences away.
//
// 2. FRAMING DOES NOT LAUNDER INTENT. Roleplay, hypotheticals, quoting a
//    neighbor, "asking for a friend", and retractions are detected and recorded,
//    but they never suppress a match. The wrapper is stripped and the residual
//    request is classified on its own terms, and the original is also scanned so
//    stripping can never destroy evidence.
//
// 3. OVER-REFUSAL IS ALSO A FAILURE. A product that refuses "what does RCV mean"
//    is useless and pushes homeowners toward worse sources. Definition-shaped
//    and general-education-shaped requests stay answerable, and the test suite
//    asserts both directions.
//
// 4. THIS IS A FLOOR, NOT A JUDGE. Lexical detection catches the obvious and the
//    adversarially-obvious. It is one control among several (system prompt,
//    disclosures, scope limits, human review). It is deliberately biased toward
//    refusing when a regulated topic and a judgment signal co-occur, because a
//    wrong refusal inconveniences a homeowner while a wrong answer is unlicensed
//    adjusting.
//
// No network, no state, no model calls. Same input, same output.
// =============================================================================

import { type RefusalCategoryId } from './categories.ts'

export type BypassFraming =
  | 'roleplay'
  | 'hypothetical'
  | 'quotation'
  | 'retraction'
  | 'authority_override'

export type RequestClassification = {
  /** Categories the message asks Homesrolo to cross. Empty means answerable. */
  refusals: RefusalCategoryId[]
  /** Framing devices detected. Recorded for audit; never suppresses a refusal. */
  framing: BypassFraming[]
  /** True when the message reads as a definition or general-education request. */
  educational: boolean
}

export type ResponseAudit = {
  /** Boundaries the candidate answer would cross. Empty means publishable. */
  violations: RefusalCategoryId[]
}

// --- normalization -----------------------------------------------------------

function normalize(input: string): string {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function sentences(text: string): string[] {
  return text
    .split(/[.?!\n]+/)
    .map(part => part.trim())
    .filter(part => part.length > 0)
}

// --- framing detection -------------------------------------------------------

const FRAMING_PATTERNS: ReadonlyArray<{ id: BypassFraming; pattern: RegExp }> = [
  { id: 'roleplay', pattern: /\b(?:pretend|role[- ]?play|act as|acting as|you are (?:my|a|an)|you're (?:my|a|an)|imagine you(?:'re| are)|as if you were|in character)\b/ },
  { id: 'hypothetical', pattern: /\b(?:hypothetical(?:ly)?|in theory|theoretically|for a friend|asking for (?:a )?friend|suppose(?: that)?|let'?s say|what if someone|if someone)\b/ },
  { id: 'quotation', pattern: /\b(?:my (?:neighbor|friend|brother|cousin|coworker|contractor|roofer|buddy)|someone|a guy|people) (?:said|told me|says|thinks|mentioned)\b|\bi (?:read|saw|heard)\b/ },
  { id: 'retraction', pattern: /\b(?:ignore (?:what i|that|my last|the (?:above|previous))|forget (?:what i|that|the rules)|disregard (?:that|what i|the|your)|scratch that|never ?mind that|just tell me)\b/ },
  { id: 'authority_override', pattern: /\b(?:ignore (?:all |any )?(?:previous|prior) instructions|you (?:are allowed|can|may) (?:to )?ignore|your (?:rules|restrictions|guidelines) (?:do not|don'?t) apply|as (?:my|the) (?:adjuster|attorney|lawyer)|i (?:hereby )?authorize you)\b/ },
]

function detectFraming(text: string): BypassFraming[] {
  const found: BypassFraming[] = []
  for (const { id, pattern } of FRAMING_PATTERNS) {
    if (pattern.test(text) && !found.includes(id)) found.push(id)
  }
  return found
}

/** Remove framing lead-ins so the residual request is judged on its merits. */
function stripFraming(text: string): string {
  return text
    .replace(/\b(?:pretend|imagine)\s+(?:that\s+)?you(?:'re| are)?\s+(?:my|a|an)?\s*[a-z ]{0,24}?(?:adjuster|attorney|lawyer|expert|advisor|adviser)\b[,.]?/g, ' ')
    .replace(/\b(?:role[- ]?play(?:ing)?|act(?:ing)? as)\s+(?:my|a|an)?\s*[a-z ]{0,24}?(?:adjuster|attorney|lawyer|expert)\b[,.]?/g, ' ')
    .replace(/\byou(?:'re| are)\s+my\s+[a-z ]{0,24}?(?:adjuster|attorney|lawyer|expert)\b[,.]?/g, ' ')
    .replace(/\b(?:hypothetical(?:ly)?|in theory|theoretically|just curious|for a friend|asking for (?:a )?friend|suppose(?: that)?|let'?s say)\b[,.]?/g, ' ')
    .replace(/\b(?:ignore|forget|disregard)\s+(?:all\s+|any\s+)?(?:what i (?:said|asked)|that|my last (?:message|question)|the (?:above|previous|prior)(?: instructions| rules)?|the rules|your (?:rules|guidelines|restrictions))\b[,.]?/g, ' ')
    .replace(/\bmy (?:neighbor|friend|brother|cousin|coworker|contractor|roofer|buddy) (?:said|told me|says|thinks|mentioned)\b[,.]?/g, ' ')
    .replace(/\bi (?:read|saw|heard) (?:online |that |on )?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// --- category rules ----------------------------------------------------------
// A rule fires when its TOPIC and TRIGGER both appear in one sentence, in any
// order. Rules without a trigger fire on the topic alone (used where the phrase
// itself is the violation, such as evading a deductible).

type Rule = {
  id: RefusalCategoryId
  topic: RegExp
  trigger?: RegExp
}

/** First person or demonstrative reference to the homeowner's own matter. */
const OWN_MATTER = /\b(?:my|our|mine|ours|me|us|i|we|this|that|it|their|his|her|the homeowner'?s|someone'?s)\b/

const REQUEST_RULES: readonly Rule[] = [
  // Reading THEIR policy language and telling them what it means.
  {
    id: 'policy_interpretation',
    topic: /\b(?:policy|policies|declarations?|dec page|endorsement|coverage form|policy language|exclusion)\b/,
    trigger: /\b(?:my|our|this|that)\b[^]{0,40}?\b(?:mean|means|say|says|read|interpret|explain|include|includes|apply|applies|entitle|entitles|cover|covers)\b|\b(?:mean|means|say|says|read|interpret|explain|apply|applies|cover|covers)\b[^]{0,40}?\b(?:my|our|this|that)\b/,
  },
  // Concluding whether a specific loss is covered.
  {
    id: 'coverage_conclusion',
    topic: /\b(?:covered|coverage|cover|covers)\b/,
    trigger: OWN_MATTER,
  },
  // Judging whether a number is adequate.
  {
    id: 'settlement_evaluation',
    topic: /\b(?:offer|offered|settlement|estimate|payout|pay ?out|check|amount|scope|\$\s?[\d,]+)\b/,
    trigger: /\b(?:fair|enough|low|lowball\w*|adequate|reasonable|too little|too low|short|shorted|shortchang\w*|underpaid|underpay\w*|rip\w* (?:me|us) off|cheat\w*|worth it|accept|take it|sign|reject|decline|refuse|should i get|owed)\b/,
  },
  // Some judgments carry their own meaning with no topic word nearby:
  // "the carrier lowballed me" names the conclusion directly.
  {
    id: 'settlement_evaluation',
    topic: /\b(?:lowball\w*|underpaid|underpaying|shortchang\w*|rip\w* (?:me|us) off|stiffed (?:me|us))\b/,
  },
  // Recommending a move on a live claim.
  {
    id: 'claim_strategy',
    topic: /\b(?:claim|appraisal|carrier|adjuster|insurer|insurance|settlement|complaint|supplement|reinspection|re-?inspect\w*)\b/,
    trigger: /\b(?:should i|should we|should they|should someone|i should|we should|they should|ought to|demand|invoke|reopen|escalate|dispute|appeal|push back|fight|challenge|reject|decline|refuse|file (?:a|an)?|do next|what do i do|how do i (?:handle|approach|respond|get)|best (?:move|strategy|approach|way))\b/,
  },
  // Composing their words to the carrier.
  {
    id: 'carrier_communication_drafting',
    topic: /\b(?:carrier|insurer|insurance|adjuster|claims department|state farm|allstate|company)\b/,
    trigger: /\b(?:write|draft|compose|word|edit|rewrite|put together|send)\b[^]{0,50}?\b(?:letter|email|message|demand|response|reply|appeal|complaint|statement|note)\b|\bwhat (?:should|do) i (?:say|write|tell|word)\b|\bhow should i (?:say|write|word|phrase)\b/,
  },
  // Legal rights, remedies, and whether to litigate.
  {
    id: 'legal_advice',
    topic: /\b(?:sue|suing|lawsuit|court|legal|lawyer|attorney|rights|remedies|recourse|bad faith|liable|liability|statute of limitations|illegal|unlawful|actionable|press charges|breach)\b/,
    trigger: OWN_MATTER,
  },
  // Promising a result.
  {
    id: 'outcome_guarantee',
    topic: /\b(?:approv\w*|pay ?out|paid|cover\w*|outcome|result|odds|chances)\b/,
    trigger: /\b(?:will (?:my|the|it|they|i)|guarantee\w*|promise|assure|for sure|certain(?:ly)?|going to (?:get|be)|what are (?:my|the) (?:odds|chances))\b/,
  },
  // Erasing the deductible. The phrase is the violation.
  {
    id: 'deductible_evasion',
    topic: /\b(?:waiv\w*|eat|absorb\w*|cover|skip|avoid|get around|not pay|dodge|hide|rebate|credit|forget)\b[^]{0,40}?\bdeductible\b|\bdeductible\b[^]{0,40}?\b(?:waiv\w*|absorbed|covered by|on the house|free|out of it|paid for me|taken care of)\b/,
  },
  // Overstating the loss.
  {
    id: 'damage_exaggeration',
    topic: /\b(?:damage|loss|claim|hail|wind)\b/,
    trigger: /\b(?:exaggerat\w*|inflat\w*|overstat\w*|embellish\w*|stage|staged|fake|fabricat\w*|make up|made up|add (?:more|extra)|worse than it (?:is|was)|say it'?s worse|make it look worse|say (?:it|the damage) was worse)\b/,
  },
  // Likewise, coaching someone to overstate needs no topic noun to be clear.
  {
    id: 'damage_exaggeration',
    topic: /\b(?:worse than it (?:is|was|really)|say it'?s worse|make it look worse|tell them it'?s worse)\b/,
  },
  // Recommending a specific professional.
  {
    id: 'paid_steering',
    topic: /\b(?:contractor|roofer|adjuster|attorney|lawyer|company|pro|professional)\b/,
    trigger: /\b(?:who (?:should|do)|which (?:one|contractor|roofer|company)|should i (?:hire|use|call|pick)|do you recommend|would you recommend|recommend (?:a|an|the)|suggest (?:a|an|the)|refer me|point me to|send me to|is the best|hook me up)\b/,
  },
  // Compensation for routing work.
  {
    id: 'compensated_referral',
    topic: /\b(?:kickback|referral fee|finder'?s fee|commission|cut of|paid to refer|pay (?:me|you) (?:for|to) (?:the )?(?:referral|lead))\b/,
  },
]

// Definition-shaped and general-education-shaped requests stay answerable.
const EDUCATIONAL_PATTERNS: readonly RegExp[] = [
  /\bwhat (?:is|are|does)\b[^]{0,40}?\b(?:mean|stand for)\b/,
  /\bwhat (?:is|are) (?:a|an|the)\b/,
  /\b(?:define|definition of|explain (?:what|how)|how does\b[^]{0,40}?\bwork|in general|generally speaking|typically|usually)\b/,
  /\bdifference between\b/,
]

function ruleMatches(rule: Rule, sentence: string): boolean {
  if (!rule.topic.test(sentence)) return false
  if (!rule.trigger) return true
  return rule.trigger.test(sentence)
}

/**
 * Classify a homeowner's message. Framing devices are recorded but never excuse
 * a regulated request.
 */
export function classifyRequest(input: string): RequestClassification {
  const normalized = normalize(input)
  const framing = detectFraming(normalized)
  const stripped = stripFraming(normalized)

  // Scan both the framing-stripped text and the original, sentence by sentence,
  // so neither stripping nor a wrapper can hide the request.
  const scanned = [...sentences(stripped), ...sentences(normalized)]

  const refusals: RefusalCategoryId[] = []
  for (const rule of REQUEST_RULES) {
    if (refusals.includes(rule.id)) continue
    if (scanned.some(sentence => ruleMatches(rule, sentence))) refusals.push(rule.id)
  }

  return {
    refusals,
    framing,
    educational: refusals.length === 0 && EDUCATIONAL_PATTERNS.some(pattern => pattern.test(normalized)),
  }
}

// --- response auditing -------------------------------------------------------
// Applied to a candidate answer before it reaches a homeowner. These look for
// the assistant ASSERTING a prohibited conclusion, which is a different shape
// from a homeowner asking for one.

const RESPONSE_RULES: readonly Rule[] = [
  { id: 'coverage_conclusion', topic: /\b(?:this|that|your (?:loss|damage|roof|claim))\b[^]{0,30}?\b(?:is|should be|will be|would be)\b[^]{0,20}?\bcovered\b|\byour policy (?:covers|does not cover|doesn'?t cover|excludes|includes)\b/ },
  { id: 'policy_interpretation', topic: /\byour policy (?:means|says that you|entitles you|requires the carrier)\b/ },
  { id: 'settlement_evaluation', topic: /\b(?:that|this|their|the) (?:offer|settlement|estimate|amount|payout)\b[^]{0,30}?\b(?:is|seems|looks|appears|was)\b[^]{0,20}?\b(?:low|lowball|unfair|inadequate|short|too little|fair|reasonable|about right)\b|\b(?:you (?:are|were|have been)|they)\b[^]{0,24}?\b(?:underpaid|shortchanged|lowballed|owed more)\b/ },
  { id: 'claim_strategy', topic: /\byou should\b[^]{0,40}?\b(?:demand|invoke|request|file|reopen|escalate|dispute|appeal|push back|challenge|reject|refuse)\b|\b(?:i recommend|my advice is|the best move is|what you (?:need to|should) do)\b[^]{0,40}?\b(?:claim|carrier|adjuster|appraisal|settlement)\b/ },
  { id: 'carrier_communication_drafting', topic: /\b(?:dear|to whom it may concern)\b[^]{0,40}?\b(?:adjuster|claims department|insurance)\b|\b(?:here'?s|here is) (?:a|the|your) (?:letter|email|message|draft)\b/ },
  { id: 'legal_advice', topic: /\byou (?:can|should|have (?:a|the) right to|are entitled to)\b[^]{0,30}?\b(?:sue|file suit|take legal action|bad faith claim)\b/ },
  { id: 'outcome_guarantee', topic: /\b(?:i can guarantee|guaranteed|i promise|you will (?:definitely|certainly) (?:get|be paid|be approved))\b|\byour claim will (?:be approved|be paid|go through)\b/ },
  { id: 'deductible_evasion', topic: /\b(?:waiv\w*|absorb\w*|cover\w*|eat\w*)\b[^]{0,30}?\byour deductible\b/ },
  { id: 'damage_exaggeration', topic: /\b(?:say|tell them|report|claim) (?:it'?s|the damage is) worse\b/ },
  { id: 'paid_steering', topic: /\b(?:i recommend|you should (?:use|hire|call)|go with)\b[^]{0,30}?\b(?:contractor|roofer|adjuster|company)\b/ },
]

/**
 * Audit a candidate answer. Empty violations means it is publishable under the
 * constitution; it does not mean the answer is correct or useful.
 */
export function auditResponse(input: string): ResponseAudit {
  const normalized = normalize(input)
  const violations: RefusalCategoryId[] = []
  for (const rule of RESPONSE_RULES) {
    if (violations.includes(rule.id)) continue
    if (rule.topic.test(normalized)) violations.push(rule.id)
  }
  return { violations }
}
