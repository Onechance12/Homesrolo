import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { HomeRecordProfile, HomeSystemKind, HomeType } from '../../../src/api/model.ts'
import { NativeApiError } from '../../../src/api/client.ts'
import { friendlyError } from '../../../src/api/errors.ts'
import { HOME_SYSTEM_KINDS, HOME_TYPES } from '../../../src/api/home-record.ts'
import { isCurrentHouseholdController } from '../../../src/api/household.ts'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { Button, Card, Chip, Loading, Notice, Page, SectionTitle, TextField } from '../../../src/components/ui.tsx'
import { useHomeId } from '../../../src/home/HomeRouteProvider.tsx'
import {
  detailsDraft,
  homeDetailsUpdate,
  type HomeDetailsDraft,
  type HomeSystemDraft,
} from '../../../src/home/details.ts'
import { useResource } from '../../../src/hooks/useResource.ts'
import { colors, radius, space } from '../../../src/theme.ts'

const HOME_TYPE_LABEL: Readonly<Record<HomeType, string>> = {
  unknown: 'Not sure', house: 'House', townhouse: 'Townhouse', condo: 'Condo', other: 'Other',
}
const SYSTEM_LABEL: Readonly<Record<HomeSystemKind, string>> = {
  roof: 'Roof', heating: 'Heating', cooling: 'Cooling', water_heater: 'Water heater',
  gutters: 'Gutters', foundation: 'Foundation',
}

export default function HomeDetailsScreen() {
  const homeId = useHomeId()
  const { state: auth, api, refreshSession } = useSession()
  const resource = useResource(useCallback(async () => {
    const [profile, household] = await Promise.all([
      api.getHomeRecord(homeId),
      api.getHousehold(homeId).catch(() => null),
    ])
    return {
      profile,
      canEdit: household !== null && isCurrentHouseholdController(household.members),
    }
  }, [api, homeId]), auth.kind === 'signed_in')
  const [editing, setEditing] = useState<{ readonly revision: number; readonly draft: HomeDetailsDraft } | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [conflicted, setConflicted] = useState(false)
  const [saved, setSaved] = useState(false)
  const actionGeneration = useRef(0)

  useEffect(() => {
    actionGeneration.current += 1
    setEditing(null)
    setSaving(false)
    setMessage(null)
    setConflicted(false)
    setSaved(false)
    return () => { actionGeneration.current += 1 }
  }, [homeId])

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'error') return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  if (resource.state.kind === 'loading') return <Loading label="Opening home details…" />
  if (resource.state.kind === 'error') {
    return (
      <Page>
        <HomeHeader section="My Home" title="Home details" />
        <Notice message="Home details could not load right now." />
        <Button
          label="Back to My Home"
          accessibilityHint="Returns to the Home tab"
          quiet
          onPress={() => router.replace({ pathname: '/home/[homeId]/care', params: { homeId } })}
        />
      </Page>
    )
  }

  const { profile, canEdit } = resource.state.value
  const draft = editing?.revision === profile.revision ? editing.draft : detailsDraft(profile)
  const change = (next: HomeDetailsDraft) => {
    if (!canEdit) return
    setEditing({ revision: profile.revision, draft: next })
    setMessage(null)
    setConflicted(false)
    setSaved(false)
  }
  const updateSystem = (kind: HomeSystemKind, patch: Partial<HomeSystemDraft>) => change({
    ...draft,
    systems: { ...draft.systems, [kind]: { ...draft.systems[kind], ...patch } },
  })

  async function save() {
    if (!canEdit || saving) return
    const generation = actionGeneration.current
    setSaving(true)
    setMessage(null)
    setConflicted(false)
    setSaved(false)
    try {
      const commandRef = await api.newCommandRef()
      if (generation !== actionGeneration.current) return
      const update = homeDetailsUpdate(profile, draft, commandRef)
      if (!update.ok) {
        setMessage(update.message)
        return
      }
      const next = await api.updateHomeRecord(homeId, update.input)
      if (generation !== actionGeneration.current) return
      setEditing({ revision: next.revision, draft: detailsDraft(next) })
      setSaved(true)
      resource.reload()
    } catch (error) {
      if (generation === actionGeneration.current) {
        setConflicted(error instanceof NativeApiError && error.code === 'conflict')
        setMessage(friendlyError(error))
      }
    } finally {
      if (generation === actionGeneration.current) setSaving(false)
    }
  }

  return (
    <Page>
      <HomeHeader section="My Home" title="The basics" detail="Private facts that help this home remember what it is." />
      <BackButton label="My Home" onPress={() => router.replace({ pathname: '/home/[homeId]/care', params: { homeId } })} />
      {!canEdit ? <Notice message="Only a Home admin can change these details. You can still review the shared Home Record." /> : null}

      <SectionTitle title="Address" detail="This stays private unless you deliberately share it." />
      <Card>
        <TextField label="Street address" value={draft.line1} onChangeText={line1 => change({ ...draft, line1 })} editable={canEdit} autoComplete="street-address" />
        <TextField label="Unit or building" value={draft.line2} onChangeText={line2 => change({ ...draft, line2 })} editable={canEdit} placeholder="Optional" />
        <TextField label="City" value={draft.city} onChangeText={city => change({ ...draft, city })} editable={canEdit} />
        <View style={styles.fieldRow}>
          <TextField label="State" value={draft.regionCode} onChangeText={regionCode => change({ ...draft, regionCode: regionCode.toUpperCase().slice(0, 2) })} editable={canEdit} autoCapitalize="characters" style={styles.shortField} />
          <TextField label="ZIP" value={draft.postalCode} onChangeText={postalCode => change({ ...draft, postalCode })} editable={canEdit} keyboardType="number-pad" autoComplete="postal-code" style={styles.zipField} />
        </View>
      </Card>

      <SectionTitle title="About the home" detail="Save what you know. “Not sure” is a real answer." />
      <Card>
        <Text style={styles.label}>Home type</Text>
        <View style={styles.chips}>{HOME_TYPES.map(type => (
          <Chip key={type} label={HOME_TYPE_LABEL[type]} selected={draft.homeType === type} disabled={!canEdit} onPress={() => change({ ...draft, homeType: type })} />
        ))}</View>
        <TextField label="Year built" value={draft.yearBuilt} onChangeText={yearBuilt => change({ ...draft, yearBuilt, yearBuiltApproximate: yearBuilt ? draft.yearBuiltApproximate : false })} editable={canEdit} keyboardType="number-pad" placeholder="Leave blank if unknown" />
        {draft.yearBuilt ? (
          <Chip label={draft.yearBuiltApproximate ? 'Approximate year' : 'Exact year'} selected={draft.yearBuiltApproximate} disabled={!canEdit} onPress={() => change({ ...draft, yearBuiltApproximate: !draft.yearBuiltApproximate })} />
        ) : null}
      </Card>

      <SectionTitle title="Major systems" detail="A rough replacement year is useful. Guessing is not required." />
      {HOME_SYSTEM_KINDS.map(kind => {
        const system = draft.systems[kind]
        return (
          <Card key={kind}>
            <Text style={styles.systemTitle}>{SYSTEM_LABEL[kind]}</Text>
            <View style={styles.chips}>
              <Chip label="Here" selected={system.present === 'yes'} disabled={!canEdit} onPress={() => updateSystem(kind, { present: 'yes' })} />
              <Chip label="Not sure" selected={system.present === 'unknown'} disabled={!canEdit} onPress={() => updateSystem(kind, { present: 'unknown', year: '', approximate: false })} />
              <Chip label="Not in home" selected={system.present === 'no'} disabled={!canEdit} onPress={() => updateSystem(kind, { present: 'no', year: '', approximate: false })} />
            </View>
            {system.present === 'yes' ? (
              <>
                <TextField label="Installed or replaced" value={system.year} onChangeText={year => updateSystem(kind, { year, approximate: year ? system.approximate : false })} editable={canEdit} keyboardType="number-pad" placeholder="Year, if known" />
                {system.year ? <Chip label={system.approximate ? 'Approximate' : 'Exact'} selected={system.approximate} disabled={!canEdit} onPress={() => updateSystem(kind, { approximate: !system.approximate })} /> : null}
              </>
            ) : null}
          </Card>
        )
      })}

      {message ? (
        <Notice
          message={message}
          {...(conflicted ? {
            actionLabel: 'Load latest',
            onAction: () => {
              setEditing(null)
              setMessage(null)
              setConflicted(false)
              resource.reload()
            },
          } : {})}
        />
      ) : null}
      {saved ? <Notice message="Home details saved." /> : null}
      {canEdit ? <Button label={saving ? 'Saving…' : 'Save home details'} accessibilityHint="Saves these private facts to this home" icon="checkmark" disabled={saving} onPress={() => void save()} /> : null}
      <Text style={styles.boundary}>These are your notes about the home. Saving them does not verify condition, value, code compliance, or insurance coverage.</Text>
    </Page>
  )
}

function BackButton({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      accessibilityHint="Returns to the Home tab"
      onPress={onPress}
      style={({ pressed }) => [styles.back, pressed && styles.pressed]}
    >
      <Ionicons name="chevron-back" size={19} color={colors.lime} />
      <Text style={styles.backText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  back: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
  backText: { color: colors.lime, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.78 },
  label: { color: colors.slate, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldRow: { flexDirection: 'row', gap: space.sm },
  shortField: { minWidth: 88 },
  zipField: { minWidth: 140 },
  systemTitle: { color: colors.cream, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  boundary: { color: colors.smoke, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: space.md },
})
