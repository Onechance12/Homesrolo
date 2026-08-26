# Homesrolo home research foundation

The homeowner app has a default-off, server-only research boundary at:

`POST /api/v1/homes/{homeRef}/research`

It is deliberately stateless and read-only. A request must have the existing
Homesrolo session cookie, pass a fresh exact-home membership check, come from
the configured app origin, and include explicit consent to research the supplied
address online. The address is sent to OpenAI for that one request but is not
written to the Homesrolo database. The generated answer or source titles may
repeat address text, so the UI must continue to treat the entire response as private.

`store: false` disables Responses API application-state storage; it is not a
promise of zero provider retention. OpenAI's current [API data controls](https://developers.openai.com/api/docs/guides/your-data)
describe separate abuse-monitoring retention that must be reviewed before the
feature is enabled for homeowners.

## Release configuration

Both server environment variables are required:

- `HOMESROLO_AI_ENABLED=true`
- `OPENAI_API_KEY=<a project-scoped server API key>`

Rolo and public home research share the release gate and server-only API key,
for backward-compatible deployment, but they advertise separate `homeAssistant`
and `homeResearch` capabilities and do not share a model setting. Setting
`HOMESROLO_ROLO_ENABLED=true|false` gives Rolo its own explicit gate; when it is
absent, the original `HOMESROLO_AI_ENABLED` value is used during migration.
Public research remains pinned to
`gpt-5.6-luna`. Rolo defaults to `gpt-5.6-terra`; an operator may explicitly set
`HOMESROLO_ROLO_MODEL` to `gpt-5.6-luna`, `gpt-5.6-terra`, or `gpt-5.6-sol`.
Unknown model names fail closed. This separation prevents a cheap bounded
research/extraction choice from silently becoming the homeowner-facing voice.

No variable may use a `NEXT_PUBLIC_` prefix. The API key must be configured in
the server host's secret manager; it must not be committed, pasted into browser
code, or exposed in a Render build log. Missing or malformed configuration
returns the bounded `unavailable` response and makes no OpenAI request.

The first release pins `gpt-5.6-luna`, the Responses API, `store: false`, low
reasoning, low web-search context, and a 1,200-token output ceiling. Each call
has a 30-second upstream timeout. The route allows eight calls per authenticated
home/session per ten-minute process window. Before a multi-instance rollout,
replace that process-local brake with an atomic shared limiter and add account
spend alerts/limits.

Production enablement is also blocked until the researched address is bound to
the authorized home, a reviewed privacy notice exists, and actual OpenAI
`url_citation` annotations are preserved and rendered as clickable citations.
The current source allowlist proves only that a URL came from the web-search
tool; it does not yet prove sentence-level support.

## Truth and privacy boundary

- The server blocks Zillow, Realtor.com, Redfin, and Trulia search domains. It
  prefers government, county, municipal, GIS, FEMA, and manufacturer sources.
- Returned facts are labeled `proposedFacts`; the endpoint has no persistence or
  mutation port, so a model response cannot change a home record.
- Homeowner questions are checked against the Homesrolo constitution before a
  provider call, and generated answer text is audited again before release.
- A fact is discarded unless its citation matches a public HTTPS URL returned
  by the OpenAI web-search tool. Local/private IPs, credentials in URLs, listing
  marketplace links, and unsupported citations do not cross the boundary.
- The model is prohibited from inventing or estimating market value, repair or
  replacement cost, insurance coverage, or contractor pricing.
- Recent chat context is optional, role-bounded, and limited to four turns. The
  route accepts no client-supplied principal, membership, provider, or storage
  identifiers.

This is a default-off research/API foundation, not permission to silently
research an address during onboarding or enable production traffic. The UI must
present fresh per-request consent and must require a separate homeowner
confirmation before any proposed fact is ever saved.

## Rolo conversation boundary

`POST /api/v1/homes/{homeRef}/assistant` is a separate, no-tool Responses call.
Homesrolo owns the transcript and sends at most 16 recent text turns plus the
one pending work draft and one unanswered follow-up question. Provider response
storage stays disabled. This keeps corrections such as “upstairs” or “Wednesday,
not Tuesday” attached to the question and draft they answer without making
OpenAI the system of record.

Rolo receives the home label, city/state when available, bounded project and
file metadata, and system presence/year. It never receives the legacy
`privateLocationLabel`, because older/native records may contain a street
address in that display field. It does not receive the structured street
address, document text, browser identity, or provider credentials. By default it
does not receive file bytes or photo pixels. A filename is metadata, not evidence
that Rolo read the file.

### One-photo review boundary

Selected-photo review has its own release capability and requires all of:

- `HOMESROLO_ROLO_VISION_ENABLED=true`
- private uploads enabled for the homeowner account
- an authenticated exact-home artifact read
- one existing generic Library photo, selected by immutable artifact reference
- a fresh `consentToAnalyze: true` value on that exact message

The server reads the exact authorized artifact, accepts only JPEG or PNG photo
records, and re-encodes the pixels to a bounded JPEG through the same
metadata-stripping Sharp pipeline used for private photos. Only that derivative
is included as `input_image`; the original object URL, original bytes, EXIF, and
other photos are not sent. The Responses request remains stateless with
`store: false`, subject to the provider-retention caveat above. A separate,
tighter rate limiter protects image calls, and image transforms share one
process-wide memory slot with uploads on the free worker.

The output schema requires visible observations, explicit uncertainty, urgency,
a neutral likely trade when useful, and a bounded hazard signal. App-owned text
overrides the model for visible fire/smoke, electrical, water-near-electrical,
and major displacement/collapse signals. Rolo is prohibited from using pixels
to determine hidden cause, mold/asbestos, code compliance, structural soundness,
storm date or cause, workmanship, insurance, measurements, scope, or price.
Photo checkups are deliberately excluded because their public privacy promise
states that they are not sent to automated image analysis.

The Netlify production configuration enables this capability only after the
compatible client, exact-home authorization, explicit-consent UI, bounded
metadata-free transform, and deployment guard are present. Removing
`HOMESROLO_ROLO_VISION_ENABLED=true` hides the control and blocks image calls
without affecting text-only Rolo.

Rolo is a librarian, not an advisor. The versioned prompt carries the product
voice from `docs/VOICE.md`, distinguishes general education from facts about the
current home, and turns regulated requests into useful boundaries rather than
generic validation errors. Every write remains a reviewable draft until the
homeowner explicitly approves it.
