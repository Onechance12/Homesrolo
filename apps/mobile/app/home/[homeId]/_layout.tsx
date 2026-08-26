import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'
import type { ColorValue } from 'react-native'
import { StyleSheet, View } from 'react-native'
import { colors } from '../../../src/theme.ts'

const icon = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />

const startIcon = ({ focused }: { color: ColorValue; size: number; focused: boolean }) => (
  <View style={[styles.startButton, focused && styles.startButtonFocused]}>
    <Ionicons name="sparkles" color={colors.ink} size={25} />
  </View>
)

export default function HomeTabs() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      sceneStyle: { backgroundColor: colors.ink },
      tabBarActiveTintColor: colors.lime,
      tabBarInactiveTintColor: colors.smoke,
      tabBarStyle: {
        height: 88,
        paddingTop: 10,
        paddingBottom: 17,
        backgroundColor: colors.inkRaised,
        borderTopColor: colors.line,
      },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '900' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('sunny-outline') }} />
      <Tabs.Screen name="work" options={{ title: 'Plans', tabBarIcon: icon('layers-outline') }} />
      <Tabs.Screen name="rolo" options={{
        title: 'Start',
        tabBarIcon: startIcon,
        tabBarIconStyle: styles.startIcon,
      }} />
      <Tabs.Screen name="people" options={{ title: 'Pros', tabBarIcon: icon('people-outline') }} />
      <Tabs.Screen name="care" options={{ title: 'My Home', tabBarIcon: icon('home-outline') }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  startIcon: { marginTop: -26 },
  startButton: {
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
  startButtonFocused: { transform: [{ scale: 1.06 }] },
})
