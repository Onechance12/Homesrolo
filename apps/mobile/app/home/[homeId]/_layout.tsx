import { Ionicons } from '@expo/vector-icons'
import { Tabs, useLocalSearchParams } from 'expo-router'
import type { ColorValue } from 'react-native'
import { StyleSheet, View } from 'react-native'
import { HomeRouteProvider } from '../../../src/home/HomeRouteProvider.tsx'
import { colors } from '../../../src/theme.ts'

const icon = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />

const roloIcon = ({ focused }: { color: ColorValue; size: number; focused: boolean }) => (
  <View style={[styles.roloButton, focused && styles.roloButtonFocused]}>
    <Ionicons name="chatbubble-ellipses-outline" color={colors.ink} size={25} />
  </View>
)

export default function HomeTabs() {
  const { homeId } = useLocalSearchParams<{ homeId: string }>()

  return (
    <HomeRouteProvider homeId={homeId}>
      <Tabs screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.ink },
        tabBarActiveTintColor: colors.lime,
        tabBarInactiveTintColor: colors.smoke,
        tabBarStyle: {
          height: 84,
          paddingTop: 8,
          paddingBottom: 15,
          backgroundColor: colors.inkRaised,
          borderTopColor: colors.line,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}>
        <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('sunny-outline') }} />
        <Tabs.Screen name="work" options={{ title: 'Work', tabBarIcon: icon('layers-outline') }} />
        <Tabs.Screen name="rolo" options={{
          title: 'Rolo',
          tabBarIcon: roloIcon,
          tabBarIconStyle: styles.roloIcon,
        }} />
        <Tabs.Screen name="people" options={{ title: 'Pros', tabBarIcon: icon('people-outline') }} />
        <Tabs.Screen name="care" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      </Tabs>
    </HomeRouteProvider>
  )
}

const styles = StyleSheet.create({
  roloIcon: { marginTop: -24 },
  roloButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lime,
    borderWidth: 5,
    borderColor: colors.inkRaised,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 8,
  },
  roloButtonFocused: { transform: [{ scale: 1.06 }] },
})
