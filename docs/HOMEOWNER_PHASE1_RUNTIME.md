# Homeowner Phase 1 Runtime Foundation

Status: **draft contracts and adapter ports; no live runtime or real data.**

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
