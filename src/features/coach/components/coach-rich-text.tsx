import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { spacing } from '@/constants/tokens';
import { parseCoachInline, parseCoachText } from '@/features/coach/services/coach-rich-text';
import { useAppTheme } from '@/hooks/use-app-theme';

export function CoachRichText({ content }: { content: string }) {
  const { colors } = useAppTheme();
  const blocks = parseCoachText(content);

  return (
    <View style={styles.blocks}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return <InlineText key={`${block.type}-${index}`} text={block.text} variant={block.level === 1 ? 'heading' : 'body'} heading />;
        }
        if (block.type === 'list') {
          return (
            <View key={`${block.type}-${index}`} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={`${item}-${itemIndex}`} style={styles.listItem}>
                  <AppText color={colors.primary} style={styles.marker}>{block.ordered ? `${itemIndex + 1}.` : '•'}</AppText>
                  <InlineText text={item} style={styles.listText} />
                </View>
              ))}
            </View>
          );
        }
        return <InlineText key={`${block.type}-${index}`} text={block.text} />;
      })}
    </View>
  );
}

function InlineText({ heading = false, style, text, variant = 'body' }: { heading?: boolean; style?: TextStyle; text: string; variant?: 'heading' | 'body' }) {
  return (
    <AppText variant={variant} style={[styles.richLine, heading && styles.headingSpacing, heading && variant === 'body' && styles.subheading, style]}>
      {parseCoachInline(text).map((segment, index) => (
        <Text key={`${segment.text}-${index}`} style={[segment.bold && styles.bold, segment.italic && styles.italic]}>
          {segment.text}
        </Text>
      ))}
    </AppText>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: spacing.md },
  richLine: { minWidth: 0 },
  headingSpacing: { marginTop: spacing.xs },
  subheading: { fontSize: 17, lineHeight: 23, fontWeight: '800' },
  list: { gap: spacing.sm },
  listItem: { minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  listText: { flex: 1 },
  marker: { width: 20, flexShrink: 0, textAlign: 'right' },
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
});
