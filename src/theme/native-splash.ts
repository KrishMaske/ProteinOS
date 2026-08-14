export type ExpoExecutionEnvironment = 'bare' | 'standalone' | 'storeClient';

/**
 * Expo Go owns its launch view controller and does not provide the app-level
 * native splash that expo-splash-screen expects to control.
 */
export function shouldControlNativeSplash(
  executionEnvironment: ExpoExecutionEnvironment,
): boolean {
  return executionEnvironment !== 'storeClient';
}
