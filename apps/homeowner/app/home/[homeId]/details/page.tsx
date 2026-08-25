'use client'

import Link from 'next/link'
import { use, useRef, useState, type FormEvent } from 'react'
import { ErrorState, Skeleton } from '../../../../components/states.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { commandRefForAttempt } from '../../../../lib/port/command-ref.ts'
import { usePort } from '../../../../lib/port/provider.tsx'
import type {
  HomeRecordProfile,
  HomeSystemKind,
  ServerHomeView,
} from '../../../../lib/port/types.ts'

const SYSTEMS: readonly { readonly kind: HomeSystemKind; readonly label: string }[] = [
  { kind: 'roof', label: 'Roof' },
  { kind: 'heating', label: 'Heating' },
  { kind: 'cooling', label: 'Cooling' },
  { kind: 'water_heater', label: 'Water heater' },
  { kind: 'gutters', label: 'Gutters' },
  { kind: 'foundation', label: 'Foundation' },
]

type SystemDraft = {
  readonly present: 'yes' | 'no' | 'unknown'
  readonly year: string
  readonly approximate: boolean
}

type DetailsDraft = {
  readonly line1: string
  readonly line2: string
  readonly city: string
  readonly regionCode: string
  readonly postalCode: string
  readonly homeType: HomeRecordProfile['homeType']
  readonly yearBuilt: string
  readonly yearBuiltApproximate: boolean
  readonly systems: Readonly<Record<HomeSystemKind, SystemDraft>>
}

type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'error'; readonly error: string }

function emptyProfile(homeRef: string, updatedAt: string): HomeRecordProfile {
  return {
    homeRef,
    revision: 1,
    address: null,
    homeType: 'unknown',
    yearBuilt: null,
    systems: SYSTEMS.map(system => ({
      kind: system.kind,
      present: 'unknown',
      installedOrReplacedYear: null,
    })),
    source: 'homeowner_recollection',
    updatedAt,
  }
}

function draftFromProfile(profile: HomeRecordProfile): DetailsDraft {
  return {
    line1: profile.address?.line1 ?? '',
    line2: profile.address?.line2 ?? '',
    city: profile.address?.city ?? '',
    regionCode: profile.address?.regionCode ?? '',
    postalCode: profile.address?.postalCode ?? '',
    homeType: profile.homeType,
    yearBuilt: profile.yearBuilt ? String(profile.yearBuilt.value) : '',
    yearBuiltApproximate: profile.yearBuilt?.precision === 'approximate',
    systems: Object.fromEntries(SYSTEMS.map(({ kind }) => {
      const saved = profile.systems.find(system => system.kind === kind)
      return [kind, {
        present: saved?.present ?? 'unknown',
        year: saved?.installedOrReplacedYear
          ? String(saved.installedOrReplacedYear.value)
          : '',
        approximate: saved?.installedOrReplacedYear?.precision === 'approximate',
      }]
    })) as Record<HomeSystemKind, SystemDraft>,
  }
}

function validYear(value: string, currentYear: number): boolean {
  if (!value) return true
  const year = Number(value)
  return Number.isInteger(year) && year >= 1800 && year <= currentYear
}

function HomeDetailsForm({ home }: { readonly home: ServerHomeView }) {
  const port = usePort()
  const initial = home.homeRecord ?? emptyProfile(home.homeRef, home.updatedAt)
  const [profile, setProfile] = useState(initial)
  const [draft, setDraft] = useState(() => draftFromProfile(initial))
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [validation, setValidation] = useState<string | null>(null)
  const attemptRef = useRef<string | null>(null)
  const currentYear = new Date().getFullYear()

  function changed(next: DetailsDraft) {
    attemptRef.current = null
    setDraft(next)
    setValidation(null)
    if (save.kind !== 'saving') setSave({ kind: 'idle' })
  }

  function updateSystem(kind: HomeSystemKind, patch: Partial<SystemDraft>) {
    changed({
      ...draft,
      systems: {
        ...draft.systems,
        [kind]: { ...draft.systems[kind], ...patch },
      },
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const line1 = draft.line1.trim()
    const line2 = draft.line2.trim()
    const city = draft.city.trim()
    const regionCode = draft.regionCode.trim().toUpperCase()
    const postalCode = draft.postalCode.trim()
    if (!line1 || !city || !/^[A-Z]{2}$/.test(regionCode)
      || !/^\d{5}(?:-\d{4})?$/.test(postalCode)) {
      setValidation('Add a street address, city, two-letter state, and five-digit ZIP code.')
      return
    }
    if (!validYear(draft.yearBuilt, currentYear)
      || SYSTEMS.some(({ kind }) => !validYear(draft.systems[kind].year, currentYear))) {
      setValidation(`Use a year from 1800 through ${currentYear}, or leave it blank.`)
      return
    }

    const commandRef = commandRefForAttempt(attemptRef.current)
    attemptRef.current = commandRef
    setSave({ kind: 'saving' })
    const result = await port.updateHomeRecord(home.homeRef, {
      commandRef,
      expectedRevision: profile.revision,
      address: {
        line1,
        line2: line2 || null,
        city,
        regionCode,
        postalCode,
        countryCode: 'US',
      },
      homeType: draft.homeType,
      yearBuilt: draft.yearBuilt ? {
        value: Number(draft.yearBuilt),
        precision: draft.yearBuiltApproximate ? 'approximate' : 'exact',
      } : null,
      systems: SYSTEMS.map(({ kind }) => {
        const system = draft.systems[kind]
        return {
          kind,
          present: system.present,
          installedOrReplacedYear: system.present === 'yes' && system.year ? {
            value: Number(system.year),
            precision: system.approximate ? 'approximate' as const : 'exact' as const,
          } : null,
        }
      }),
    })
    if (!result.ok) {
      if (result.error === 'conflict') attemptRef.current = null
      setSave({
        kind: 'error',
        error: result.error === 'conflict'
          ? 'This Home Record changed in another tab. Reload it before saving again.'
          : 'Those details were not saved. Your entries are still here—try again.',
      })
      return
    }
    attemptRef.current = null
    setProfile(result.value)
    setDraft(draftFromProfile(result.value))
    setSave({ kind: 'saved' })
  }

  return (
    <form className="home-details-form" onSubmit={submit} noValidate>
      <section className="home-details-form__section" aria-labelledby="address-title">
        <header>
          <h2 id="address-title">Property address</h2>
          <p>This address is private to the signed-in Home Record.</p>
        </header>
        <div className="home-details-form__fields">
          <div className="field home-details-form__field--wide">
            <label htmlFor="record-address-line-1">Street address</label>
            <input id="record-address-line-1" value={draft.line1} maxLength={120}
              autoComplete="address-line1" placeholder="123 Main Street" required
              onChange={event => changed({ ...draft, line1: event.target.value })} />
          </div>
          <div className="field home-details-form__field--wide">
            <label htmlFor="record-address-line-2">Unit, suite, or building</label>
            <input id="record-address-line-2" value={draft.line2} maxLength={120}
              autoComplete="address-line2" placeholder="Optional"
              onChange={event => changed({ ...draft, line2: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="record-address-city">City</label>
            <input id="record-address-city" value={draft.city} maxLength={80}
              autoComplete="address-level2" required
              onChange={event => changed({ ...draft, city: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="record-address-region">State</label>
            <input id="record-address-region" value={draft.regionCode} maxLength={2}
              autoCapitalize="characters" autoComplete="address-level1" placeholder="TX" required
              onChange={event => changed({ ...draft, regionCode: event.target.value.toUpperCase() })} />
          </div>
          <div className="field">
            <label htmlFor="record-address-postal">ZIP code</label>
            <input id="record-address-postal" value={draft.postalCode} maxLength={10}
              inputMode="numeric" autoComplete="postal-code" placeholder="75001" required
              onChange={event => changed({ ...draft, postalCode: event.target.value })} />
          </div>
        </div>
      </section>

      <section className="home-details-form__section" aria-labelledby="facts-title">
        <header>
          <h2 id="facts-title">Home facts</h2>
          <p>Record what you know. “Not sure” is better than a guess.</p>
        </header>
        <div className="home-details-form__fields">
          <div className="field">
            <label htmlFor="record-home-type">Home type</label>
            <select id="record-home-type" value={draft.homeType}
              onChange={event => changed({
                ...draft,
                homeType: event.target.value as DetailsDraft['homeType'],
              })}>
              <option value="unknown">Not sure</option>
              <option value="house">House</option>
              <option value="townhouse">Townhouse</option>
              <option value="condo">Condo</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="record-year-built">Year built</label>
            <input id="record-year-built" type="number" inputMode="numeric"
              min={1800} max={currentYear} value={draft.yearBuilt} placeholder="Unknown"
              onChange={event => changed({
                ...draft,
                yearBuilt: event.target.value,
                yearBuiltApproximate: event.target.value ? draft.yearBuiltApproximate : false,
              })} />
            {draft.yearBuilt ? (
              <label className="setup-check">
                <input type="checkbox" checked={draft.yearBuiltApproximate}
                  onChange={event => changed({ ...draft, yearBuiltApproximate: event.target.checked })} />
                This year is approximate
              </label>
            ) : null}
          </div>
        </div>
      </section>

      <section className="home-details-form__section" aria-labelledby="systems-title">
        <header>
          <h2 id="systems-title">Major systems</h2>
          <p>Save a replacement year only when that system is present.</p>
        </header>
        <div className="home-details-form__systems">
          {SYSTEMS.map(({ kind, label }) => {
            const system = draft.systems[kind]
            return (
              <div className="home-system-editor" key={kind}>
                <strong>{label}</strong>
                <div className="field">
                  <label htmlFor={`record-system-${kind}`}>Status</label>
                  <select id={`record-system-${kind}`} value={system.present}
                    onChange={event => {
                      const present = event.target.value as SystemDraft['present']
                      updateSystem(kind, present === 'yes'
                        ? { present }
                        : { present, year: '', approximate: false })
                    }}>
                    <option value="unknown">Not sure</option>
                    <option value="yes">Present</option>
                    <option value="no">Not present</option>
                  </select>
                </div>
                {system.present === 'yes' ? (
                  <div className="field">
                    <label htmlFor={`record-system-${kind}-year`}>Installed or replaced</label>
                    <input id={`record-system-${kind}-year`} type="number" inputMode="numeric"
                      min={1800} max={currentYear} value={system.year} placeholder="Unknown"
                      onChange={event => updateSystem(kind, {
                        year: event.target.value,
                        approximate: event.target.value ? system.approximate : false,
                      })} />
                    {system.year ? (
                      <label className="setup-check">
                        <input type="checkbox" checked={system.approximate}
                          onChange={event => updateSystem(kind, { approximate: event.target.checked })} />
                        This year is approximate
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      <p className="home-details-form__boundary">
        These are your recollections. Saving them does not verify ownership, condition, value, code compliance, or insurance coverage.
      </p>
      {validation ? <p className="intake__error" role="alert">{validation}</p> : null}
      {save.kind === 'error' ? <p className="intake__error" role="alert">{save.error}</p> : null}
      {save.kind === 'saved' ? <p className="artifact-uploader__success" role="status">Home details saved.</p> : null}
      <div className="home-details-form__actions">
        <button className="btn btn--primary" type="submit" disabled={save.kind === 'saving'}>
          {save.kind === 'saving' ? 'Saving…' : 'Save home details'}
        </button>
        <Link className="btn btn--quiet" href={`/home/${home.homeRef}`}>Back to Home Record</Link>
      </div>
    </form>
  )
}

export default function HomeDetailsPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const port = usePort()
  const home = usePortCall(() => port.getHome(homeId))

  if (home.state.status === 'loading') {
    return <div className="panel"><Skeleton lines={7} label="Opening home details" /></div>
  }
  if (home.state.status === 'error') return <ErrorState retry={home.retry} error={home.state.error} />
  if (home.state.status !== 'ready') return null
  if (home.state.value.source !== 'server') {
    return <ErrorState retry={home.retry} error="unavailable" />
  }

  return (
    <div className="home-details-page">
      <Link className="backlink" href={`/home/${homeId}`}>← Home Record</Link>
      <header className="home-details-lead">
        <p className="record-kicker">Private Home Record</p>
        <h1>Home details</h1>
        <p>Keep the address, basic facts, and major systems attached to this home’s history.</p>
      </header>
      <HomeDetailsForm home={home.state.value} />
    </div>
  )
}
