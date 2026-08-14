import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/providers/auth-provider';

const icons = { today: 'today-outline', workouts: 'barbell-outline', nutrition: 'restaurant-outline', progress: 'trending-up-outline' } as const;

export default function TabsLayout() {
  const { colors } = useAppTheme();
  const { isLoading, isOnboarded, profileError, refreshProfile, user } = useAuth();
  if (isLoading) return <Screen scroll={false}><LoadingState label="Loading your profile…" /></Screen>;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (profileError) {
    return <Screen scroll={false}><ErrorState message={profileError} onRetry={() => void refreshProfile().catch(() => undefined)} /></Screen>;
  }
  if (!isOnboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarHideOnKeyboard: true,
      tabBarStyle: {
        backgroundColor: colors.surface,
        borderTopWidth: 0,
        height: Platform.OS === 'ios' ? 82 : 68,
        paddingTop: 8,
        paddingBottom: Platform.OS === 'ios' ? 20 : 8,
        elevation: 0,
      },
      tabBarItemStyle: { minWidth: 0 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '800', marginTop: 2 },
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarIcon: ({ color, focused }) => (
        <View style={[styles.iconWrap, focused && { backgroundColor: colors.softAccent }]}>
          <Ionicons name={icons[route.name as keyof typeof icons] ?? 'ellipse-outline'} color={color} size={22} />
        </View>
      ),
    })}>
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarAccessibilityLabel: 'Today dashboard' }} />
      <Tabs.Screen name="workouts" options={{ title: 'Train', tabBarAccessibilityLabel: 'Training and routines' }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Nutrition', tabBarAccessibilityLabel: 'Nutrition log' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarAccessibilityLabel: 'Progress tracking' }} />
      <Tabs.Screen name="coach" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 42, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
