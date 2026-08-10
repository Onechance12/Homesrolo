# Homeowner Phase 1 Runtime Foundation

Status: **draft contracts, adapter ports, and a read-only server application
boundary; no live provider or real data.**

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

The draft command boundary also defines idempotency-friendly opaque command
references for creating one private home workspace and one homeowner project.
It defines semantic warranty and maintenance records separately from raw
document bytes. No command adapter or database implementation exists yet.

The Phase 2A server application boundary now defines strict session, home-list,
and exact-home browser projections. It resolves identity from a server-owned
session handle, fresh-checks each principal-to-home membership, and strips
authority, provider, and object-storage fields before returning data. Its
capability response stays false for magic-link delivery, persistence, uploads,
invitations, and sharing until each provider is separately configured and
verified.

The matching framework-neutral HTTP boundary serves exactly `GET
/api/v1/session`, `GET /api/v1/homes`, and `GET /api/v1/homes/{opaque-home-ref}`.
It requires a server-owned session handle, rejects query/body identity claims,
returns a one-key `data` envelope, uses `no-store`, and maps failures to bounded
problem codes without leaking provider or repository details. A framework
adapter and real provider configuration are still required before deployment.

## Separation from Jobrolo

The homeowner runtime has its own principals, sessions, home references,
database, object storage, and audit stream. It imports no Jobrolo application
code and cannot enumerate Jobrolo projects. The separately reviewed
`homeowner-share.v1` protocol remains the only future cross-product seam.

## Not yet implemented

- authentication and recovery;
- database persistence and migrations;
- encrypted private object storage and malware scanning;
- upload, download, export, deletion, and retention jobs;
- invitations and co-owner/controller verification;
- trusted Jobrolo signature and revocation verification;
- public links or public home records; and
- production deployment, monitoring, and incident procedures.

The UI may depend on these types through a narrow local adapter, but it must
show synthetic data as synthetic until each server port is implemented and the
runtime is independently security-reviewed.
