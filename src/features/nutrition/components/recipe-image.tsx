import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius } from '@/constants/tokens';
import { signedRecipeImageUrl } from '@/features/nutrition/api/recipes';
import { useAppTheme } from '@/hooks/use-app-theme';

/** Recipe photos live in a private bucket, so each render resolves a signed URL. */
export function RecipeImage({ path, size = 56 }: { path: string | null; size?: number }) {
  const { colors } = useAppTheme();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUri(null);
      return;
    }
    let cancelled = false;
    void signedRecipeImageUrl(path).then((url) => {
      if (!cancelled) setUri(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const box = { width: size, height: size, borderRadius: radius.md };
  if (!path || !uri) {
    return (
      <View style={[box, styles.placeholder, { backgroundColor: colors.raised }]}>
        <Ionicons name="restaurant-outline" size={Math.round(size * 0.4)} color={colors.muted} />
      </View>
    );
  }
  return <Image source={{ uri }} style={box} contentFit="cover" transition={140} accessibilityLabel="Recipe photo" />;
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
