import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import type { ColorValue } from 'react-native'
import { colors } from '../../../src/theme.ts'

const icon = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />

export default function HomeTabs() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      sceneStyle: { backgroundColor: colors.ink },
      tabBarActiveTintColor: colors.lime,
      tabBarInactiveTintColor: colors.smoke,
      tabBarStyle: {
        height: 82,
        paddingTop: 8,
        paddingBottom: 18,
        backgroundColor: colors.inkRaised,
        borderTopColor: colors.line,
      },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '800' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="care" options={{ title: 'Care', tabBarIcon: icon('heart-outline') }} />
      <Tabs.Screen name="rolo" options={{ title: 'Rolo', tabBarIcon: icon('sparkles-outline') }} />
      <Tabs.Screen name="work" options={{ title: 'Work', tabBarIcon: icon('hammer-outline') }} />
      <Tabs.Screen name="people" options={{ title: 'People', tabBarIcon: icon('people-outline') }} />
    </Tabs>
  )
}
