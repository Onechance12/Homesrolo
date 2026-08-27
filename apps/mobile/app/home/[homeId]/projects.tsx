import { Redirect, useLocalSearchParams } from 'expo-router'
import { legacyHomeRef } from '../../../src/home/legacy-route.ts'

export default function LegacyProjectsRoute() {
  const { homeId: rawHomeId } = useLocalSearchParams<{ homeId?: string | string[] }>()
  const homeId = legacyHomeRef(rawHomeId)
  return homeId
    ? <Redirect href={{ pathname: '/home/[homeId]/work', params: { homeId } }} />
    : <Redirect href="/homes" />
}
