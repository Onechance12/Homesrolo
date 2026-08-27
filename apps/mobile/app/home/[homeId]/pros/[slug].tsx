import { Redirect, useLocalSearchParams } from 'expo-router'
import { legacyHomeRef, legacyProfessionalSlug } from '../../../../src/home/legacy-route.ts'

export default function LegacyProfessionalRoute() {
  const { homeId: rawHomeId, slug: rawSlug } = useLocalSearchParams<{
    homeId?: string | string[]
    slug?: string | string[]
  }>()
  const homeId = legacyHomeRef(rawHomeId)
  const professionalSlug = legacyProfessionalSlug(rawSlug)
  return homeId && professionalSlug
    ? <Redirect href={{ pathname: '/home/[homeId]/people', params: { homeId, professionalSlug } }} />
    : <Redirect href="/homes" />
}
