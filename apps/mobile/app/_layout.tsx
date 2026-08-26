import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SessionProvider, useSession } from '../src/auth/SessionProvider.tsx'
import { colors } from '../src/theme.ts'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Navigation />
      </SessionProvider>
    </SafeAreaProvider>
  )
}

function Navigation() {
  const { previewMode } = useSession()
  return (
    <View style={styles.shell}>
      {previewMode ? (
        <View style={styles.previewBanner}>
          <Text style={styles.previewText}>Local UI preview · fixture data only · nothing leaves this browser</Text>
        </View>
      ) : null}
      <View style={[styles.app, previewMode && styles.previewViewport]}>
        <StatusBar style="light" />
        <Stack screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.ink },
          animation: 'fade',
        }} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#031119' },
  app: { flex: 1 },
  previewViewport: {
    width: '100%', maxWidth: 520, alignSelf: 'center',
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line,
  },
  previewBanner: {
    minHeight: 30, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.lime, paddingHorizontal: 12, paddingVertical: 6,
  },
  previewText: { color: colors.ink, fontSize: 11, lineHeight: 14, fontWeight: '900', textAlign: 'center' },
})
