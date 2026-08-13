# Homeowner Phase 1 Runtime Foundation

Status: **configured private runtime foundation.** Passwordless email identity,
opaque Homesrolo sessions, private Postgres persistence, home creation, the
six-system intake, a private roof-project request, and private PDF/JPEG/PNG
artifact storage, and the consent-bound Jobrolo review handoff are implemented.
Invitations, public sharing, controller verification, and automatic
professional distribution remain unavailable.

The first HomesRolo homeowner application is a private workspace for a person
to organize one home, its projects, photos, documents, warranties, and timeline.
It does not establish legal ownership and it does not unlock contractor records.

## First vertical slice

1. A server-side identity adapter resolves a signed-in, email-verified principal.
2. A person privately creates a home workspace. Its relationship is explicitly
   labeled `claimed_unverified`; typing an address never proves ownership.
3. Every request fresh-reads one exact principal-to-home membership.
4. The server authorizes one exact action against one opaque home reference.
5. Repository and private-object adapters receive only the exact scoped record.
6. Third-party contributions remain behind the existing verified-controller or
   exact-active-share boundary. Home membership does not reveal their existence.

The command boundary uses idempotency-friendly opaque command
references for creating one private home workspace and one homeowner roof project.
It defines semantic warranty and maintenance records separately from raw
document bytes. Create-home and intake saves use transaction-bound command
receipts; a changed payload cannot reuse an earlier command reference.

Private artifacts live in a non-public Supabase Storage bucket. Each upload is
limited to 25 MiB, checked by file signature as PDF/JPEG/PNG, hashed with
SHA-256, stored under opaque home/object references, and read back before its
metadata becomes available. List and download routes fresh-check the exact home
membership; a download rechecks it again after object retrieval. Browser
responses contain no provider object key, integrity hash, or public URL.
`HOMESROLO_PRIVATE_UPLOADS_ENABLED=true` is a separate, default-off release
gate and must not be enabled before migration `202608120003` is applied.

The initial living record stores one source-labeled property-facts record and exactly one entry for
each of the six supported home systems. Unknown stays unknown, approximate
years keep their precision, and only a fresh workspace-controller grant may
record the intake.

The Phase 2A server application boundary now defines strict session, home-list,
and exact-home browser projections. It resolves identity from a server-owned
session handle, fresh-checks each principal-to-home membership, and strips
authority, provider, and object-storage fields before returning data. Its
capability response stays false for each feature until its provider and
explicit release gate are separately configured and verified.

The matching framework-neutral HTTP boundary serves `GET /api/v1/session`,
`GET /api/v1/homes`, `GET /api/v1/homes/{opaque-home-ref}`, `POST /api/v1/homes`,
`POST /api/v1/homes/{opaque-home-ref}/intake`, exact-home project list/detail
reads, `POST /api/v1/homes/{opaque-home-ref}/roofing-projects`, exact-home
artifact metadata listing/upload, and exact-artifact private download.
One additional controller-only route submits an exact roofing project for
review. The browser supplies only contact preferences, explicitly selected
artifact references, and consent; the server derives the authenticated email,
home, project, disclosure digest, timestamps, and short-lived transfers.
It requires a server-owned session handle, rejects query/body identity claims,
returns a one-key `data` envelope, uses `no-store`, and maps failures to bounded
problem codes without leaking provider or repository details. A framework
adapter is present; real identity and persistence providers are still required.

The intake command is deliberately narrow. It records only homeowner-recalled
home type, year built, and the six supported system answers. The browser sends
no principal, membership, role, source, timestamp, provider identifier, or
verification claim. The server fresh-reads the exact membership, requires the
workspace-controller role, derives the timestamp and source, and rejects
incoherent adapter output before returning a minimized projection.

The roofing command is equally narrow. The browser supplies only an opaque
command reference, one roof-need enum, one timing enum, and bounded optional
notes. The server fresh-checks the exact home membership and derives the trade,
status, title, summary, principal scope, and timestamp. There is no generic
browser project-create route and no contractor or Jobrolo authority in this
command.

## Separation from Jobrolo

The homeowner runtime has its own principals, sessions, home references,
database, object storage, and audit stream. It imports no Jobrolo application
code and cannot enumerate Jobrolo projects. Its dedicated signed intake sends
only the homeowner-approved roofing disclosure and selected artifacts to one
configured Chance review inbox. It creates no Jobrolo lead, customer, project,
professional assignment, or automatic distribution. Unknown delivery outcomes
are held for reconciliation and are never retried automatically.

The handoff is default-off and requires all four server-only settings:
`HOMESROLO_JOBROLO_INTAKE_ENABLED=true`, the exact Jobrolo intake URL, a bounded
client ID, and a shared HMAC secret. The secret never enters browser code. The
session reports `projectReview: true` only when the homeowner provider and the
complete signed-intake configuration are both present. Migration
`202608120004` must be applied before enabling it.

## Not yet implemented

- account recovery beyond requesting a fresh email link;
- malware scanning, export, deletion, and retention jobs;
- invitations and co-owner/controller verification;
- automatic matching, contractor routing, or professional distribution;
- public links or public home records; and
- production deployment, monitoring, and incident procedures.

The UI may depend on these types through a narrow local adapter, but it must
show synthetic data as synthetic until each server port is implemented and the
runtime is independently security-reviewed.
