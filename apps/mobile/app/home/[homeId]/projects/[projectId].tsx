import { Redirect, useLocalSearchParams } from 'expo-router'
import { legacyHomeRef, legacyProjectRef } from '../../../../src/home/legacy-route.ts'

export default function LegacyProjectRoute() {
  const { homeId: rawHomeId, projectId: rawProjectId } = useLocalSearchParams<{
    homeId?: string | string[]
    projectId?: string | string[]
  }>()
  const homeId = legacyHomeRef(rawHomeId)
  const projectRef = legacyProjectRef(rawProjectId)
  return homeId && projectRef
    ? <Redirect href={{ pathname: '/home/[homeId]/work/[projectRef]', params: { homeId, projectRef } }} />
    : <Redirect href="/homes" />
}
