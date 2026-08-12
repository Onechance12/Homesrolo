# Homeowner Phase 1 Runtime Foundation

Status: **configured private runtime foundation.** Passwordless email identity,
opaque Homesrolo sessions, private Postgres persistence, home creation, and the
six-system intake are implemented. Uploads, invitations, sharing, controller
verification, and Jobrolo transport remain unavailable.

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
references for creating one private home workspace and one homeowner project.
It defines semantic warranty and maintenance records separately from raw
document bytes. Create-home and intake saves use transaction-bound command
receipts; a changed payload cannot reuse an earlier command reference.

The initial living record stores one source-labeled property-facts record and exactly one entry for
each of the six supported home systems. Unknown stays unknown, approximate
years keep their precision, and only a fresh workspace-controller grant may
record the intake.

The Phase 2A server application boundary now defines strict session, home-list,
and exact-home browser projections. It resolves identity from a server-owned
session handle, fresh-checks each principal-to-home membership, and strips
authority, provider, and object-storage fields before returning data. Its
capability response stays false for magic-link delivery, persistence, uploads,
invitations, and sharing until each provider is separately configured and
verified.

The matching framework-neutral HTTP boundary serves exactly `GET
/api/v1/session`, `GET /api/v1/homes`, `GET
/api/v1/homes/{opaque-home-ref}`, `POST /api/v1/homes`, and `POST
/api/v1/homes/{opaque-home-ref}/intake`.
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

## Separation from Jobrolo

The homeowner runtime has its own principals, sessions, home references,
database, object storage, and audit stream. It imports no Jobrolo application
code and cannot enumerate Jobrolo projects. The separately reviewed
`homeowner-share.v1` protocol remains the only future cross-product seam.

## Not yet implemented

- account recovery beyond requesting a fresh email link;
- encrypted private object storage and malware scanning;
- upload, download, export, deletion, and retention jobs;
- invitations and co-owner/controller verification;
- trusted Jobrolo signature and revocation verification;
- public links or public home records; and
- production deployment, monitoring, and incident procedures.

The UI may depend on these types through a narrow local adapter, but it must
show synthetic data as synthetic until each server port is implemented and the
runtime is independently security-reviewed.
