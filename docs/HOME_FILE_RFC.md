# The home file: a permanent record for every home

**Status: design. Not implemented.** This RFC supersedes the position in
`ARCHITECTURE_BOUNDARY.md` that Homesrolo keeps no durable record and that a
homeowner's view ends when a share ends. That position was written to answer
"what can a homeowner see", and the answer has changed.

**Not legal advice.** §4 flags a regulatory question that the attorney review
already obtained almost certainly did not cover, because it reviewed the
education-versus-advocacy constitution, not the operation of a property-history
database. That question needs specific counsel before this is built.

## 1. The model

**Every home has a file. The file is permanent and belongs to the home, not to a
job, a contractor, a claim, or a homeowner.**

- **Every upload lands in the home file**, whoever uploads it.
- **The uploader owns their contribution.** Owning it means seeing it, and
  controlling who else does.
- **Being in the home file is not being visible.** The file is a container, not
  a shared pool. Default deny.
- **Contributions are never lost.** Access changes constantly. The record does
  not.

```
  Home file  (permanent, per property, outlives every job and every owner)
  |
  +-- contribution   owner: A   -> A sees it. Others only by grant.
  +-- contribution   owner: B   -> B sees it. Others only by grant.
  +-- contribution   owner: A   -> shared with B, so B sees this one
  |
  grants are the existing homeowner-share contract:
  a manifest of contributions, bound by an authorization and a consent
```

That last line matters: **the share contract already built is the access layer
for this.** A grant is an authorization receipt plus a consent receipt over a
manifest of contributions. Nothing in `homeowner-share.v1.ts` needs to be
undone. What is new is the store underneath it.

## 2. What this changes

| | Before | Now |
|---|---|---|
| Homesrolo storage | holds nothing | holds the home file |
| Property identity | deliberately absent in V1 | **required** |
| Homeowner view | only what was shared | what they own, **plus** what was shared |
| Persistence | view ends with the share | contributions persist; access is what ends |

The visibility rule in code has been updated to two doors — what you own, and
what was shared with you — with no third door. The "no browse, no catalog of
another party's contributions, nothing derived on top" constraint survives
intact and still applies to the home file itself.

## 3. Property identity: the highest-severity problem here

A permanent per-property record requires deciding what "the same property" means,
and that decision is now unavoidable. **This is the worst failure mode in the
system**: a wrong match shows one household another household's home.

Addresses are hostile to this. Units and sub-addresses, hyphenated ranges, new
construction that predates its address, subdivided and merged parcels, rural
routes, PO boxes, renamed streets, annexations, and simple typos all produce
either false merges or false splits.

Requirements, in priority order:

1. **A merge is never silent.** Anything short of an exact, verified match
   requires human confirmation before two records join.
2. **Merges are recorded, not destructive.** A merge must be an event in the
   history, so a wrong one can be split back apart. A destructive merge of two
   households' records is unrecoverable and is a disclosure incident.
3. **Never auto-merge on a fuzzy signal.** Not geocode proximity, not
   normalized-string similarity, not owner-name match.
4. **A split is always available.** If a file was wrongly joined, splitting must
   restore both sides to their pre-merge contents.

Cheap mitigation worth taking: authority to write into a home file should come
from something stronger than typing an address — a Jobrolo job at that property,
a verified parcel identifier, or a confirmed mail/utility check.

## 4. Permanence versus deletion rights, and how to have both

"The main home's file never gets lost" cannot be absolute for **personal** data.
Texas's Data Privacy and Security Act (in effect since July 2024) and comparable
state laws give consumers deletion rights over personal data, and a record keyed
to someone's home is arguably personal data about whoever lives there.

**The resolution is the one Carfax uses: separate property facts from person
facts.**

- **Property facts persist.** Roof replaced in 2024, 30-year architectural
  shingle, measurements, a hail event on a date, a permit. None of this is about
  a named person.
- **Person data is deletable.** Names, phone numbers, emails, account identity.
  These live in the account layer, never inside a contribution.
- **A contribution carries an opaque owner reference, not an identity.**
  Deleting an account severs the link and tombstones the ownership. The
  contribution stays in the home file; nobody inherits access to it.

A Carfax record is durable precisely because it is about a VIN, not about a
person. The same discipline is what makes a permanent home file lawful and
survivable. **Design it in from the start** — retrofitting a person/property
split onto a store that mixed them is close to impossible.

## 5. The regulatory question that changes the regime

**A permanent per-property loss and repair history, consulted by insurers or by
buyers, is the same shape as LexisNexis C.L.U.E. and Verisk A-PLUS.** Those are
property loss-history databases, and they operate as consumer reporting agencies
under the Fair Credit Reporting Act.

If a Homesrolo home file is used in insurance underwriting or pricing, or in
tenant or buyer decisions, FCRA obligations may attach: accuracy requirements, a
dispute and correction process, adverse-action notices, and permissible-purpose
limits on who may pull a file.

**This is not a reason not to build it.** Those databases exist and are lawful,
and being the honest version of one is a real business. It is a reason to decide
deliberately and now, for two concrete reasons:

1. **A dispute-and-correction mechanism has to be designed in, not bolted on.**
   If a home file says something wrong — damage attributed to the wrong storm, a
   repair recorded that never happened, a claim that was withdrawn — the
   affected party needs a route to contest and correct it. That is a product
   surface, a data model, and an audit trail, and it is far cheaper before
   launch than after.
2. **It determines who may read a file.** "Anyone with the address" and
   "permissible purpose only" are different products.

**Take this to counsel specifically.** The review already obtained covered the
constitution: education, not advocacy, in what Homesrolo *says*. This is a
different question about what Homesrolo *keeps and furnishes*, and it is the
larger regulatory exposure of the two.

## 6. Decisions needed before this is built

These are product decisions, not engineering ones, and each changes the schema.

1. **A contractor uploads roof photos. Does the homeowner see them
   automatically, or only on grant?** Homeowners expect to see photos of their
   own house. Contractors expect to control their work product. Both
   expectations are reasonable and they collide. A defensible middle: the
   homeowner always sees that a contribution *exists* and who owns it, and sees
   the contents only on grant.
2. **The home sells. Does the file follow the property, and what does the new
   owner see?** This is the Carfax question and the whole value proposition. It
   is also where the FCRA exposure is sharpest, because it is a disclosure about
   a home that affects a purchase decision.
3. **A homeowner moves out. Do they keep access to what they uploaded?** Under
   "the uploader owns it", yes — which means a former owner retains a view into
   a home someone else now lives in. That needs an explicit answer.
4. **A contractor leaves the platform.** Their contributions stay in the home
   file, per permanence. Confirm they understand that at upload time.
5. **Can an owner delete their own contribution, or only revoke access?**
   "Never gets lost" implies revoke-only. If so, say it plainly in the upload
   flow — "delete" that does not delete is exactly the misreading that turns
   into a complaint.

## 7. What does not change

- No claim advice, ever. The constitution is untouched by any of this.
- Excluded types stay excluded. Policies, carrier communications, and
  claim-strategy material do not become shareable because there is now a place
  to put them.
- No third door. What you own, and what was shared with you.
- Thresher stays internal to Jobrolo, and no tenant is its identity.
- Structural validation still proves nothing about signatures or live state.
