import { StyleSheet } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { spacing } from '@/constants/tokens';
import { clientEnvironmentError } from '@/lib/env';

export function ConfigurationRequired() {
  return (
    <Screen>
      <AppText variant="eyebrow">ProteinOS setup</AppText>
      <AppText variant="title">Connect your Supabase project</AppText>
      <Card>
        <AppText>Copy <AppText variant="caption">.env.example</AppText> to <AppText variant="caption">.env</AppText> and add the project URL and publishable key.</AppText>
        <AppText variant="caption" style={styles.code}>EXPO_PUBLIC_SUPABASE_URL=https://…{`\n`}EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…</AppText>
        <AppText variant="caption">{clientEnvironmentError}</AppText>
      </Card>
      <AppText variant="caption">Never place OPENAI_API_KEY in the mobile environment. It belongs only in Supabase Edge Function secrets.</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({ code: { lineHeight: 22, marginVertical: spacing.sm } });
