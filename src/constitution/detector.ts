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
// 1. ORDER-INDEPENDENT MATCHING OVER SENTENCES AND ADJACENT PAIRS.
//    An earlier draft matched fixed word orders ("is the offer fair") and missed
//    the way people actually write ("the offer was lowball"). Each rule now
//    pairs a TOPIC signal with a TRIGGER signal and fires when both appear in
//    one window, in any order.
//
//    A window is a single sentence OR two adjacent sentences joined, because
//    people routinely split the subject from the question: "My carrier made an
//    offer. Is it fair?" is one request wearing two sentences. Widening past
//    adjacency would let an unrelated topic five sentences back combine with a
//    trigger, so the window stops at two.
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

/**
 * Every sentence, plus every adjacent pair joined. A homeowner who writes
 * "My carrier made an offer. Is it fair?" has asked one question, and scoring
 * each sentence alone would find a topic with no trigger and a trigger with no
 * topic, and answer it.
 */
function windows(text: string): string[] {
  const parts = sentences(text)
  const scanned = [...parts]
  for (let index = 0; index + 1 < parts.length; index += 1) {
    const first = parts[index]
    const second = parts[index + 1]
    if (first && second) scanned.push(`${first} ${second}`)
  }
  return scanned
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
    topic: /\b(?:policy|policies|declarations?|dec page|endorsement|coverage form|policy language|exclusion|rider)\b/,
    // "grant", "provide", and "extend" are here because a homeowner asking
    // "could this endorsement grant wind protection?" is asking what their own
    // policy language does for them, which is interpretation whatever verb it wears.
    trigger: /\b(?:my|our|this|that)\b[^]{0,40}?\b(?:mean|means|say|says|read|interpret|explain|include|includes|apply|applies|entitle|entitles|cover|covers|grant|grants|provide|provides|extend|extends|add|adds|trigger|triggers|qualify|qualifies)\b|\b(?:mean|means|say|says|read|interpret|explain|apply|applies|cover|covers|grant|grants|provide|provides)\b[^]{0,40}?\b(?:my|our|this|that)\b/,
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
    topic: /\b(?:carrier|insurer|insurance|adjuster|claims department|state farm|allstate|farmers|usaa|company)\b/,
    // Three shapes: compose it, fix what they wrote, or ask what to say.
    // "Can you fix this email before I send it to State Farm?" is editing their
    // communication to the carrier, which is acting for them in the claim.
    trigger: /\b(?:write|draft|compose|word|edit|rewrite|put together|send)\b[^]{0,50}?\b(?:letter|email|message|demand|response|reply|appeal|complaint|statement|note)\b|\b(?:fix|edit|rewrite|reword|clean up|polish|proofread|tighten|improve|look at|review)\b[^]{0,40}?\b(?:letter|email|message|demand|response|reply|appeal|complaint|statement|note|draft)\b|\bwhat (?:should|do) i (?:say|write|tell|word)\b|\bhow should i (?:say|write|word|phrase)\b|\bhelp me (?:respond|reply|answer|write|draft|word|phrase|say|push back)\b/,
  },
  // Legal rights, remedies, deadlines, and whether to litigate.
  {
    id: 'legal_advice',
    topic: /\b(?:sue|suing|lawsuit|court|legal|lawyer|attorney|rights|remedies|recourse|bad faith|liable|liability|statute of limitations|deadline|time limit|filing period|cause of action|illegal|unlawful|actionable|press charges|breach)\b/,
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
  // Compensation for routing work. The trigger keeps a bare definition ("what
  // is a referral fee?") answerable while catching any version that asks who is
  // being paid.
  {
    id: 'compensated_referral',
    topic: /\b(?:kickback|referral fee|finder'?s fee|commission|cut of|paid to refer|pay (?:me|you) (?:for|to) (?:the )?(?:referral|lead))\b/,
    trigger: /\b(?:you|your|we|our|us|homesrolo|they|their|anyone|somebody|someone|get|gets|take|takes|receive|receives|earn|earns|charge|charges|paid|pay)\b/,
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

  // Scan both the framing-stripped text and the original, over sentences and
  // adjacent pairs, so neither stripping nor a wrapper can hide the request.
  const scanned = [...windows(stripped), ...windows(normalized)]

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

// --- safe refusals -----------------------------------------------------------
// The auditor runs on Homesrolo's OWN answers, and a correct answer often has to
// name the thing it will not do: "I cannot tell you that your policy covers this
// loss" contains the exact words of a coverage conclusion while asserting the
// opposite. Flagging it would train the product to refuse without explaining
// why, which is the worst of both outcomes.
//
// The guard is narrow on purpose. It recognizes a first-person epistemic
// refusal ("I cannot say…", "we do not advise…") or a universal prohibition
// ("no contractor should…"), and nothing else. A bare "not" does not qualify,
// so "you should not accept that offer" is still caught: that is advocacy with
// a negative sign, not a refusal to advocate.

const REFUSAL_FRAME =
  /\b(?:i|we|homesrolo)\s+(?:can'?t|cannot|do not|don'?t|does not|doesn'?t|won'?t|will not|am not able to|are not able to|is not able to)\s+(?:\w+\s+){0,3}?(?:tell|say|advise|advis\w*|guarantee|promise|assure|conclude|determine|decide|evaluate|assess|judge|interpret|recommend|draft|write|edit|comment|help|speak)\b|\bno (?:contractor|roofer|adjuster|company|one|law ?firm|lawyer|attorney|assistant|software|product)\b[^]{0,24}?\bshould\b|\b(?:homesrolo|this (?:assistant|product|tool)) (?:does not|doesn'?t|cannot|can'?t|will not|won'?t)\b|\bnobody can (?:tell|say|guarantee|promise)\b|\bno one can (?:tell|say|guarantee|promise)\b/

// --- response auditing -------------------------------------------------------
// Applied to a candidate answer before it reaches a homeowner. These look for
// the assistant ASSERTING a prohibited conclusion, which is a different shape
// from a homeowner asking for one.

// Patterns anchored with ^ are imperatives: advice does not need the word
// "should" to be advice, and "Invoke appraisal immediately." is a claim
// instruction whatever grammatical mood it arrives in. Anchoring to the start
// of a sentence keeps the same verbs from firing inside an explanation of what
// the process is.
const RESPONSE_RULES: readonly Rule[] = [
  { id: 'coverage_conclusion', topic: /\b(?:this|that|your (?:loss|damage|roof|claim))\b[^]{0,30}?\b(?:is|should be|will be|would be)\b[^]{0,20}?\bcovered\b|\byour policy (?:covers|does not cover|doesn'?t cover|excludes|includes)\b|\bthis (?:loss|damage) (?:is|is not|isn'?t) (?:a )?cover\w*/ },
  { id: 'policy_interpretation', topic: /\byour policy (?:means|says that you|entitles you|requires the carrier)\b|\byour (?:endorsement|declarations?|dec page|rider) (?:means|grants|provides|gives you|adds)\b|\bwhat (?:your|this) (?:policy|endorsement) means (?:for you|here|is)\b/ },
  {
    id: 'settlement_evaluation',
    topic: /\b(?:that|this|their|the) (?:offer|settlement|estimate|amount|payout)\b[^]{0,30}?\b(?:is|seems|looks|appears|was)\b[^]{0,20}?\b(?:low|lowball|unfair|inadequate|short|too little|fair|reasonable|about right|plenty|generous|solid|a good deal)\b|\b(?:you (?:are|were|have been)|they)\b[^]{0,24}?\b(?:underpaid|shortchanged|lowballed|owed more)\b|^(?:take|accept|sign|cash|reject|decline|turn down)\s+(?:the|that|this|their)\s+(?:offer|settlement|check|estimate|amount|payout)\b|\b(?:is|are|was|were)\s+(?:plenty|more than fair|generous|about right|a fair number)\b/,
  },
  {
    id: 'claim_strategy',
    topic: /\byou should\b[^]{0,40}?\b(?:demand|invoke|request|file|reopen|escalate|dispute|appeal|push back|challenge|reject|refuse)\b|\b(?:i recommend|my advice is|the best move is|what you (?:need to|should) do)\b[^]{0,40}?\b(?:claim|carrier|adjuster|appraisal|settlement)\b|^(?:invoke|demand|dispute|appeal|escalate|reopen|file|request)\b[^]{0,40}?\b(?:appraisal|claim|carrier|adjuster|settlement|offer|estimate|complaint|umpire|suit|denial)\b/,
  },
  {
    id: 'carrier_communication_drafting',
    topic: /\b(?:dear|to whom it may concern)\b[^]{0,40}?\b(?:adjuster|claims department|insurance)\b|\b(?:here'?s|here is) (?:a|the|your) (?:letter|email|message|draft)\b|^(?:send|copy|paste|use|forward)\s+(?:this|that|the following|it)\b|\b(?:send|say|write|tell them)\s+this\s*:/,
  },
  { id: 'legal_advice', topic: /\byou (?:can|should|have (?:a|the) right to|are entitled to)\b[^]{0,30}?\b(?:sue|file suit|take legal action|bad faith claim)\b|\byour deadline (?:is|was|to)\b|\byou have (?:a|the) (?:cause of action|claim for bad faith)\b/ },
  { id: 'outcome_guarantee', topic: /\b(?:i can guarantee|guaranteed|i promise|you will (?:definitely|certainly) (?:get|be paid|be approved))\b|\byour claim will (?:be approved|be paid|go through)\b/ },
  { id: 'deductible_evasion', topic: /\b(?:waiv\w*|absorb\w*|cover\w*|eat\w*)\b[^]{0,30}?\byour deductible\b|\byour deductible\b[^]{0,30}?\b(?:waived|absorbed|covered|taken care of|on (?:us|the house))\b/ },
  {
    id: 'damage_exaggeration',
    topic: /\b(?:say|tell them|tell the carrier|tell your adjuster|report|claim) (?:it'?s|the damage is) worse\b|\b(?:old|prior|pre-?existing|previous|existing)\s+(?:damage|loss|wear)\b[^]{0,40}?\b(?:came from|was from|is from|caused by|due to|resulted from)\b[^]{0,24}?\b(?:hail|wind|the storm|this storm)\b|^tell\s+(?:the|your)\s+(?:carrier|adjuster|insurer)\b[^]{0,60}?\b(?:old|prior|pre-?existing|previous)\b/,
  },
  { id: 'paid_steering', topic: /\b(?:i recommend|you should (?:use|hire|call)|go with)\b[^]{0,30}?\b(?:contractor|roofer|adjuster|company)\b/ },
  {
    id: 'compensated_referral',
    topic: /\b(?:we|i|homesrolo)\b[^]{0,24}?\b(?:receive|receives|get|gets|earn|earns|are paid|is paid|am paid|take|takes|collect|collects)\b[^]{0,40}?\b(?:referral fee|kickback|commission|finder'?s fee|a cut|paid referral)\b|\b(?:referral fee|kickback|commission|finder'?s fee)\b[^]{0,40}?\b(?:when we|when i|for sending|for referring|to send|for each|per lead)\b/,
  },
]

/**
 * Audit a candidate answer, sentence by sentence, skipping any match that sits
 * inside a refusal frame. Empty violations means the answer is publishable under
 * the constitution; it does not mean the answer is correct or useful.
 */
export function auditResponse(input: string): ResponseAudit {
  const normalized = normalize(input)
  const scanned = sentences(normalized)
  const violations: RefusalCategoryId[] = []

  for (const rule of RESPONSE_RULES) {
    if (violations.includes(rule.id)) continue
    for (const sentence of scanned) {
      const match = sentence.match(rule.topic)
      if (!match || match.index === undefined) continue
      // A refusal frame only excuses what follows it. "I cannot say your policy
      // covers this" is safe; "your policy covers this, though I cannot say
      // more" is not.
      if (REFUSAL_FRAME.test(sentence.slice(0, match.index))) continue
      violations.push(rule.id)
      break
    }
  }

  return { violations }
}
