import { Redirect, useLocalSearchParams } from 'expo-router'
import { legacyProjectRef } from '../../src/home/legacy-route.ts'

export default function LegacyUnscopedProjectRoute() {
  const { projectId: rawProjectId } = useLocalSearchParams<{ projectId?: string | string[] }>()
  const projectRef = legacyProjectRef(rawProjectId)
  return projectRef
    ? <Redirect href={{ pathname: '/homes', params: { project: projectRef } }} />
    : <Redirect href="/homes" />
}
