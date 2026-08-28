import { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Redirect, router } from 'expo-router'
import { useSession } from '../src/auth/SessionProvider.tsx'
import { useResource } from '../src/hooks/useResource.ts'
import {
  Body,
  Brand,
  Button,
  Card,
  Eyebrow,
  Loading,
  Notice,
  Page,
  SectionTitle,
} from '../src/components/ui.tsx'
import {
  clearWorkspacePreference,
  writeWorkspacePreference,
} from '../src/workspace/preference.ts'
import { replaceWorkspace } from '../src/workspace/navigation.ts'
import { colors, radius, space } from '../src/theme.ts'

export default function AccountScreen() {
  const { state: auth, api, signOut, refreshSession } = useSession()
  const professionalEnabled = auth.kind === 'signed_in'
    && auth.session.capabilities.invitations
    && auth.session.capabilities.projectQuotes
  const loader = useCallback(async () => {
    const [homes, professional] = await Promise.all([
      api.listHomes(),
      professionalEnabled
        ? api.getProfessionalProfile()
        : Promise.resolve({ organizations: [], memberships: [] }),
    ])
    return { homes, professional }
  }, [api, professionalEnabled])
  const resource = useResource(loader, auth.kind === 'signed_in')

  if (auth.kind === 'loading') return <Loading label="Opening your account…" />
  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }
  const principalRef = auth.session.principalRef

  async function openHome(homeRef: string) {
    await writeWorkspacePreference(principalRef, 'home')
    replaceWorkspace(router, { pathname: '/home/[homeId]', params: { homeId: homeRef } })
  }

  async function openPro() {
    await writeWorkspacePreference(principalRef, 'pro')
    replaceWorkspace(router, '/pro')
  }

  async function leave() {
    await clearWorkspacePreference(principalRef)
    await signOut()
  }

  const ready = resource.state.kind === 'ready' ? resource.state.value : null
  const hasHomes = (ready?.homes.length ?? 0) > 0
  const activeOrganizationRefs = new Set(
    ready?.professional.memberships
      .filter(membership => membership.state === 'active')
      .map(membership => membership.organizationRef) ?? [],
  )
  const activeOrganizations = ready?.professional.organizations.filter(organization => (
    activeOrganizationRefs.has(organization.organizationRef)
  )) ?? []
  const primaryOrganization = activeOrganizations[0] ?? null
  const hasPro = activeOrganizations.length > 0
  const hasBoth = hasHomes && hasPro

  return (
    <Page>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.roundButton}
        >
          <Ionicons name="arrow-back" size={21} color={colors.cream} />
        </Pressable>
        <Brand compact />
        <View style={styles.roundButtonPlaceholder} />
      </View>

      <View style={styles.intro}>
        <Eyebrow>Account</Eyebrow>
        <Text style={styles.title}>{hasBoth ? 'Switch spaces.' : 'Your Homesrolo.'}</Text>
        <Body muted>
          {hasBoth
            ? 'Your home and company stay separate. Choose the space you want to use.'
            : 'Manage the homes or company connected to this private sign-in.'}
        </Body>
      </View>

      {resource.state.kind === 'loading' ? <Loading label="Finding your spaces…" /> : null}
      {resource.state.kind === 'error' ? (
        <Notice message="Homesrolo could not load your account." actionLabel="Try again" onAction={resource.reload} />
      ) : null}

      {ready ? (
        <>
          {ready.homes.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle title="Homes" />
              {ready.homes.map(home => (
                <Pressable
                  key={home.homeRef}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${home.displayLabel}`}
                  onPress={() => void openHome(home.homeRef)}
                  style={({ pressed }) => [styles.workspaceCard, pressed && styles.pressed]}
                >
                  <View style={styles.homeIcon}><Ionicons name="home" size={21} color={colors.ink} /></View>
                  <View style={styles.flexCopy}>
                    <Text style={styles.workspaceTitle}>{home.displayLabel}</Text>
                    <Text numberOfLines={2} style={styles.workspaceDetail}>{home.privateLocationLabel}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.lime} />
                </Pressable>
              ))}
              <Button label="Add another home" icon="add" quiet onPress={() => router.push({ pathname: '/homes', params: { add: '1' } })} />
            </View>
          ) : (
            <Card>
              <SectionTitle title="Home" detail="No home is connected yet." />
              <Button label="Set up my home" icon="home-outline" onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'home' } })} />
            </Card>
          )}

          {activeOrganizations.length > 0 ? (
            <View style={styles.section}>
              <SectionTitle title="Company" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open Homesrolo Pro"
                onPress={() => void openPro()}
                style={({ pressed }) => [styles.workspaceCard, pressed && styles.pressed]}
              >
                <View style={styles.proIcon}><Ionicons name="briefcase" size={21} color={colors.ink} /></View>
                <View style={styles.flexCopy}>
                  <Text style={styles.workspaceTitle}>
                    {activeOrganizations.length === 1 ? primaryOrganization?.displayName : 'Homesrolo Pro'}
                  </Text>
                  <Text style={styles.workspaceDetail}>
                    {activeOrganizations.length > 1
                      ? `${activeOrganizations.length} company profiles in this workspace`
                      : primaryOrganization?.publicationState === 'published'
                        ? 'Listed for homeowners'
                        : 'Private company draft'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.aqua} />
              </Pressable>
            </View>
          ) : hasHomes && professionalEnabled ? (
            <Card>
              <SectionTitle title="Do you also run a home-service company?" detail="Company tools stay in a separate Pro space." />
              <Button label="Add a company workspace" icon="briefcase-outline" quiet onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'pro' } })} />
            </Card>
          ) : null}

          <Card>
            <SectionTitle title="Privacy and session" detail="Your home does not become a public profile when you use Homesrolo." />
            <Button label="Sign out" icon="log-out-outline" quiet onPress={() => void leave()} />
          </Card>
        </>
      ) : null}
    </Page>
  )
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundButton: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.inkRaised,
  },
  roundButtonPlaceholder: { width: 44, height: 44 },
  intro: { gap: space.sm, paddingVertical: space.md },
  title: { color: colors.cream, fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -0.9 },
  section: { gap: space.sm },
  workspaceCard: {
    minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: radius.large, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkRaised, padding: space.md,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  homeIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime },
  proIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.aqua },
  flexCopy: { flex: 1, gap: 3 },
  workspaceTitle: { color: colors.cream, fontSize: 17, fontWeight: '900' },
  workspaceDetail: { color: colors.slate, fontSize: 12, lineHeight: 17 },
})
