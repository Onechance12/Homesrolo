import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native'
import type { HomeRecordAddress, PropertyLookupResult } from '../api/model.ts'
import { friendlyError } from '../api/errors.ts'
import { useSession } from '../auth/SessionProvider.tsx'
import { Button, Card, Chip, Eyebrow, TextField } from './ui.tsx'
import {
  PROPERTY_NUMBERS, PropertyLookupDraftGate, propertyDraft, reviewPropertyDraft,
  type PropertyDraft, type PropertyReviewSelection,
} from '../home/property-review.ts'
import { colors, space } from '../theme.ts'

const LOOKUP_STATUS = {
  no_match: 'No exact public property match was found. You can enter what you know or skip these details.',
  ambiguous: 'More than one property could match. We haven’t selected one or filled in facts. Check the address, enter details yourself, or skip.',
  unsupported: 'Public property lookup currently covers Tarrant County, Texas only. You can enter known details yourself or skip.',
  unavailable: 'Public records couldn’t be reached right now. Try again, enter known details, or skip.',
} as const

export function PropertyDetailsReview({ principalRef, address, disabled, onChange, context = 'new-home' }: {
  readonly principalRef: string
  readonly address: HomeRecordAddress
  readonly disabled: boolean
  readonly onChange: (selection: PropertyReviewSelection) => void
  readonly context?: 'new-home' | 'home-record'
}) {
  const { api, privateContentVisible } = useSession()
  const gate = useMemo(() => new PropertyLookupDraftGate(principalRef, address), [principalRef, address])
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [result, setResult] = useState<PropertyLookupResult | null>(null)
  const [draft, setDraft] = useState<PropertyDraft>(() => propertyDraft())
  const [message, setMessage] = useState<string | null>(null)
  const canSave = typeof api.saveHomeProperty === 'function'

  useEffect(() => () => gate.discard(), [gate])

  async function lookup() {
    if (disabled || loading || !privateContentVisible) return
    if (!api.lookupProperty || !canSave) {
      setMessage(context === 'new-home'
        ? 'Public home details aren’t available on this version. You can create your home without them.'
        : 'Public lookup isn’t available on this version. You can enter known details yourself or leave them unknown.')
      return
    }
    const ticket = gate.begin()
    setLoading(true)
    setMessage(null)
    onChange({ kind: 'pending' })
    try {
      const next = await api.lookupProperty(address)
      if (!gate.current(ticket) || disabledRef.current) return
      if (next.lookup.status !== 'matched' && editing) {
        setMessage(`${LOOKUP_STATUS[next.lookup.status]} Your previously reviewed details below are unchanged.`)
        onChange(reviewPropertyDraft(draft, result?.receipt ?? null))
        return
      }
      setResult(next)
      const nextDraft = propertyDraft(next.lookup.facts)
      setDraft(nextDraft)
      setEditing(true)
      onChange(reviewPropertyDraft(nextDraft, next.receipt))
      if (next.lookup.status !== 'matched') setMessage(LOOKUP_STATUS[next.lookup.status])
    } catch (error) {
      if (!gate.current(ticket) || disabledRef.current) return
      setMessage(`${friendlyError(error)} ${context === 'new-home'
        ? 'You can skip the lookup and still create your home.'
        : 'You can skip the lookup and leave these details unknown.'}`)
      onChange(reviewPropertyDraft(draft, result?.receipt ?? null))
    } finally {
      if (gate.current(ticket)) setLoading(false)
    }
  }

  function skip() {
    if (disabled) return
    gate.discard()
    setLoading(false)
    setEditing(false)
    setResult(null)
    setDraft(propertyDraft())
    setMessage('Skipped. Your home can be created without public-record details.')
    onChange({ kind: 'none' })
  }
  function enterManually() {
    if (disabled || loading || !canSave) return
    gate.discard()
    setResult(null)
    setDraft(propertyDraft())
    setEditing(true)
    setMessage(null)
    onChange({ kind: 'none' })
  }
  function edit(patch: Partial<PropertyDraft>) {
    if (disabled || loading) return
    const next = { ...draft, ...patch }
    setDraft(next)
    const selection = reviewPropertyDraft(next, result?.receipt ?? null)
    onChange(selection)
    setMessage(selection.kind === 'invalid' ? selection.message : null)
  }

  return (
    <Card style={styles.card}>
      <Eyebrow>Optional · before you save</Eyebrow>
      <Text accessibilityRole="header" style={styles.title}>Find public home details</Text>
      <Text style={styles.body}>With your permission, we’ll send this address to the U.S. Census address service and the county’s public property service. Current property coverage: Tarrant County, Texas.</Text>
      <Text style={styles.small}>{context === 'new-home' ? 'No home is created by a lookup.' : 'A lookup does not change your saved home details.'} Public records can be incomplete or outdated, and do not verify ownership or condition.</Text>
      {loading ? (
        <View accessibilityLiveRegion="polite" style={styles.loading}><ActivityIndicator color={colors.lime} /><Text style={styles.body}>Checking the address and public property record…</Text></View>
      ) : <Button label={result ? 'Look up this address again' : 'Find public home details'} icon="search-outline" disabled={disabled || !canSave} onPress={() => void lookup()} accessibilityHint="Sends only this reviewed address to the Census and county property services" />}
      {!canSave ? <Text style={styles.small}>This version can still create your home without extra property details.</Text> : null}
      {result?.lookup.status === 'matched' ? (
        <View style={styles.source}>
          <Text style={styles.sourceTitle}>Public record match — please check it</Text>
          <Text style={styles.body}>{result.lookup.matchedAddress}</Text>
          <Text style={styles.small}>{result.lookup.source?.title} · Parcel {result.lookup.source?.parcelId}</Text>
          <Text style={styles.small}>Retrieved {new Date(result.lookup.retrievedAt).toLocaleDateString()}{result.lookup.source?.recordDate ? ` · Record date ${result.lookup.source.recordDate}` : ' · Record date not supplied'}</Text>
          {result.lookup.notes.map((note, index) => <Text key={index} style={styles.small}>{note}</Text>)}
          <Button label="View public data source" quiet disabled={disabled} onPress={() => { if (result.lookup.source) void Linking.openURL(result.lookup.source.url).catch(() => setMessage('The source page could not open on this device.')) }} />
        </View>
      ) : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
      {editing ? (
        <>
          <Text style={styles.sourceTitle}>Review or correct these details</Text>
          <Text style={styles.small}>Blank means Unknown. Don’t guess total rooms from bedrooms. Your edits will be saved as your reviewed details; the original public result stays separate.</Text>
          <View style={styles.fields}>
            {PROPERTY_NUMBERS.map(([key, label]) => <View key={key} style={styles.field}><TextField label={label} value={draft[key]} onChangeText={value => edit({ [key]: value })} editable={!disabled && !loading} placeholder="Unknown" keyboardType={key === 'bathrooms' || key === 'lotSquareFeet' ? 'decimal-pad' : 'number-pad'} maxLength={16} /></View>)}
          </View>
          {(['centralHeat', 'centralAir'] as const).map(key => (
            <View key={key} style={styles.boolean}>
              <Text style={styles.body}>{key === 'centralHeat' ? 'Central heat' : 'Central air'}</Text>
              <View style={styles.chips}>{[['', 'Unknown'], ['yes', 'Yes'], ['no', 'No']].map(([value, label]) => <Chip key={value} label={label!} selected={draft[key] === value} disabled={disabled || loading} onPress={() => edit({ [key]: value })} />)}</View>
            </View>
          ))}
          <TextField label="Subdivision" value={draft.subdivision} onChangeText={subdivision => edit({ subdivision })} editable={!disabled && !loading} placeholder="Unknown" maxLength={160} />
          <Text style={styles.small}>{context === 'new-home'
            ? 'These details are saved only when you select Create my home below.'
            : 'These details are saved only when you select Save reviewed property details below.'}</Text>
        </>
      ) : canSave && !loading ? <Button label="Enter known details myself" quiet disabled={disabled} onPress={enterManually} /> : null}
      <Button label={editing || loading ? 'Skip public details' : 'Skip lookup — keep my details unknown'} quiet disabled={disabled} onPress={skip} />
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { padding: space.lg, gap: space.md },
  title: { color: colors.cream, fontSize: 21, lineHeight: 27, fontWeight: '800' },
  body: { color: colors.slate, fontSize: 13, lineHeight: 20 },
  small: { color: colors.smoke, fontSize: 12, lineHeight: 18 },
  loading: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  source: { borderLeftWidth: 2, borderLeftColor: colors.lime, paddingLeft: space.md, gap: 7 },
  sourceTitle: { color: colors.cream, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  message: { color: colors.warning, fontSize: 13, lineHeight: 20 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  field: { flexGrow: 1, flexBasis: 140, minWidth: 120 },
  boolean: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
