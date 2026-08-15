import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { HeaderNavigationButton } from '@/components/header-navigation-button';
import { AppText, Button, Card, ErrorState, Field, LoadingState, PressableCard, Screen } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import {
  captureCoachAttachment,
  coachActionSchema,
  removeCoachAttachment,
  signedCoachAttachmentUrl,
  pickCoachDocument,
  uploadCoachAttachment,
  MAX_COACH_ATTACHMENTS,
  type CoachGoalAction,
} from '@/features/coach/api/coach';
import { CoachRichText } from '@/features/coach/components/coach-rich-text';
import {
  useApplyCoachGoal,
  useCoachConversation,
  useCoachConversations,
  useDismissCoachGoal,
  useSendCoachMessage,
} from '@/features/coach/hooks/use-coach';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/providers/auth-provider';
import type { Tables } from '@/types/database';

const prompts = ['Review my training', 'Build me a routine', 'Review my protein intake', 'Change my goal to muscle gain'];
type CoachMessage = Pick<Tables<'ai_messages'>, 'id' | 'role' | 'content' | 'ui_action' | 'attachments' | 'created_at'>;
type CoachConversation = Pick<Tables<'ai_conversations'>, 'id' | 'title' | 'created_at' | 'updated_at'>;

export default function CoachScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ prompt?: string }>();
  const conversationsQuery = useCoachConversations();
  const [activeId, setActiveId] = useState<string | null | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [message, setMessage] = useState(params.prompt ?? '');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const conversationQuery = useCoachConversation(activeId ?? null);
  const sendMessage = useSendCoachMessage();
  const applyGoal = useApplyCoachGoal();
  const dismissGoal = useDismissCoachGoal();
  const listRef = useRef<FlatList<CoachMessage>>(null);

  useEffect(() => {
    if (params.prompt) setMessage(params.prompt);
  }, [params.prompt]);

  useEffect(() => {
    if (activeId !== undefined || conversationsQuery.isLoading) return;
    setActiveId(conversationsQuery.data?.[0]?.id ?? null);
  }, [activeId, conversationsQuery.data, conversationsQuery.isLoading]);

  useEffect(() => {
    if (!activeId || !conversationsQuery.data || conversationsQuery.data.some((item) => item.id === activeId)) return;
    setActiveId(conversationsQuery.data[0]?.id ?? null);
  }, [activeId, conversationsQuery.data]);

  const messages = useMemo(() => {
    const saved = activeId ? conversationQuery.data?.messages ?? [] : [];
    if (!sendMessage.isPending || !sendMessage.variables?.message) return saved;
    if ((sendMessage.variables.conversationId ?? null) !== (activeId ?? null)) return saved;
    return [...saved, {
      id: 'pending-user-message',
      role: 'user' as const,
      content: sendMessage.variables.message,
      ui_action: null,
      // Echo the images being sent so the bubble looks the same before and after the round trip.
      attachments: sendMessage.variables.attachments ?? [],
      created_at: new Date().toISOString(),
    }];
  }, [activeId, conversationQuery.data?.messages, sendMessage.isPending, sendMessage.variables]);

  const latestActionableGoalMessageId = useMemo(() => [...messages].reverse().find((item) => {
    const parsed = coachActionSchema.safeParse(item.ui_action);
    return parsed.success
      && parsed.data.type === 'confirm_goal_update'
      && !parsed.data.resolution
      && parsed.data.currentGoalId !== undefined;
  })?.id, [messages]);

  useEffect(() => {
    if (!messages.length) return;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [messages.length, sendMessage.isPending]);

  function startNewChat() {
    if (sendMessage.isPending) return;
    sendMessage.reset();
    setActiveId(null);
    setMessage('');
    setHistoryOpen(false);
  }

  function openConversation(conversationId: string) {
    if (sendMessage.isPending) return;
    sendMessage.reset();
    setActiveId(conversationId);
    setHistoryOpen(false);
  }

  async function send() {
    const content = message.trim();
    if (!content || sendMessage.isPending) return;
    const targetId = activeId ?? null;
    const sending = attachments;
    setMessage('');
    setAttachments([]);
    try {
      const result = await sendMessage.mutateAsync({ message: content, conversationId: targetId, attachments: sending });
      if (!targetId) setActiveId(result.conversationId);
    } catch {
      // Put the draft and its images back so nothing is lost on a failed send.
      setMessage(content);
      setAttachments(sending);
    }
  }

  async function attach(source: 'camera' | 'library' | 'file') {
    if (!user || attachments.length >= MAX_COACH_ATTACHMENTS) return;
    setAttachError(null);
    setAttaching(true);
    try {
      const path = source === 'camera'
        ? await captureCoachAttachment(user.id)
        : source === 'library'
          ? await uploadCoachAttachment(user.id)
          : await pickCoachDocument(user.id);
      if (path) setAttachments((current) => [...current, path]);
    } catch (caught) {
      setAttachError(caught instanceof Error ? caught.message : 'Could not attach that file.');
    } finally {
      setAttaching(false);
    }
  }

  function discardAttachment(path: string) {
    setAttachments((current) => current.filter((item) => item !== path));
    void removeCoachAttachment(path);
  }

  async function confirmGoal(messageId: string, action: CoachGoalAction) {
    try {
      await applyGoal.mutateAsync({ messageId, action });
    } catch {
      // The mutation error is shown on this confirmation card.
    }
  }

  async function dismissGoalUpdate(messageId: string) {
    try {
      await dismissGoal.mutateAsync(messageId);
    } catch {
      // The mutation error is shown on this confirmation card.
    }
  }

  function closeCoach() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/today');
  }

  if (conversationsQuery.isLoading || activeId === undefined) {
    return <Screen safeEdges={['top', 'left', 'right', 'bottom']}><LoadingState label="Loading Coach…" /></Screen>;
  }
  if (conversationsQuery.isError) {
    return <Screen safeEdges={['top', 'left', 'right', 'bottom']}><ErrorState message={conversationsQuery.error.message} onRetry={() => conversationsQuery.refetch()} /></Screen>;
  }
  if (activeId && conversationQuery.isError) {
    return <Screen safeEdges={['top', 'left', 'right', 'bottom']}><ErrorState message={conversationQuery.error.message} onRetry={() => conversationQuery.refetch()} /></Screen>;
  }

  return (
    <>
      <Screen
        scroll={false}
        safeEdges={['top', 'left', 'right', 'bottom']}
        contentContainerStyle={styles.screen}
        footer={
          <View style={styles.composerWrap}>
            {sendMessage.error ? <AppText variant="caption" color={colors.danger}>{sendMessage.error.message}</AppText> : null}
            {attachError ? <AppText variant="caption" color={colors.danger}>{attachError}</AppText> : null}
            {attachments.length ? (
              <View style={styles.attachmentRow}>
                {attachments.map((path) => (
                  <AttachmentThumb key={path} path={path} onRemove={() => discardAttachment(path)} />
                ))}
              </View>
            ) : null}
            <View style={styles.composer}>
              <Pressable
                accessibilityLabel="Attach a photo or file"
                accessibilityRole="button"
                disabled={attaching || attachments.length >= MAX_COACH_ATTACHMENTS}
                onPress={() => setAttachMenuOpen(true)}
                style={[styles.attachButton, { backgroundColor: colors.raised, opacity: attaching || attachments.length >= MAX_COACH_ATTACHMENTS ? 0.4 : 1 }]}>
                <Ionicons name={attaching ? 'hourglass-outline' : 'image-outline'} size={22} color={colors.primary} />
              </Pressable>
              <Field containerStyle={styles.composerField} label="Message Coach" hideLabel placeholder="Ask anything…" multiline maxLength={4000} value={message} onChangeText={setMessage} style={styles.messageInput} />
              <Pressable
                accessibilityLabel="Send message"
                accessibilityRole="button"
                disabled={!message.trim() || sendMessage.isPending}
                onPress={() => void send()}
                style={({ pressed }) => [styles.sendButton, { backgroundColor: colors.primary, opacity: !message.trim() || sendMessage.isPending ? 0.4 : pressed ? 0.75 : 1 }]}>
                <Ionicons name="arrow-up" size={22} color={colors.onPrimary} />
              </Pressable>
            </View>
          </View>
        }>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <AppText variant="heading" numberOfLines={1}>{activeId ? conversationQuery.data?.conversation.title || 'Coach chat' : 'New chat'}</AppText>
          </View>
          <HeaderNavigationButton accessibilityLabel="Conversation history" icon="time-outline" onPress={() => setHistoryOpen(true)} />
          <HeaderNavigationButton accessibilityLabel="Start a new chat" icon="create-outline" disabled={!activeId || sendMessage.isPending} onPress={startNewChat} />
          <HeaderNavigationButton mode="close" onPress={closeCoach} />
        </View>

        {activeId && conversationQuery.isLoading ? <LoadingState label="Opening conversation…" /> : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.messages, !messages.length && styles.emptyMessages]}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const parsedAction = coachActionSchema.safeParse(item.ui_action);
              const action = parsedAction.success ? parsedAction.data : null;
              const applyPending = applyGoal.isPending && applyGoal.variables?.messageId === item.id;
              const dismissPending = dismissGoal.isPending && dismissGoal.variables === item.id;
              const error = applyGoal.variables?.messageId === item.id
                ? applyGoal.error?.message
                : dismissGoal.variables === item.id
                  ? dismissGoal.error?.message
                  : undefined;

              if (item.role === 'user') {
                const sent = Array.isArray(item.attachments) ? (item.attachments as string[]) : [];
                return (
                  <View style={[styles.messageRow, styles.userRow]}>
                    <View style={[styles.userMessage, { backgroundColor: colors.raised }]}>
                      {sent.length ? (
                        <View style={styles.attachmentRow}>
                          {sent.map((path) => <SentAttachment key={path} path={path} />)}
                        </View>
                      ) : null}
                      <AppText>{item.content}</AppText>
                    </View>
                  </View>
                );
              }

              return (
                <View style={styles.messageRow}>
                  <View style={[styles.coachMark, { backgroundColor: colors.primary }]}><Ionicons name="sparkles" size={14} color={colors.onPrimary} /></View>
                  <View style={styles.assistantMessage}>
                    <CoachRichText content={item.content} />
                    {action?.type === 'review_routine' ? <Button variant="secondary" onPress={() => router.push(`/routine/${action.routineId}`)}>Review routine</Button> : null}
                    {action?.type === 'confirm_goal_update' ? <GoalConfirmation action={action} interactive={latestActionableGoalMessageId === item.id} pending={applyPending || dismissPending} error={error} onApply={() => void confirmGoal(item.id, action)} onDismiss={() => void dismissGoalUpdate(item.id)} /> : null}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.raised }]}><Ionicons name="sparkles-outline" size={28} color={colors.primary} /></View>
                <AppText variant="title">What are we working on?</AppText>
                <View style={styles.prompts}>{prompts.map((prompt) => <Pressable key={prompt} onPress={() => setMessage(prompt)} style={[styles.prompt, { borderColor: colors.line }]}><AppText>{prompt}</AppText><Ionicons name="arrow-forward" size={18} color={colors.muted} /></Pressable>)}</View>
              </View>
            }
            ListFooterComponent={sendMessage.isPending ? <View style={styles.thinking}><Ionicons name="sparkles-outline" color={colors.primary} size={18} /><AppText variant="caption" color={colors.muted}>Thinking…</AppText></View> : null}
          />
        )}
      </Screen>

      <Modal animationType="fade" transparent visible={attachMenuOpen} onRequestClose={() => setAttachMenuOpen(false)}>
        <Pressable accessibilityLabel="Close attachment options" style={styles.sheetBackdrop} onPress={() => setAttachMenuOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]} onPress={() => undefined}>
            <AppText variant="heading">Attach</AppText>
            <AppText variant="caption" color={colors.muted}>
              Photos, PDFs, or text files up to 10 MB. Ask about ingredients, a nutrition label, a training plan, or anything else in the file.
            </AppText>
            <Button onPress={() => { setAttachMenuOpen(false); void attach('camera'); }}>Take a photo</Button>
            <Button variant="secondary" onPress={() => { setAttachMenuOpen(false); void attach('library'); }}>Choose a photo</Button>
            <Button variant="secondary" onPress={() => { setAttachMenuOpen(false); void attach('file'); }}>Choose a file</Button>
            <Button variant="ghost" onPress={() => setAttachMenuOpen(false)}>Cancel</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <ConversationHistory
        conversations={conversationsQuery.data ?? []}
        activeId={activeId ?? null}
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onNew={startNewChat}
        onSelect={openConversation}
      />
    </>
  );
}

function ConversationHistory({ activeId, conversations, onClose, onNew, onSelect, visible }: {
  activeId: string | null;
  conversations: CoachConversation[];
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  visible: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <Screen safeEdges={['top', 'left', 'right', 'bottom']} contentContainerStyle={styles.historyScreen}>
        <View style={styles.historyHeader}>
          <View style={styles.headerCopy}><AppText variant="title">Chats</AppText><AppText color={colors.muted}>{conversations.length ? `${conversations.length} saved` : 'No saved chats yet'}</AppText></View>
          <HeaderNavigationButton mode="close" onPress={onClose} />
        </View>
        <Button onPress={onNew}>New chat</Button>
        <View style={styles.historyList}>
          {conversations.map((conversation) => (
            <PressableCard key={conversation.id} onPress={() => onSelect(conversation.id)} style={[styles.historyItem, activeId === conversation.id && { borderColor: colors.primary }]}>
              <View style={[styles.historyIcon, { backgroundColor: colors.raised }]}><Ionicons name="chatbubble-outline" size={19} color={activeId === conversation.id ? colors.primary : colors.muted} /></View>
              <View style={styles.historyCopy}>
                <AppText variant="heading" numberOfLines={2}>{conversation.title || 'Coach chat'}</AppText>
                <AppText variant="caption" color={colors.muted}>{formatConversationDate(conversation.updated_at)}</AppText>
              </View>
              {activeId === conversation.id ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : <Ionicons name="chevron-forward" size={20} color={colors.muted} />}
            </PressableCard>
          ))}
        </View>
      </Screen>
    </Modal>
  );
}

function formatConversationDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `Today · ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

function GoalConfirmation({ action, error, interactive, onApply, onDismiss, pending }: { action: CoachGoalAction; error?: string; interactive: boolean; onApply: () => void; onDismiss: () => void; pending: boolean }) {
  const { colors } = useAppTheme();
  const format = (value: string | null) => value ? value.replaceAll('_', ' ') : 'Not set';
  if (action.resolution) return <View style={[styles.confirmationResult, { backgroundColor: colors.raised }]}><Ionicons name={action.resolution === 'applied' ? 'checkmark-circle' : 'close-circle-outline'} size={20} color={action.resolution === 'applied' ? colors.primary : colors.muted} /><AppText variant="caption">{action.resolution === 'applied' ? `Goal updated to ${format(action.goalType)}.` : 'Kept your current goal.'}</AppText></View>;
  if (!interactive) return <View style={[styles.confirmationResult, { backgroundColor: colors.raised }]}><Ionicons name="time-outline" size={20} color={colors.muted} /><AppText variant="caption">This request is no longer active. Ask Coach again to make this change.</AppText></View>;
  return <Card style={styles.confirmation}><AppText variant="caption" color={colors.muted}>Confirm goal change</AppText><AppText variant="heading">{format(action.currentGoalType)} → {format(action.goalType)}</AppText>{action.notes ? <AppText variant="caption" color={colors.muted}>{action.notes}</AppText> : null}{error ? <AppText variant="caption" color={colors.danger}>{error}</AppText> : null}<Button disabled={pending || action.currentGoalType === action.goalType} onPress={onApply}>{action.currentGoalType === action.goalType ? 'Already your goal' : pending ? 'Updating…' : 'Update goal'}</Button><Button variant="ghost" disabled={pending} onPress={onDismiss}>Keep current</Button></Card>;
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
function isImagePath(path: string) {
  return IMAGE_EXTENSIONS.includes(path.split('.').pop()?.toLowerCase() ?? '');
}

/** Documents have no preview, so they show their type instead of an empty square. */
function FileTile({ path, background }: { path: string; background: string }) {
  const { colors } = useAppTheme();
  const extension = (path.split('.').pop() ?? 'file').toUpperCase();
  return (
    <View style={[styles.attachmentImage, styles.fileTile, { backgroundColor: background }]}>
      <Ionicons name="document-text-outline" size={20} color={colors.primary} />
      <AppText variant="caption" color={colors.muted} numberOfLines={1}>{extension}</AppText>
    </View>
  );
}

/** Read-only preview for an attachment already sent, shown inside the message bubble. */
function SentAttachment({ path }: { path: string }) {
  const { colors } = useAppTheme();
  const [uri, setUri] = useState<string | null>(null);
  const image = isImagePath(path);
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    void signedCoachAttachmentUrl(path).then((url) => { if (!cancelled) setUri(url); });
    return () => { cancelled = true; };
  }, [image, path]);
  if (!image) return <FileTile path={path} background={colors.surface} />;
  return uri
    ? <Image source={{ uri }} style={styles.attachmentImage} contentFit="cover" transition={120} accessibilityLabel="Photo you sent" />
    : <View style={[styles.attachmentImage, { backgroundColor: colors.surface }]} />;
}

/** Resolves the private storage path to a viewable URL for the compose preview. */
function AttachmentThumb({ path, onRemove }: { path: string; onRemove: () => void }) {
  const { colors } = useAppTheme();
  const [uri, setUri] = useState<string | null>(null);
  const image = isImagePath(path);
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    void signedCoachAttachmentUrl(path).then((url) => { if (!cancelled) setUri(url); });
    return () => { cancelled = true; };
  }, [image, path]);

  return (
    <View style={styles.attachmentThumb}>
      {!image
        ? <FileTile path={path} background={colors.raised} />
        : uri
          ? <Image source={{ uri }} style={styles.attachmentImage} contentFit="cover" transition={120} accessibilityLabel="Attached photo" />
          : <View style={[styles.attachmentImage, { backgroundColor: colors.raised }]} />}
      <Pressable
        accessibilityLabel="Remove attachment"
        accessibilityRole="button"
        hitSlop={6}
        onPress={onRemove}
        style={[styles.attachmentRemove, { backgroundColor: colors.background }]}>
        <Ionicons name="close" size={14} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: spacing.lg, paddingBottom: 0, gap: spacing.md },
  header: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerCopy: { flex: 1, minWidth: 0 },
  messages: { gap: spacing.xl, paddingVertical: spacing.lg },
  emptyMessages: { flexGrow: 1, justifyContent: 'center' },
  messageRow: { minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  userRow: { justifyContent: 'flex-end' },
  userMessage: { gap: spacing.sm, minWidth: 0, maxWidth: '84%', borderRadius: radius.lg, borderBottomRightRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  coachMark: { width: 28, height: 28, flexShrink: 0, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  assistantMessage: { flex: 1, minWidth: 0, gap: spacing.md, paddingTop: spacing.xs },
  empty: { gap: spacing.lg, paddingVertical: spacing.xl },
  emptyIcon: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  prompts: { gap: spacing.sm },
  prompt: { minWidth: 0, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.sm },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: 36, paddingVertical: spacing.sm },
  composerWrap: { gap: spacing.sm, paddingBottom: spacing.sm },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  attachmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  attachmentThumb: { width: 64, height: 64 },
  fileTile: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  attachmentImage: { width: 64, height: 64, borderRadius: radius.md },
  attachmentRemove: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  composer: { minWidth: 0, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  attachButton: { width: 48, height: 48, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  composerField: { flex: 1 },
  messageInput: { minHeight: 48, maxHeight: 112, paddingTop: spacing.md },
  sendButton: { width: 48, height: 48, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  confirmation: { marginTop: spacing.sm },
  confirmationResult: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  historyScreen: { gap: spacing.lg },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  historyList: { gap: spacing.sm },
  historyItem: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  historyIcon: { width: 42, height: 42, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  historyCopy: { flex: 1, minWidth: 0 },
});
