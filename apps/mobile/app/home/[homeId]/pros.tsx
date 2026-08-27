import { Redirect, useLocalSearchParams } from 'expo-router'
import { legacyHomeRef, legacyProfessionalTrade } from '../../../src/home/legacy-route.ts'

export default function LegacyProsRoute() {
  const { homeId: rawHomeId, trade: rawTrade } = useLocalSearchParams<{
    homeId?: string | string[]
    trade?: string | string[]
  }>()
  const homeId = legacyHomeRef(rawHomeId)
  const trade = legacyProfessionalTrade(rawTrade)
  return homeId
    ? <Redirect href={{ pathname: '/home/[homeId]/people', params: { homeId, ...(trade ? { trade } : {}) } }} />
    : <Redirect href="/homes" />
}
