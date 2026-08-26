# Homesrolo native application architecture

Status: **implementation decision**

Homesrolo ships as one product with three clients, not three independent
systems:

```text
apps/web        public education, discovery, and SEO
apps/homeowner  authenticated browser/PWA client and current API host
apps/mobile     native iOS and Android client

browser + native clients
        -> versioned Homesrolo API
        -> Homesrolo-owned Postgres and private object storage

Jobrolo
        -> signed, itemized handoff
        -> homeowner review and consent
        -> immutable Homesrolo-owned copy
```

The native client is an Expo Router / React Native application. It is not a
WebView and does not directly access Supabase. The existing server remains the
authority for identity, home membership, commands, private-file authorization,
AI access, and Jobrolo handoffs.

## Product navigation

The native app has five stable destinations:

1. **Home** — what needs attention, recent activity, systems, and the useful
   summary of this home.
2. **Care** — Home Watch, repeatable checkups, maintenance, and service rhythm.
3. **Rolo** — conversation, home search, and reviewable actions.
4. **Work** — issues, repairs, service, incidents, and projects.
5. **People** — household members, trusted professionals, visits, and scoped
   access.

Activity and files are not disconnected primary destinations. A stored object
has one canonical identity and appears in every relevant home, work, care, or
people context. The Home Record is the memory layer underneath the app, not a
form the homeowner must maintain.

## Reuse boundary

Shared across browser and native clients:

- portable TypeScript schemas and enums;
- API paths and response decoders;
- command references, revisions, and idempotency rules;
- permission and provenance vocabulary;
- upload reservation and completion protocol;
- visual tokens and analytics event names.

Platform-specific:

- React DOM and React Native views;
- browser cookie and native bearer-session transport;
- browser file inputs and native camera/document pickers;
- service-worker behavior and native encrypted queues;
- browser navigation and Expo Router navigation.

Server-only modules, private keys, `node:crypto`, service-role credentials,
OpenAI credentials, signing keys, and storage keys must never enter the native
bundle.

## Native session contract

The browser keeps the existing `HttpOnly`, `Secure`, `SameSite=Lax` opaque
session cookie. Native clients use the same random opaque session value through
an `Authorization: Bearer` header.

- Successful native email-code verification returns the opaque handle once.
- The app stores it only in iOS Keychain / Android Keystore through SecureStore.
- The database stores only the session hash.
- A request presenting both cookie and bearer credentials is rejected.
- Browser mutations retain exact-origin CSRF checks.
- Native mutations require the bearer session and never rely on a spoofable
  `Origin` header as authority.
- Sign-out revokes the server session before deleting the device copy.

The mobile application never receives Supabase service credentials, Resend
credentials, an OpenAI key, or a Jobrolo signing secret.

## Native file lifecycle

The existing reserve -> signed upload -> complete protocol remains canonical.
The native adapter adds device behavior without weakening it:

1. Select or capture a supported file.
2. Read bounded metadata and compute the content digest.
3. Request an exact-home upload reservation.
4. Upload bytes directly to the one-time signed private-storage destination.
5. Ask the Homesrolo server to verify and complete the record.
6. Delete any staged device copy after confirmed completion.

An interrupted upload remains retryable through the same command attempt.
Signed URLs are never cached. The first offline capability is capture and a
bounded pending-upload queue; the server remains authoritative for the Home
Record.

The initial native client keeps only active-session upload-attempt metadata; it
does not yet implement that offline queue. A failed upload retains its document
picker cache copy and command reference so re-picking the same command-bound
file can retry safely during the active app session. A retry first asks the
server to complete the exact remembered reservation before requesting another
bounded upload ticket. After server-confirmed success, the client attempts to
delete only marked files that are still inside Expo's cache directory and
retries failed cleanup while that app process remains active. Photo-library
sources are never marked for deletion. If the app exits first, Expo's
system-managed cache may retain an unreferenced copy until the platform reclaims
it; retry and pending-cleanup metadata are bounded to the active process and are
not restored.

## Jobrolo boundary

Homesrolo and Jobrolo do not share a database, session, user, or storage
authority. Jobrolo records contractor work. Homesrolo remembers homeowner-
accepted property history.

A Jobrolo contribution must be an exact, signed, itemized projection. The
homeowner previews and accepts it. Homesrolo then verifies and copies the
accepted immutable payload into its own private storage with digest,
provenance, consent, and revocation receipts.

## Release slices

### Native foundation

- Expo project and native navigation;
- shared API/client contracts;
- secure native authentication;
- universal links;
- native CI.

### Useful alpha

- sign in with a six-digit code;
- list and open homes;
- Home summary;
- Ask Rolo;
- create and edit work;
- capture/upload a photo or PDF;
- timeline persistence across restart.

### Whole-home beta

- systems and things;
- Care and Home Watch;
- People and professional history;
- private invitations;
- named visitor roster;
- proposal intake and comparison;
- selection and completion handoff.

### Store release gate

- reliable upload retry;
- push and universal links;
- account deletion and full export;
- privacy disclosures and support surfaces;
- accessibility and denied-permission paths;
- device end-to-end tests;
- TestFlight and Play closed testing.

### Transaction gate

Real award fees and construction-payment flows remain disabled until the direct
homeowner-contractor agreement, cancellation engine, contractor verification,
licensed payment provider, and state-specific legal review are complete.
Homesrolo does not become the contractor or hold construction money itself.

## Non-goals for the first native release

- measurements or AR;
- a public lead marketplace;
- paid ranking;
- crypto or transferable tokens;
- automatic AI diagnosis or unsupervised writes;
- direct access to Jobrolo tenant data;
- a second native-only backend.
