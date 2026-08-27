import { Redirect } from 'expo-router'

export default function LegacyNewHomeRoute() {
  return <Redirect href={{ pathname: '/homes', params: { add: '1' } }} />
}
