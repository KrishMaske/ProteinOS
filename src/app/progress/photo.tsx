import { router } from 'expo-router';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { useAddProgressPhoto } from '@/features/progress/hooks/use-progress';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/providers/auth-provider';

export default function AddProgressPhotoScreen() {
  const { user } = useAuth(); const { colors } = useAppTheme(); const mutation = useAddProgressPhoto();
  async function add() { if (!user) return; const result = await mutation.mutateAsync(user.id); if (result) router.back(); }
  return <Screen><Card><AppText>Choose a consistent pose and lighting when possible.</AppText><AppText color={colors.muted}>Your photo stays private.</AppText>{mutation.error ? <AppText color={colors.danger}>{mutation.error.message}</AppText> : null}<Button disabled={mutation.isPending} onPress={add}>{mutation.isPending ? 'Uploading…' : 'Choose photo'}</Button></Card></Screen>;
}
