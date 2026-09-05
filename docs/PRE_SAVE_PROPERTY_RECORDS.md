# Pre-save public property records

This is a deterministic, property-only onboarding lookup, separate from the
default-off AI home-research foundation. It performs no AI extraction, listing
scraping, ownership verification, or home creation.

## Experience and coverage

After reviewing a US address, a signed-in homeowner can choose **Find public
home details**. The adjacent notice explains that the address will be sent to
the US Census Geocoder and the supported county service. Nothing is looked up
until that explicit action. Nothing is saved until **Create my home**.

The Census match determines the county, rather than guessing from the city.
The first connected county is **Tarrant County, Texas (48439)**. Its official
parcel feed can supply living area, year built, land area, garage capacity,
central heat/air indicators, subdivision and parcel/reference date. Coverage
is not nationwide. Tarrant's retired bedroom/bathroom fields are not used;
bedrooms, bathrooms and rooms remain Unknown unless entered by the homeowner.
Unknown does not mean zero. We do not infer roof age, condition, dimensions,
occupancy, repair needs, ownership, value, taxes, insurance or permit compliance.

An exact corroborated address match is required. Ambiguous results are never
selected automatically. Units are currently unsupported and cannot be attached
to a building-wide record. A missing match, unsupported county or unavailable
service has a manual-entry/skip path and cannot block creating a home without
public facts.

## Sources

- [US Census Geocoder API](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html)
- [Tarrant County production parcel layer](https://mapit.tarrantcounty.com/arcgis/rest/services/Dynamic/TADParcels/FeatureServer/0)
- [TAD data distribution dictionary](https://www.tad.org/content/forms/PropertyData%26PropertyLocationLayouts.pdf)
- [County appraisal information and disclaimer](https://www.tarrantcountytx.gov/en/tax/property-tax/appraisal-district-contact-information.html)

The provider requests an explicit allowlist of property/address fields. It does
not request owners, mailing addresses, phone/email, exemptions or financial
values. The displayed record date is the appraisal date, not a freshness claim;
the actual retrieval timestamp is stored separately. Official records can lag
changes to a house and are informational references, not verified conditions.

## Auth, privacy and provenance

- `POST /api/v1/property-research`: authenticated session, exact browser Origin
  or the existing native bearer channel, strict consent/body schema. Fixed
  official HTTPS endpoints, no redirects, 96 KiB response limit, six-second
  deadline per upstream request; no caller-selected URL or arbitrary query.
- A shared atomic Postgres limiter allows eight lookups per principal and
  1,000 globally per ten minutes. It retains only opaque principal IDs/counters,
  never the draft address or result. Failure denies provider calls.
- Draft addresses, facts and receipts remain in component memory, bound to the
  signed-in principal and exact reviewed address. Changed input/account and
  stale responses cannot cross that boundary. No draft address is persisted by
  the lookup endpoint. Government services necessarily receive the lookup
  address and apply their own operational logging policies.
- A server HMAC attests the matched source facts and binds them to the principal
  and exact address. The key is domain-separated from the existing server HMAC
  root. A receipt is not a login, ownership proof, or sharing grant. It is not
  logged, placed in URLs or saved. Its original retrieval date stays visible;
  it has no authorization-bearing expiry that could break an uncertain save
  retry. Secret rotation invalidates outstanding drafts, not saved snapshots.
- `POST /api/v1/homes/{homeRef}/property`: separate explicit reviewed initial
  snapshot, only after the home/address exist. Database checks current verified
  principal, controller membership and exact home/address under transaction
  locks, before replay. One stable command and digest are retry-safe. A second
  distinct snapshot conflicts instead of overwriting. Homeowner corrections
  are stored separately from the original attested public values; manually
  entered facts with no lookup carry no public provenance.
- A partial home-create/property-save failure keeps the frozen review and
  command for an explicit in-place retry and warns before leaving. Reloading
  discards unsaved drafts (not the already-created home). A Home admin can
  repeat lookup/review from Home Details and explicitly save the missing
  initial snapshot; existing snapshots cannot be overwritten there.
- `GET` on that path is limited to the exact-home controller or adult member;
  children/viewers and invited professionals have no access. No broad/public
  property projection is added. If the Home Record address changes later, the
  snapshot keeps its original address; the UI hides its facts and explains the
  mismatch rather than offering an impossible second initial save.
  Existing home-record v1 responses stay exact
  for cached clients; this additive endpoint does not relabel public facts as
  homeowner recollection or change Rolo's existing context boundary.

## Deployment

Apply `202609050003_home_property_research.sql` and verify service-role-only
RPC grants and private RLS tables before enabling
`HOMESROLO_PROPERTY_RECORDS_ENABLED=true` on the server. Existing validated
Supabase configuration and the server HMAC root are required; no new paid
provider or API key is needed. Missing configuration fails closed. Turning the
flag off stops lookup/snapshot routes without changing sign-in or core home
creation. New clients must tolerate unavailable lookup and saved details.

Broader county adapters and any licensed nationwide data source need their own
matching, provenance, privacy, licensing and coverage review before activation.
