import { Stack } from 'expo-router'
import { colors } from '../../../../src/theme.ts'

export default function WorkLayout() {
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.ink },
      animation: 'slide_from_right',
    }} />
  )
}
