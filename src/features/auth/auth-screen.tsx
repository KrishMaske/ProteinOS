import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Field, Screen } from '@/components/ui';
import { spacing } from '@/constants/tokens';
import { authFormSchema, type AuthFormValues } from '@/features/auth/schema';
import { useAppTheme } from '@/hooks/use-app-theme';
import { supabase } from '@/lib/supabase/client';

export function AuthScreen({ mode }: { mode: 'login' | 'signup' }) {
  const { colors } = useAppTheme();
  const { control, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<AuthFormValues>({
    resolver: zodResolver(authFormSchema),
    defaultValues: { email: '', password: '' },
  });

  async function submit(values: AuthFormValues) {
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword(values)
      : await supabase.auth.signUp(values);
    if (result.error) {
      setError('root', { message: result.error.message });
      return;
    }
    if (mode === 'signup' && !result.data.session) {
      setError('root', { message: 'Check your email to confirm your account, then sign in.' });
      return;
    }
    router.replace('/');
  }

  return (
    <Screen safeEdges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.hero}>
        <AppText variant="eyebrow" color={colors.primary}>ProteinOS</AppText>
        <AppText variant="title">{mode === 'login' ? 'Welcome back.' : 'Build your strongest system.'}</AppText>
        <AppText color={colors.muted}>{mode === 'login' ? 'Your training, nutrition, and progress—connected.' : 'A private, evidence-aware home for your fitness data.'}</AppText>
      </View>
      <Card>
        <Controller control={control} name="email" render={({ field }) => <Field label="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={errors.email?.message} />} />
        <Controller control={control} name="password" render={({ field }) => <Field label="Password" secureTextEntry autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={errors.password?.message} />} />
        {errors.root?.message ? <AppText color={colors.danger}>{errors.root.message}</AppText> : null}
        <Button disabled={isSubmitting} onPress={handleSubmit(submit)}>{isSubmitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</Button>
      </Card>
      <AppText style={styles.switch} color={colors.muted}>
        {mode === 'login' ? 'New here? ' : 'Already have an account? '}
        <Link href={mode === 'login' ? '/(auth)/signup' : '/(auth)/login'} style={{ color: colors.primary, fontWeight: '800' }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</Link>
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({ hero: { marginTop: spacing.huge, gap: spacing.md }, switch: { textAlign: 'center' } });
