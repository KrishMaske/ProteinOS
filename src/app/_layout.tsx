import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';

import { ConfigurationRequired } from '@/components/configuration-required';
import { useAppTheme } from '@/hooks/use-app-theme';
import { clientEnvironment } from '@/lib/env';
import { AppProviders } from '@/providers/app-providers';

function AppNavigator() {
  const { isDark, colors } = useAppTheme();
  return (
    <>
      {/* SDK 57 made Android edge-to-edge mandatory and dropped backgroundColor;
          the bar now draws over the screen background set on Stack's contentStyle. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTitleAlign: 'center',
        headerTitleStyle: styles.headerTitle,
        contentStyle: { backgroundColor: colors.background },
      }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
        <Stack.Screen name="exercises/index" options={{ title: 'Exercises' }} />
        <Stack.Screen name="exercise/[id]" options={{ title: 'Exercise' }} />
        <Stack.Screen name="routine/[id]" options={{ title: 'Routine' }} />
        <Stack.Screen name="routine/new" options={{ title: 'New routine' }} />
        <Stack.Screen name="routine/import" options={{ title: 'Import workout' }} />
        <Stack.Screen name="routine/rename" options={{ title: 'Rename plan', presentation: 'modal' }} />
        <Stack.Screen name="routine/[id]/add-exercise" options={{ title: 'Add exercise' }} />
        <Stack.Screen name="routine/exercise/[id]" options={{ title: 'Exercise prescription', presentation: 'modal' }} />
        <Stack.Screen name="routine/day/[id]" options={{ title: 'Training day', presentation: 'modal' }} />
        <Stack.Screen name="workout/start" options={{ title: 'Start workout' }} />
        <Stack.Screen name="workout/[id]" options={{ title: 'Active workout' }} />
        <Stack.Screen name="workout/summary" options={{ title: 'Workout summary' }} />
        <Stack.Screen name="workout/replace" options={{ title: 'Replace exercise', presentation: 'modal' }} />
        <Stack.Screen name="nutrition/log" options={{ title: 'Log food', presentation: 'modal' }} />
        <Stack.Screen name="nutrition/scan" options={{ title: 'Scan food', presentation: 'modal' }} />
        <Stack.Screen name="nutrition/foods" options={{ title: 'Saved foods' }} />
        <Stack.Screen name="nutrition/saved/[id]" options={{ title: 'Saved food', presentation: 'modal' }} />
        <Stack.Screen name="nutrition/[id]" options={{ title: 'Edit food', presentation: 'modal' }} />
        <Stack.Screen name="progress/log" options={{ title: 'Log measurement', presentation: 'modal' }} />
        <Stack.Screen name="progress/photo" options={{ title: 'Progress photo', presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  if (!clientEnvironment) return <ConfigurationRequired />;
  return <AppProviders><AppNavigator /></AppProviders>;
}

const styles = StyleSheet.create({
  headerTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
});
