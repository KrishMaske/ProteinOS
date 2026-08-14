import { Redirect } from 'expo-router';

import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';

export default function IndexScreen() {
  const { isLoading, isOnboarded, profileError, refreshProfile, user } = useAuth();
  if (isLoading) return <Screen scroll={false}><LoadingState label="Restoring your session…" /></Screen>;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (profileError) {
    return <Screen scroll={false}><ErrorState message={profileError} onRetry={() => void refreshProfile().catch(() => undefined)} /></Screen>;
  }
  if (!isOnboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)/today" />;
}
