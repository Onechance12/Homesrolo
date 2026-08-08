# homeowner-share.v1 receipt wire specification

**Status: normative. Homesrolo defines this layer; Jobrolo implements against
it.** Every value below is produced by `src/contracts/homeowner-share.v1.ts` and
asserted in Homesrolo CI, so this document and the implementation cannot drift.

This is a wire format, not a deployment. Nothing here is built on the Jobrolo
side yet, and nothing in Homesrolo transports a receipt anywhere.

## Why this direction

The manifest layer came from Jobrolo and is reconciled: Jobrolo's golden
manifest parses here, re-canonicalizes to identical bytes, and digests to
Jobrolo's published digest.

The receipt layer did not survive the same check. Jobrolo's brief supplied three
expected replay keys with no derivation. An exhaustive search over every subset,
ordering, separator, prefix, and receipt-type spelling of the eleven published
identity fields — 6,408,192 candidates — reproduced none of them. Jobrolo's
repository was then checked directly: **no branch, no pull request, and no
occurrence of `homeowner_release`, `homeowner-share`, `hproj_`, `hshr_`,
`hrcp_`, `replayKey`, or `manifestDigest` on main.** There is no implementation
to be compatible with, so waiting for the derivation to be published could not
terminate.

The three superseded values are retained in
`SUPERSEDED_REPLAY_KEYS` as a tripwire, with a test asserting this
implementation never produces them. If a Jobrolo implementation ever emits one,
the two sides have diverged.

## 1. Canonical primitives

Everything derives through these. A disagreement on one byte is a disagreement
about what was authorized.

**Canonical JSON.** Object keys sorted ascending by UTF-16 code unit,
recursively. Primitives as `JSON.stringify` emits them. No insignificant
whitespace. UTF-8 bytes. Canonicalization **fails** rather than dropping
anything: `undefined`, non-finite numbers, `-0`, bigint, functions, symbols, and
non-plain objects (including `Date` and `Map`) are errors. A silently dropped
key is a key one side signed and the other never saw.

**Digests.** SHA-256 over UTF-8 bytes, lowercase hex, 64 characters. An
uppercase digest is a different string and is refused.

**Timestamps.** Exactly `YYYY-MM-DDTHH:MM:SS.mmmZ` — three fractional digits, a
literal `Z`, and it must round-trip through `Date` unchanged.
`2026-08-15T12:00:00Z` and `2026-08-15T12:00:00.000+00:00` name the same instant
but are different bytes, and both are refused.

**Signatures.** Ed25519, 64 raw bytes, unpadded base64url, exactly 86
characters. Padding, the standard base64 alphabet, and any value that does not
survive a decode/re-encode round trip are refused.

**Identifiers.** A fixed prefix plus exactly 43 base64url characters
(258 bits). Any identifier whose body contains a run of 10 or more digits is
refused as PII-shaped.

| Prefix | Names |
|---|---|
| `hshr_` | share |
| `hrcp_` | recipient (the homeowner, opaque to Jobrolo) |
| `hproj_` | projection artifact |
| `hnce_` | manifest nonce |
| `hrec_` | receipt |

## 2. Receipt structure

Fifteen fields on every receipt, plus `revokesReceiptId` on revocations only.
**Strict:** any unknown field, any missing field, or `revokesReceiptId` on a
non-revocation rejects the receipt.

| Field | Value |
|---|---|
| `algorithm` | `"ed25519"` |
| `audience` | `"homesrolo"` |
| `contractVersion` | `"homeowner-share.v1"` |
| `expiresAt` | canonical instant, after `issuedAt` |
| `generation` | positive integer, equal to the manifest's |
| `issuedAt` | canonical instant |
| `issuer` | `"jobrolo"` |
| `keyId` | `^[a-z0-9][a-z0-9._-]{2,63}$` |
| `manifestDigest` | lowercase hex SHA-256 of the canonical manifest |
| `policyVersion` | `^[a-z0-9][a-z0-9._-]{2,63}$` |
| `purpose` | `"homeowner_work_records"` |
| `receiptId` | `hrec_` + 43 |
| `receiptType` | `"authorization"` \| `"consent"` \| `"revocation"` |
| `recipientRef` | `hrcp_` + 43 |
| `shareId` | `hshr_` + 43 |
| `revokesReceiptId` | `hrec_` + 43 — **revocations only** |

`issuer` and `audience` name the channel, not the signer. The signer is
identified by `keyId`. Jobrolo signs authorizations and revocations of its own
authorizations with its key; Homesrolo signs consent and revocations of its own
consent with its own. **Neither side ever holds the other's private key**, so
neither can manufacture the other's authority.

The envelope is exactly two fields:

```json
{ "receipt": { ...the fifteen fields... }, "signature": "<86 chars base64url>" }
```

## 3. Signing input

Four lines joined by a single `\n` (U+000A). No trailing newline.

```
homeowner-share.v1
<algorithm>
<keyId>
<canonicalJson(receipt)>
```

The algorithm and key identifier are inside the signed region, so a signature
cannot be replayed under a different algorithm or attributed to a different key.
The canonical receipt is the whole receipt, so every field is signed.

Sign these UTF-8 bytes directly with Ed25519. Do **not** pre-hash.

## 4. Replay key

```
replayKey = sha256hex( canonicalJson( identity(receipt) ) )
```

`identity` is exactly eight fields, and canonical JSON sorts them, so no
separate ordering rule is needed:

```
contractVersion, generation, manifestDigest, purpose,
receiptId, receiptType, recipientRef, shareId
```

**Deliberately excluded**, and why:

- `keyId`, `algorithm` — re-signing the same act after a key rotation is the
  same act, not a new one.
- `issuedAt`, `expiresAt`, `policyVersion`, `issuer`, `audience` — two receipts
  claiming the same identity with different values here are in conflict, and
  that conflict must be *detected*, not turned into two separate valid acts.
- `revokesReceiptId` — a revocation reusing a `receiptId` while pointing at a
  different target is a conflict, not a new revocation. Excluding it makes
  re-pointing detectable.

Identity answers "are these the same act?". Everything outside identity is
compared bytewise once identity matches.

## 5. Ledger semantics

Append-only. Entries are never edited or removed. Current state is a fold over
the whole history; there is no mutable status flag.

On append, compute the replay key and the canonical bytes of the full envelope:

| Condition | Outcome |
|---|---|
| Replay key unseen | **appended** |
| Replay key seen, canonical envelope bytes identical | **exact_replay** — idempotent, no state change |
| Replay key seen, bytes differ | **conflict** — refused; one of the two is not genuine and there is no way to tell which |
| Receipt fails strict parsing | **rejected** |

A revocation additionally requires that its `revokesReceiptId` names a receipt
already in this ledger, that the target is not itself a revocation, and that
target and revocation agree on `shareId`, `recipientRef`, `manifestDigest`, and
`generation`. Otherwise **rejected**.

Revocation is terminal. No receipt type un-revokes, and re-submitting the
original authorization is an `exact_replay` that changes nothing.

An authority is live for a `(shareId, manifestDigest)` when a receipt of that
type exists for it, is not a revocation target, and has not expired.

## 6. Binding

Disclosure requires an authorization **and** a consent, both live, both bound to
the same manifest digest. Either alone is nothing.

They must agree on all ten of: `audience`, `contractVersion`, `expiresAt`,
`generation`, `issuer`, `manifestDigest`, `policyVersion`, `purpose`,
`recipientRef`, `shareId`.

Each must match the manifest on `shareId`, `recipientRef`, `generation`, and
digest.

Chronology, all enforced:

- authorization `issuedAt` >= manifest `issuedAt`
- consent `issuedAt` >= authorization `issuedAt` — a homeowner cannot consent to
  a disclosure that was not yet authorized
- neither receipt's `expiresAt` may exceed the manifest's

## 7. Golden vectors

Reproduce every value exactly. All three receipts below bind to Jobrolo's
existing golden manifest (digest
`1530548c4c26130419afc759ea3520a6bd5e705664aedd0574e37b0bfbd084d1`).

### Authorization

Canonical receipt, 607 bytes:

```
{"algorithm":"ed25519","audience":"homesrolo","contractVersion":"homeowner-share.v1","expiresAt":"2026-08-15T12:00:00.000Z","generation":1,"issuedAt":"2026-08-08T12:00:00.000Z","issuer":"jobrolo","keyId":"jobrolo-share-2026a","manifestDigest":"1530548c4c26130419afc759ea3520a6bd5e705664aedd0574e37b0bfbd084d1","policyVersion":"homeowner-disclosure.v1","purpose":"homeowner_work_records","receiptId":"hrec_uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu","receiptType":"authorization","recipientRef":"hrcp_rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr","shareId":"hshr_sssssssssssssssssssssssssssssssssssssssssss"}
```

Canonical identity, 394 bytes:

```
{"contractVersion":"homeowner-share.v1","generation":1,"manifestDigest":"1530548c4c26130419afc759ea3520a6bd5e705664aedd0574e37b0bfbd084d1","purpose":"homeowner_work_records","receiptId":"hrec_uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu","receiptType":"authorization","recipientRef":"hrcp_rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr","shareId":"hshr_sssssssssssssssssssssssssssssssssssssssssss"}
```

- **replayKey** `17a1f92742b0e80b877e991be6e270a518e693f4ffdf92b628601b61048e8842`
- signing input: 654 bytes; **sha256** `439c238a0d7d6c9200d552d91b93f7fb09b5db6158cfd416728485dce14dea6a`

### Consent

Differs from the authorization in `issuedAt`, `keyId`, `receiptId`,
`receiptType`. Canonical receipt, 605 bytes:

```
{"algorithm":"ed25519","audience":"homesrolo","contractVersion":"homeowner-share.v1","expiresAt":"2026-08-15T12:00:00.000Z","generation":1,"issuedAt":"2026-08-08T12:05:00.000Z","issuer":"jobrolo","keyId":"homesrolo-consent-2026a","manifestDigest":"1530548c4c26130419afc759ea3520a6bd5e705664aedd0574e37b0bfbd084d1","policyVersion":"homeowner-disclosure.v1","purpose":"homeowner_work_records","receiptId":"hrec_ccccccccccccccccccccccccccccccccccccccccccc","receiptType":"consent","recipientRef":"hrcp_rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr","shareId":"hshr_sssssssssssssssssssssssssssssssssssssssssss"}
```

- **replayKey** `f216b80007cbcabbcc810f4ee65558a82b518146a4410d3c95751fe51d51138d`
- signing input: 656 bytes; **sha256** `ecd1d87988b1a66b060ef75b992e072e572e0c8b4ab4b35e40b70a061447569c`

### Revocation

Withdraws the authorization above. Canonical receipt, 674 bytes:

```
{"algorithm":"ed25519","audience":"homesrolo","contractVersion":"homeowner-share.v1","expiresAt":"2026-08-15T12:00:00.000Z","generation":1,"issuedAt":"2026-08-10T12:00:00.000Z","issuer":"jobrolo","keyId":"jobrolo-share-2026a","manifestDigest":"1530548c4c26130419afc759ea3520a6bd5e705664aedd0574e37b0bfbd084d1","policyVersion":"homeowner-disclosure.v1","purpose":"homeowner_work_records","receiptId":"hrec_vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv","receiptType":"revocation","recipientRef":"hrcp_rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr","revokesReceiptId":"hrec_uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu","shareId":"hshr_sssssssssssssssssssssssssssssssssssssssssss"}
```

- **replayKey** `7fb58c2de94007c671176b04dcc75de1cefbbb102252b2b4dbdd80f95b407dc6`
- signing input: 721 bytes; **sha256** `8a36c10239bdc600bdf5415a44766988f85e959e575c030ff83edc0fb2f0364d`

Note the identity is 391 bytes and **excludes** `revokesReceiptId`, per §4.

## 8. Conformance checklist

An implementation conforms when it reproduces:

1. The golden manifest's canonical bytes (692) and digest.
2. All three canonical receipt encodings, byte for byte.
3. All three replay keys.
4. All three signing-input digests.

And when it refuses:

5. Any unknown or missing receipt field; `revokesReceiptId` on a
   non-revocation; a revocation without one.
6. Non-canonical instants, uppercase digests, padded or standard-alphabet
   signatures, wrong-length signatures.
7. Identifiers with the wrong prefix, wrong width, or a 10+ digit run.
8. Same replay key with different bytes (**conflict**, and it must refuse both
   rather than pick one).
9. A revocation whose target is unknown, is itself a revocation, or disagrees on
   `shareId` / `recipientRef` / `manifestDigest` / `generation`.
10. Any binding or chronology violation in §6.

And when it demonstrates:

11. Byte-identical resubmission is `exact_replay` and does not grow the ledger.
12. Revocation is terminal — re-appending the original authorization does not
    restore it.

## 9. Deliberately not specified here

- **Transport.** No endpoint, method, header, or auth scheme. Both sides are
  contract-only.
- **Key distribution and rotation.** Agree the `keyId` scheme, publication
  mechanism, and rotation policy before either side generates a production key.
- **Storage.** Ledger persistence is each side's own business.
- **Signature verification against a trusted key.** Everything in
  `homeowner-share.v1.ts` is structural. Passing every check here proves shape
  and binding only — not that a signature is genuine, and not that the ledger is
  current. See `STRUCTURAL_VALIDATION_WARNING`.
- **Which projections exist.** Homesrolo's launch-approved set is frozen empty
  in Phase 0, so no manifest can produce a delivery regardless of what Jobrolo
  authorizes.

## 10. Open questions for Jobrolo

1. Does `policyVersion` mean the disclosure policy in force, as assumed here
   (`homeowner-disclosure.v1`)? If it means something else, say what and it will
   be renamed rather than reinterpreted.
2. Is `generation` per-share or global? Assumed per-share and monotonic.
3. Who issues `hrcp_` recipient references — Jobrolo or Homesrolo? Assumed
   Jobrolo, since it appears in the manifest, but Homesrolo owns homeowner
   identity, so this needs an explicit answer before either side mints one.
4. The original brief asked for **eight** literal golden assertions and supplied
   five values. This document publishes ten (one manifest, three canonical
   receipts, three replay keys, three signing-input digests). Confirm that
   covers what was intended.
