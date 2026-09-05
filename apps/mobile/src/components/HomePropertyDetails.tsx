import { useCallback, useEffect, useRef, useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import type { HomeRecordAddress } from '../api/model.ts'
import { useSession } from '../auth/SessionProvider.tsx'
import { friendlyError } from '../api/errors.ts'
import { sameHomeRecordAddress } from '../home/onboarding.ts'
import { PROPERTY_NUMBERS, initialPropertySnapshotAttempt, type PropertyReviewSelection } from '../home/property-review.ts'
import { useResource } from '../hooks/useResource.ts'
import { Button, Card, Eyebrow, Notice } from './ui.tsx'
import { PropertyDetailsReview } from './PropertyDetailsReview.tsx'
import { colors, space } from '../theme.ts'

/** Saved reviewed facts are distinct from the immutable original public lookup. */
export function HomePropertyDetails({ homeRef, currentAddress, canEdit }: {
  readonly homeRef: string
  readonly currentAddress: HomeRecordAddress | null
  readonly canEdit: boolean
}) {
  const { state } = useSession()
  if (state.kind !== 'signed_in') return null
  return <ScopedHomePropertyDetails key={JSON.stringify([state.session.principalRef, homeRef, currentAddress])}
    principalRef={state.session.principalRef} homeRef={homeRef} currentAddress={currentAddress} canEdit={canEdit} />
}

function ScopedHomePropertyDetails({ principalRef, homeRef, currentAddress, canEdit }: {
  readonly principalRef: string
  readonly homeRef: string
  readonly currentAddress: HomeRecordAddress | null
  readonly canEdit: boolean
}) {
  const { api, privateContentVisible } = useSession()
  const supported = typeof api.getHomeProperty === 'function'
  const resource = useResource(useCallback(() => api.getHomeProperty!(homeRef), [api, homeRef]), supported)
  const [editing, setEditing] = useState(false)
  const [selection, setSelection] = useState<PropertyReviewSelection>({ kind: 'none' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  const busy = useRef(false)
  const attempt = useRef<ReturnType<typeof initialPropertySnapshotAttempt> | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  async function save() {
    if (!canEdit || !currentAddress || !privateContentVisible || busy.current || selection.kind !== 'reviewed'
      || resource.state.kind !== 'ready' || resource.state.value !== null) return
    busy.current = true
    setSaving(true)
    setError(null)
    attempt.current ??= initialPropertySnapshotAttempt(homeRef, currentAddress, selection.value)
    try {
      await attempt.current.run(api)
      if (!active.current) return
      setEditing(false)
      setSelection({ kind: 'none' })
      attempt.current = null
      resource.reload()
    } catch (caught) {
      if (active.current) setError(`${friendlyError(caught)} Your review is still here. Retry to finish saving it. Leaving or reloading discards this unsaved review.`)
    } finally {
      busy.current = false
      if (active.current) setSaving(false)
    }
  }
  if (!supported) return null
  if (resource.state.kind === 'loading') return <Card><Text style={styles.detail}>Opening reviewed property details…</Text></Card>
  if (resource.state.kind === 'error') return <Notice message="Reviewed property details could not load. The saved details have not been removed." actionLabel="Try again" onAction={resource.reload} />
  const snapshot = resource.state.value
  if (!snapshot) {
    if (!canEdit || !currentAddress || !api.saveHomeProperty) return null
    return editing ? (
      <View style={styles.editor}>
        <PropertyDetailsReview principalRef={principalRef} address={currentAddress} context="home-record"
          disabled={saving || attempt.current !== null} onChange={setSelection} />
        <Text style={styles.detail}>Saving adds the missing initial property snapshot. It does not change this home’s address or overwrite an existing snapshot.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.warning}>{error}</Text> : null}
        <Button label={saving ? 'Saving reviewed details…' : attempt.current ? 'Retry reviewed property details' : 'Save reviewed property details'}
          disabled={saving || selection.kind !== 'reviewed'} onPress={() => void save()} />
        {attempt.current ? <Text style={styles.warning}>Leaving this review discards the unsaved corrections. Retry here, or check the saved record before looking up and reviewing again.</Text> : null}
        <Button label={attempt.current ? 'Leave review and check saved details' : 'Cancel — keep details unknown'} quiet disabled={saving}
          onPress={() => { setEditing(false); setSelection({ kind: 'none' }); attempt.current = null; setError(null); resource.reload() }} />
      </View>
    ) : (
      <Card><Eyebrow>Property details</Eyebrow><Text style={styles.detail}>No reviewed property details are saved yet. You can look them up or enter what you know, then review before saving.</Text>
        <Button label="Add public home details" icon="search-outline" onPress={() => setEditing(true)} /></Card>
    )
  }
  const source = snapshot.lookup?.source
  if (!sameHomeRecordAddress(currentAddress, snapshot.address)) return (
    <Card><Eyebrow>Earlier property details</Eyebrow>
      <Text style={styles.warning}>The home address has changed. The earlier property facts are hidden to avoid applying them to the wrong place.</Text>
      <Text style={styles.detail}>Details reviewed for {snapshot.address.line1}{snapshot.address.line2 ? `, ${snapshot.address.line2}` : ''} · {snapshot.address.city}, {snapshot.address.regionCode} {snapshot.address.postalCode} on {new Date(snapshot.reviewedAt).toLocaleDateString()}.</Text>
    </Card>
  )
  return (
    <Card>
      <Eyebrow>Reviewed property details</Eyebrow>
      <Text style={styles.detail}>{source ? `${source.title} · reviewed and possibly corrected by you` : 'Entered and reviewed by you'}</Text>
      <Text style={styles.detail}>Reviewed {new Date(snapshot.reviewedAt).toLocaleDateString()}. Unknown means no fact was supplied; it is not a zero.</Text>
      <Text style={styles.detail}>Details reviewed for {snapshot.address.line1}{snapshot.address.line2 ? `, ${snapshot.address.line2}` : ''} · {snapshot.address.city}, {snapshot.address.regionCode} {snapshot.address.postalCode}.</Text>
      <View style={styles.facts}>
        {PROPERTY_NUMBERS.map(([key, label]) => <View key={key} style={styles.fact}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{snapshot.facts[key] === null ? 'Unknown' : snapshot.facts[key]!.toLocaleString()}</Text></View>)}
        {(['centralHeat', 'centralAir'] as const).map(key => <View key={key} style={styles.fact}><Text style={styles.label}>{key === 'centralHeat' ? 'Central heat' : 'Central air'}</Text><Text style={styles.value}>{snapshot.facts[key] === null ? 'Unknown' : snapshot.facts[key] ? 'Yes' : 'No'}</Text></View>)}
        <View style={styles.fact}><Text style={styles.label}>Subdivision</Text><Text style={styles.value}>{snapshot.facts.subdivision ?? 'Unknown'}</Text></View>
      </View>
      {source ? <><Text style={styles.detail}>Original source: parcel {source.parcelId} · retrieved {new Date(snapshot.lookup!.retrievedAt).toLocaleDateString()}. Public records are not ownership verification.</Text><Button label="View public data source" quiet onPress={() => { void Linking.openURL(source.url).catch(() => undefined) }} /></> : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  editor: { gap: space.md },
  detail: { color: colors.slate, fontSize: 12, lineHeight: 18 },
  warning: { color: colors.warning, fontSize: 13, lineHeight: 20 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  fact: { flexBasis: 140, flexGrow: 1, gap: 4 },
  label: { color: colors.smoke, fontSize: 12 },
  value: { color: colors.cream, fontSize: 15, lineHeight: 21, fontWeight: '700' },
})
