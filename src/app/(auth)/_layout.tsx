import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/providers/auth-provider';

export default function AuthLayout() {
  const { isLoading, user } = useAuth();
  if (!isLoading && user) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
