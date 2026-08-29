import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs, useLocalSearchParams } from 'expo-router'
import type { ColorValue } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HomeRouteProvider } from '../../../src/home/HomeRouteProvider.tsx'
import { colors } from '../../../src/theme.ts'

const icon = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />

export default function HomeTabs() {
  const { homeId } = useLocalSearchParams<{ homeId: string }>()
  const insets = useSafeAreaInsets()

  return (
    <HomeRouteProvider key={homeId} homeId={homeId}>
      <Tabs screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.ink },
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.lime,
        tabBarInactiveTintColor: colors.smoke,
        tabBarStyle: {
          height: 49 + insets.bottom,
          paddingTop: 4,
          paddingBottom: insets.bottom,
          backgroundColor: colors.inkRaised,
          borderTopColor: colors.line,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}>
        <Tabs.Screen name="rolo" options={{ title: 'Rolo', tabBarIcon: icon('chatbubble-ellipses-outline') }} />
        <Tabs.Screen name="care" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
        <Tabs.Screen name="work" options={{ title: 'Work', tabBarIcon: icon('layers-outline') }} />
        <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-outline') }} />
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="people" options={{ href: null }} />
        <Tabs.Screen name="details" options={{ href: null }} />
        <Tabs.Screen name="checkups" options={{ href: null }} />
        <Tabs.Screen name="timeline" options={{ href: null }} />
        <Tabs.Screen name="projects" options={{ href: null }} />
        <Tabs.Screen name="projects/[projectId]" options={{ href: null }} />
        <Tabs.Screen name="documents" options={{ href: null }} />
        <Tabs.Screen name="warranties" options={{ href: null }} />
        <Tabs.Screen name="pros" options={{ href: null }} />
        <Tabs.Screen name="pros/[slug]" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </HomeRouteProvider>
  )
}
