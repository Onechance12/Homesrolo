# homeowner-share.v1 Wire Specification

Status: **normative Phase 0 contract; no transport or live authorization.**

Jobrolo’s Phase 0 contract is the protocol anchor. Homesrolo reproduces its
literal canonical manifest, three signing payloads, and three replay keys.
src/contracts/tests/homeowner-share.test.ts is the byte-level conformance
fixture.

## Manifest

Exact fields:

| Field | Contract |
| --- | --- |
| contractVersion | homeowner-share.v1 |
| issuer / audience | jobrolo / homesrolo |
| purpose | homeowner_work_records |
| shareId | hshr_ + 43 opaque base64url characters |
| recipientRef | hrcp_ + 43 |
| generation | literal 1 |
| issuedAt / expiresAt | canonical UTC millisecond instants, 1–30 days |
| nonce | hnce_ + 43 |
| artifacts | 1–25 strict projection entries |

Artifact fields are artifactRef, source, projectionKind, projectionVersion,
mediaType, byteLength, and sha256.

- artifactRef is hproj_ + 43.
- source is homeowner_release.
- projectionVersion is an integer from 1 through 100.
- mediaType is application/json, application/pdf, image/jpeg, or image/png.
- byteLength is 1 through 25 MiB.
- sha256 is lowercase hexadecimal SHA-256.

Aggregate artifact bytes may not exceed 100 MiB. Canonical manifest bytes may
not exceed 64 KiB. Duplicate references and unknown fields fail. The Phase 0
launch-approved projection set is empty.

## Authorization receipt

Jobrolo to Homesrolo:

| Field | Contract |
| --- | --- |
| receiptVersion | homeowner-share.authorization.v1 |
| issuer / audience | jobrolo / homesrolo |
| authorizationId | hauth_ + 43 |
| authorizedByRole | owner or admin |
| authorizedActorRef | hactor_ + 43 |
| authorizationPolicyVersion | jobrolo-homeowner-disclosure.v1 |
| share/recipient/digest/version/expiry | exact manifest bindings |
| signing | Ed25519 proof |

## Consent receipt

Homesrolo to Jobrolo:

| Field | Contract |
| --- | --- |
| receiptVersion | homeowner-share.consent.v1 |
| issuer / audience | homesrolo / jobrolo |
| consentId | hcons_ + 43 |
| consentPolicyVersion | homesrolo-share-consent.v1 |
| share/recipient/digest/version/expiry | exact manifest bindings |
| acceptedAt | canonical instant |
| signing | Ed25519 proof |

## Revocation receipt

An immutable revocation is homeowner-share.revocation.v1, uses hrev_, and
binds the exact share, recipient, manifest digest, target receipt version,
target receipt ID, reason code, revocation instant, and signing proof.

Jobrolo may revoke a Jobrolo authorization for:

- authorization_withdrawn;
- source_unavailable; or
- security_response.

Homesrolo may revoke Homesrolo consent for:

- consent_withdrawn;
- account_deleted; or
- security_response.

Issuer, audience, target version/prefix, and reason must form an allowed pair.

## Signing proof and payload

Every receipt contains a nested signing object with algorithm Ed25519, an ASCII
code-owned key ID, and a canonical unpadded base64url signature for exactly 64
bytes.

The signing payload is canonical JSON of the strict receipt with
signing.algorithm and signing.keyId retained and only signing.signature
removed. This binds key selection and algorithm into the signed bytes.

Phase 0 parses canonical signature encoding but does not verify it against a
trusted key.

## Canonicalization

- recursively sort plain-object keys;
- preserve array order;
- accept JSON primitives only;
- reject non-finite numbers and non-plain objects;
- omit object properties whose value is undefined;
- emit UTF-8 with no insignificant whitespace;
- use lowercase hexadecimal SHA-256; and
- accept timestamps only as YYYY-MM-DDTHH:MM:SS.mmmZ real instants.

Strict parsers reject unknown fields before signing or digest decisions.

## Replay identity

Replay identity is stable from receipt version, issuer, and immutable receipt
ID. It is the SHA-256 of canonical JSON for this three-element array.

The exact golden values are:

| Receipt | Replay key |
| --- | --- |
| authorization | 532afbc246fd5be873839be88a3ad811c083529204e1fafc3e51bae49328575f |
| consent | 801f74c84aca67311a2d53a3f3aa458f38ed9ad54fdd2f66208f6bc23cf1ca48 |
| revocation | dcd1f96647db72262610750e78256bcae0c8ba1a19567e6238a5f635b6b66e0a |

Once replay identity matches, compare the entire parsed canonical receipt:
byte-identical is an exact replay; any mutation is a conflict. A future
authoritative ledger must quarantine conflicts and must not leave the first
receipt silently active.

## Structural compatibility

The manifest, authorization, and consent must agree on share, recipient,
purpose, contract version, digest, and expiry. Authorization cannot predate the
manifest; consent cannot predate authorization; equality at expiry is
unavailable.

Revocation compatibility additionally binds the target receipt version/ID,
manifest, recipient, and time.

These inspectors are explicitly non-authorizing. They do not verify trusted
keys, current source authority, current consent, current revocation state,
storage bytes, or service identity.

## Literal vectors

The test fixture locks eight exact values:

1. canonical manifest JSON;
2. manifest digest;
3. authorization signing payload;
4. consent signing payload;
5. revocation signing payload;
6. authorization replay key;
7. consent replay key; and
8. revocation replay key.

Both repositories must reproduce all eight before transport work. A locally
passing implementation with different vectors is a different protocol.

## Deliberately absent

No route, service authentication, key registry, ledger database, storage,
background sync, account mapping, property matching, UI, feature flag, or
delivery path is defined here. Phase 0 always denies delivery.
