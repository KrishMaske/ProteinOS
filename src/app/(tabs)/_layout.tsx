import { Redirect } from 'expo-router';
// expo-router 6 exposes Icon and Label as standalone elements; SDK 57 nests them under
// NativeTabs.Trigger. Importing them directly works on both.
//
// SF Symbols render on iOS in both SDKs. SDK 57 also accepts md="<material-icon>" for
// Android, which expo-router 6 does not; add those back when upgrading if Android matters.
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/providers/auth-provider';

/**
 * A translucent wash rather than a solid fill: the native bar composites this over the
 * blur, so the brown reads as a tint on the glass instead of hiding it. Light mode gets
 * the paper tone, dark mode the ink tone, both at low alpha.
 */
const GLASS_TINT = { light: 'rgba(234, 217, 199, 0.35)', dark: 'rgba(51, 38, 27, 0.45)' };

export default function TabsLayout() {
  const { colors, isDark } = useAppTheme();
  const { isLoading, isOnboarded, profileError, refreshProfile, user } = useAuth();
  if (isLoading) return <Screen scroll={false}><LoadingState label="Loading your profile…" /></Screen>;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (profileError) {
    return <Screen scroll={false}><ErrorState message={profileError} onRetry={() => void refreshProfile().catch(() => undefined)} /></Screen>;
  }
  if (!isOnboarded) return <Redirect href="/onboarding" />;

  return (
    <NativeTabs
      // systemChromeMaterial is the material UIKit uses for bars, so on iOS 26 this is
      // the real Liquid Glass rather than a blur imitation.
      blurEffect={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
      backgroundColor={isDark ? GLASS_TINT.dark : GLASS_TINT.light}
      tintColor={colors.primary}
      iconColor={colors.muted}
      // Android has no glass, so it needs the ripple and indicator tinted instead.
      rippleColor={Platform.OS === 'android' ? colors.softAccent : undefined}
      indicatorColor={Platform.OS === 'android' ? colors.softAccent : undefined}
      labelStyle={{ fontSize: 11, fontWeight: '800' }}
    >
      <NativeTabs.Trigger name="today">
        <Icon sf={{ default: 'calendar', selected: 'calendar' }} />
        <Label>Today</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="workouts">
        <Icon sf={{ default: 'dumbbell', selected: 'dumbbell.fill' }} />
        <Label>Train</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="nutrition">
        <Icon sf={{ default: 'fork.knife', selected: 'fork.knife' }} />
        <Label>Nutrition</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="progress">
        <Icon sf={{ default: 'chart.line.uptrend.xyaxis', selected: 'chart.line.uptrend.xyaxis' }} />
        <Label>Progress</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="coach" hidden />
    </NativeTabs>
  );
}
