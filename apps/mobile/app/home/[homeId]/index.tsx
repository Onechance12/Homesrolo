import { Redirect } from 'expo-router'
import { useHomeId } from '../../../src/home/HomeRouteProvider.tsx'

// Keep old unqualified home links valid while making the persistent Rolo
// conversation the actual visible homeowner root.
export default function HomeFrontDoor() {
  const homeId = useHomeId()
  return <Redirect href={{ pathname: '/home/[homeId]/rolo', params: { homeId } }} />
}
