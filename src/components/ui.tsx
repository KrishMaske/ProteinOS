import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ColorValue,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { radius, spacing } from '@/constants/tokens';
import { useAppTheme } from '@/hooks/use-app-theme';

type ScreenProps = PropsWithChildren<{
  contentContainerStyle?: ViewStyle;
  footer?: ReactNode;
  safeEdges?: Edge[];
  scroll?: boolean;
}>;

export function Screen({ children, contentContainerStyle, footer, safeEdges = ['left', 'right', 'bottom'], scroll = true }: ScreenProps) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const content = <View style={[styles.screenContent, compact && styles.compactScreenContent, contentContainerStyle]}>{children}</View>;
  const scrollContent = scroll ? (
    <ScrollView
      automaticallyAdjustKeyboardInsets={!footer}
      contentContainerStyle={styles.scroll}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled">
      {content}
    </ScrollView>
  ) : content;

  return (
    <SafeAreaView edges={safeEdges} style={[styles.safe, { backgroundColor: colors.background }]}>
      {footer || !scroll ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
          {scrollContent}
          {footer ? <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.line }]}><View style={[styles.footerInner, compact && styles.compactFooterInner]}>{footer}</View></View> : null}
        </KeyboardAvoidingView>
      ) : scrollContent}
    </SafeAreaView>
  );
}

export function AppText({ variant = 'body', color, style, ...props }: ComponentProps<typeof Text> & {
  variant?: 'eyebrow' | 'title' | 'heading' | 'body' | 'caption' | 'number';
  color?: ColorValue;
}) {
  const { colors } = useAppTheme();
  return <Text {...props} style={[styles.text, styles[variant], { color: color ?? colors.text }, style]} />;
}

export function Card({ children, style }: PropsWithChildren<{ style?: ComponentProps<typeof View>['style'] }>) {
  const { colors } = useAppTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface }, style]}>{children}</View>;
}

export function PressableCard({ children, style, ...props }: PropsWithChildren<PressableProps>) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      style={(state) => [
        styles.card,
        { backgroundColor: colors.surface, opacity: state.pressed ? 0.72 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}>
      {children}
    </Pressable>
  );
}

type ButtonProps = Omit<PressableProps, 'children'> & {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

export function Button({ children, variant = 'primary', disabled, style, ...props }: ButtonProps) {
  const { colors } = useAppTheme();
  const backgroundColor = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : variant === 'ghost' ? 'transparent' : colors.raised;
  const textColor = variant === 'primary' || variant === 'danger' ? colors.onPrimary : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      disabled={disabled}
      style={(state) => [
        styles.button,
        { backgroundColor, opacity: disabled ? 0.45 : state.pressed ? 0.75 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}>
      <AppText style={styles.buttonLabel} color={textColor}>{children}</AppText>
    </Pressable>
  );
}

export function Field({ containerStyle, label, error, ...props }: ComponentProps<typeof TextInput> & { containerStyle?: ViewStyle; label: string; error?: string }) {
  const { colors } = useAppTheme();
  const [revealed, setRevealed] = useState(false);
  // Any secure field gets a reveal control, so every password in the app behaves alike.
  const secure = Boolean(props.secureTextEntry);
  return (
    <View style={[styles.fieldWrap, containerStyle]}>
      <AppText variant="caption" style={styles.fieldLabel}>{label}</AppText>
      <View style={styles.fieldRow}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          {...props}
          secureTextEntry={secure && !revealed}
          style={[styles.field, secure && styles.secureField, props.multiline && styles.multilineField, { color: colors.text, borderColor: error ? colors.danger : colors.line, backgroundColor: colors.surface }, props.style]}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${revealed ? 'Hide' : 'Show'} ${label}`}
            accessibilityState={{ selected: revealed }}
            hitSlop={6}
            onPress={() => setRevealed((current) => !current)}
            style={({ pressed }) => [styles.revealButton, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <AppText variant="caption" color={colors.danger}>{error}</AppText> : null}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return <View style={styles.sectionHeader}><AppText variant="heading" style={styles.sectionTitle}>{title}</AppText>{action ? <View style={styles.sectionAction}>{action}</View> : null}</View>;
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const { colors } = useAppTheme();
  return <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /><AppText color={colors.muted}>{label}</AppText></View>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  const { colors } = useAppTheme();
  return <Card style={styles.center}><AppText variant="heading">{title}</AppText><AppText color={colors.muted} style={styles.centerText}>{description}</AppText>{action}</Card>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <EmptyState title="Something went wrong" description={message} action={onRetry ? <Button onPress={onRetry}>Try again</Button> : undefined} />;
}

export function ProgressBar({ label, value }: { label: string; value: number }) {
  const { colors } = useAppTheme();
  const percent = Math.max(0, Math.min(100, value));
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }} style={[styles.progressTrack, { backgroundColor: colors.raised }]}> 
      <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${percent}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  screenContent: { width: '100%', maxWidth: 720, minWidth: 0, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.huge, gap: spacing.xl, flexGrow: 1 },
  compactScreenContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.md },
  text: { flexShrink: 1 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { fontSize: 38, lineHeight: 42, fontWeight: '900', letterSpacing: -1.4 },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '800', letterSpacing: -0.25 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  number: { fontSize: 40, lineHeight: 44, fontWeight: '900', fontVariant: ['tabular-nums'] },
  card: { minWidth: 0, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  button: { minHeight: 50, minWidth: 0, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontWeight: '800', fontSize: 16, textAlign: 'center' },
  fieldWrap: { minWidth: 0, gap: spacing.sm },
  fieldRow: { minWidth: 0, justifyContent: 'center' },
  // Room for the reveal control so long passwords never run underneath it.
  secureField: { paddingRight: 52 },
  revealButton: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { marginLeft: spacing.xs },
  field: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: 16 },
  multilineField: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  sectionHeader: { minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sectionTitle: { flex: 1, minWidth: 0 },
  sectionAction: { flexShrink: 0 },
  center: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  centerText: { textAlign: 'center', maxWidth: 420 },
  footer: { borderTopWidth: 0, paddingTop: spacing.md, paddingBottom: spacing.sm },
  footerInner: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.lg },
  compactFooterInner: { paddingHorizontal: spacing.md },
  progressTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
});
