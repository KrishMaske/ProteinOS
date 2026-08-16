import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// expo-router 6 does not re-export the navigation theme primitives; SDK 57's router does.
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { type PropsWithChildren, useMemo, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAppTheme } from '@/hooks/use-app-theme';
import { AuthProvider } from '@/providers/auth-provider';
import { AppThemeProvider } from '@/providers/theme-provider';

function NavigationTheme({ children }: PropsWithChildren) {
  const { colors, isDark } = useAppTheme();
  const value = useMemo(() => ({
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.line,
      notification: colors.danger,
    },
  }), [colors, isDark]);
  return <NavigationThemeProvider value={value}>{children}</NavigationThemeProvider>;
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );

  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <NavigationTheme>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>{children}</AuthProvider>
          </QueryClientProvider>
        </NavigationTheme>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
