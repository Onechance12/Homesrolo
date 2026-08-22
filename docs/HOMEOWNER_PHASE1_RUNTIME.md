# Homeowner Phase 1 Runtime Foundation

Status: **implemented, capability-gated private whole-home runtime
foundation.** Passwordless email identity, opaque Homesrolo sessions, private
Postgres persistence, home creation, optional progressive onboarding, generic
whole-home projects, the roofing-specific project path, a private roof-proposal
scope comparison, default-off PDF/JPEG/PNG artifact storage, a default-off
sanitized seasonal-photo beta, a default-off public-source home research
assistant, and the consent-bound Jobrolo review handoff are implemented.
“Implemented” does not mean every capability is production-enabled: database
migrations, server configuration, release gates, and the security conditions
below still control what a deployed session may use.

The Homesrolo homeowner application is the home’s private Rolodex: a workspace
for a person to organize the people, planned and completed work, photos,
documents, equipment, warranties, care, and history connected to one home.
Roofing is the first deep content and workflow vertical, not the limit of the
home record. Homesrolo does not establish legal ownership, unlock contractor
records, hire a professional, or distribute work automatically.

## Core authorization boundary

1. A server-side identity adapter resolves a signed-in, email-verified principal.
2. A person privately creates a home workspace. Its relationship is explicitly
   labeled `claimed_unverified`; typing an address never proves ownership.
3. Every request fresh-reads one exact principal-to-home membership.
4. The server authorizes one exact action against one opaque home reference.
5. Repository and private-object adapters receive only the exact scoped record.
6. Third-party contributions remain behind the existing verified-controller or
   exact-active-share boundary. Home membership does not reveal their existence.

The command boundary uses idempotency-friendly opaque command references for
creating one private home workspace and private homeowner projects across the
whole home. It defines semantic warranty and maintenance records separately
from raw document bytes. Create-home, intake, and project saves use
transaction-bound command receipts; a changed payload cannot reuse an earlier
command reference.

Private artifacts live in a non-public Supabase Storage bucket. Each upload is
limited to 25 MiB, checked by file signature as PDF/JPEG/PNG, hashed with
SHA-256, stored under opaque home/object references, and read back before its
metadata becomes available. List and download routes fresh-check the exact home
membership; a download rechecks it again after object retrieval. Browser
responses contain no provider object key, integrity hash, or public URL.
`HOMESROLO_PRIVATE_UPLOADS_ENABLED=true` is a separate, default-off release
gate and must not be enabled before migration `202608120003` is applied.
It must also remain off until malware quarantine/scanning, abuse controls,
cleanup, deletion, and retention are implemented and verified.

The authenticated Home Library is now organized as a whole-home map: photos and
seasonal checkups, insurance, projects and upgrades, inventory and manuals,
warranties, taxes/value/sale records, events and maintenance, and people and
service history. These are presentation categories and honest empty states, not
a claim that every category has a dedicated persistence model. General file
rows come only from the private artifact list, and that upload form renders only
when the signed-in session reports `uploads: true`. Sanitized seasonal photos
come only from the separate photo-checkup port and render only when the session
reports `photoCheckups: true`. Neither capability silently substitutes for the
other.

The onboarding presentation is a four-stage, mobile-first progressive setup,
not a simulated assistant conversation. A familiar home name and general area
are the only required answers. The homeowner can skip home type, year built,
and the major-system questions and finish later. The saved initial record still
contains one source-labeled property-facts record and exactly one entry for each
of the six supported home systems. Unknown stays unknown, approximate years
keep their precision, and only a fresh workspace-controller grant may record
the intake.

The Phase 2A server application boundary now defines strict session, home-list,
and exact-home browser projections. It resolves identity from a server-owned
session handle, fresh-checks each principal-to-home membership, and strips
authority, provider, and object-storage fields before returning data. Its
capability response reports each feature separately and stays false until that
feature's required provider, configuration, migration, and release conditions
are satisfied.

The matching framework-neutral HTTP boundary serves `GET /api/v1/session`,
`GET /api/v1/homes`, `GET /api/v1/homes/{opaque-home-ref}`, `POST /api/v1/homes`,
`POST /api/v1/homes/{opaque-home-ref}/intake`, exact-home project list/detail
reads, generic `POST /api/v1/homes/{opaque-home-ref}/projects`, the retained
`POST /api/v1/homes/{opaque-home-ref}/roofing-projects`, exact-home artifact
metadata listing/upload, exact-artifact private download, and default-off
`POST /api/v1/homes/{opaque-home-ref}/research`.
The separate image-only boundary exposes an exact-home photo-checkup list and
raw JPEG/PNG upload plus exact-photo thumbnail, full-image, and delete routes.
The raw input route is not multipart and carries no original filename.
Roofing projects also expose an exact-project proposal list, strict create, and
revision-backed full save. These quote routes store homeowner-entered company
labels and partial scope classifications. An absent row means “not reviewed”;
`not_stated` is an explicit homeowner classification. Migration
`202608210001` must be applied and verified before the default-off
`HOMESROLO_PROJECT_QUOTES_ENABLED=true` release gate is enabled. When the gate
is false, the browser makes no quote-list or quote-write request.
One additional controller-only route submits an exact roofing project for
review. The browser supplies only contact preferences, explicitly selected
artifact references, and consent; the server derives the authenticated email,
home, project, disclosure digest, timestamps, and short-lived transfers.
It requires a server-owned session handle, rejects query/body identity claims,
returns a one-key `data` envelope, uses `no-store`, and maps failures to bounded
problem codes without leaking provider or repository details. A framework
adapter and Supabase-backed identity/persistence provider are present; partial
or malformed server configuration attaches neither and leaves the runtime
fail-closed.

The intake command is deliberately narrow. It records only homeowner-recalled
home type, year built, and the six supported system answers, including explicit
unknowns produced when optional onboarding is skipped. The browser sends no
principal, membership, role, source, timestamp, provider identifier, or
verification claim. The server fresh-reads the exact membership, requires the
workspace-controller role, derives the timestamp and source, and rejects
incoherent adapter output before returning a minimized projection.

The generic project command accepts only an opaque command reference, bounded
title and optional summary, one category, one status, and an optional occurred
date. Categories are `roofing`, `exterior`, `interior`, `electrical`,
`plumbing`, `hvac`, `landscaping`, `appliances`, `pest`, `pool`,
`new_construction`, and `other`. The runtime supports `planned`, `in_progress`,
`completed`, and `cancelled`; the current project-center UI presents plan,
track, and past-work flows, maps those to the first three statuses, and requires
a non-future completion date for historical work. The server fresh-checks the
exact home membership and derives principal scope and request time. Migration
`202608210002` widens the category constraint and installs the receipt-backed
generic project command; it must be applied before this route is used against a
configured database. No project-create command carries contractor or Jobrolo
authority.

The retained roofing command remains narrow. The browser supplies only an
opaque command reference, one roof-need enum, one timing enum, and bounded
optional notes. The server fresh-checks the exact home membership and derives
the category, status, title, summary, principal scope, and timestamp. It is a
specialized entry path into the same private project model, not the definition
of Homesrolo’s scope.

The proposal command carries no address, authority, total, retail-material
calculation, price score, ranking, or recommendation. A linked source must be
an available PDF document from the same exact private home and roofing project.
The server fresh-checks the controller and uses command receipts for idempotent
create/save operations. Saves include an expected revision so another session
cannot be silently overwritten.

## Seasonal photo checkups

The photo-checkup capability is independent of generic document uploads. It
remains false unless the configured private runtime also has
`HOMESROLO_PHOTO_CHECKUPS_ENABLED=true`, and migration `202608210003` has been
applied. Enabling it does not enable PDFs, general photo artifacts, Jobrolo
attachments, public links, or the research assistant.

One controller-selected JPEG or PNG of at most 10 MiB is authorized before the
body is buffered. The server admits one transform at a time, fully decodes the
input under bounded pixel and time limits, auto-orients it, and writes fresh
JPEG derivatives. The raw bytes and submitted filename are never stored.
Embedded EXIF, GPS, XMP, IPTC, ICC, and comments are not copied into the stored
derivatives. The full derivative is at most 2,048 pixels and 1.5 MiB; the lazy
thumbnail is at most 480 pixels and 100 KiB.

Each record requires an observation date, a fixed home area, and a bounded
homeowner-authored spot name. Chronological comparison is available only within
the same area and spot. It is a visual record, not an inspection, damage
diagnosis, causation finding, or proof of when a condition began.

The database applies atomic active-photo count and byte caps for each home,
principal, and the entire pilot, plus daily/monthly request and egress limits.
Downloads remain same-origin, membership-checked, integrity-checked, and
`no-store`. Deletion hides the row before removing both exact private objects,
then strips the photo context, hashes, dimensions, and storage keys. A minimal
opaque tombstone is retained for retry handling and becomes eligible for later
housekeeping; this beta has no timed cleanup job.
Interrupted upload/delete objects are quarantined, continue consuming quota,
and are reconciled opportunistically by later photo requests. The environment
flag is the immediate kill switch. The exact caps, limitations, and deployment
checks are in `docs/HOMEOWNER_PHOTO_CHECKUPS.md`.

## Public-source home research

The assistant foundation is default-off. A deployed session reports
`homeResearch: true` only when the core private homeowner runtime is configured
and the server also has `HOMESROLO_AI_ENABLED=true` plus a valid server-only
`OPENAI_API_KEY`. This branch does not create a key, configure a host secret,
enable the release flag, or prove the feature ready for production traffic.

The research route requires the existing session cookie, exact configured app
origin, a fresh exact-home membership check, and explicit consent for the
address being researched. Only the bounded street address, question, and up to
four recent chat turns are sent to OpenAI for that request. The request uses the
Responses API with `store: false`; that disables Responses application-state
storage but is not a promise of zero provider abuse-monitoring retention.

The server searches public sources, rejects private/local URLs and blocked real
estate listing marketplaces, and returns cited answers plus source-backed
`proposedFacts`. It does not estimate home value, repair cost, insurance
coverage, or contractor pricing. The route has no persistence dependency or
mutation port: neither the response nor the UI can silently add a fact to the
home record. The authenticated UI shows sources, limitations, confidence, and
an explicit per-request consent control; when the capability is false, it is
not rendered. A separate homeowner confirmation and write design
would be required before any proposed fact could be saved. Operational limits
and remaining release work are documented in `docs/HOME_RESEARCH.md`.

## Separation from Jobrolo

The homeowner runtime has its own principals, sessions, home references,
database, object storage, and audit stream. It imports no Jobrolo application
code and cannot enumerate Jobrolo projects. Its dedicated signed intake sends
only the homeowner-approved roofing disclosure to one configured Chance review
inbox. Private files remain in Homesrolo unless the separate attachment-handoff
gate is explicitly enabled. It creates no Jobrolo lead, customer, project,
professional assignment, or automatic distribution. Unknown delivery outcomes
are held for reconciliation and are never retried automatically.
Proposal labels, scope classifications, and comparison notes never enter the
current Jobrolo V1 disclosure. A homeowner may separately choose an exact
proposal PDF in the existing file-selection review, but nothing is selected
automatically and the comparison metadata stays in Homesrolo.

The handoff is default-off and requires all four server-only settings:
`HOMESROLO_JOBROLO_INTAKE_ENABLED=true`, the exact Jobrolo intake URL, a bounded
client ID, and a shared HMAC secret. The secret never enters browser code. The
session reports `projectReview: true` only when the homeowner provider and the
complete signed-intake configuration are both present. Migration
`202608120004` must be applied before enabling it.

Jobrolo attachment handoff has its own default-off server gate:
`HOMESROLO_JOBROLO_ATTACHMENTS_ENABLED=false`. While it is false, the session
reports `projectReviewAttachments: false`, the browser offers no file-selection
control, and the server rejects every nonempty `selectedArtifactRefs` list
before resolving identity or touching persistence, storage-transfer, or
delivery providers. Private uploads remain independently controlled by
`HOMESROLO_PRIVATE_UPLOADS_ENABLED`; a homeowner can keep files in Homesrolo
without sending them to Jobrolo. Do not enable attachment handoff until the
receiver's malware-scanning gate is independently configured and verified.

## Not yet implemented

- account recovery beyond requesting a fresh email link;
- malware scanning plus export, account/home deletion, and retention jobs for
  generic files and the broader private record;
- invitations and co-owner/controller verification;
- automatic matching, contractor routing, or professional distribution;
- specialized structured workflows for every Home Library area shown in the
  information architecture;
- saving or automatically applying AI-proposed home facts;
- production enablement, shared rate limiting, spend controls, monitoring, and
  incident procedures for home research;
- public links or public home records; and
- production-ready monitoring and incident procedures for the gated private
  runtime.

The UI may map future record areas through a narrow local adapter, but it must
show synthetic data as synthetic, render only records returned by implemented
server ports, and keep gated actions unavailable until the corresponding
runtime is independently migrated, configured, and security-reviewed.
