import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { z } from 'zod';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';
import { uuid } from '@/lib/uuid';

const goalTypeSchema = z.enum(['recomp', 'fat_loss', 'muscle_gain', 'maintenance', 'strength']);

export const coachActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('review_routine'), routineId: z.string().uuid(), label: z.string() }),
  z.object({
    type: z.literal('confirm_goal_update'),
    currentGoalId: z.string().uuid().nullable().optional(),
    currentGoalType: goalTypeSchema.nullable(),
    goalType: goalTypeSchema,
    notes: z.string().max(500).nullable(),
    label: z.string(),
    resolution: z.enum(['applied', 'dismissed']).optional(),
    resolvedAt: z.string().optional(),
  }),
]);

const coachResponseSchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string(),
  uiAction: coachActionSchema.nullable(),
  runId: z.string().uuid(),
});

export type CoachAction = z.infer<typeof coachActionSchema>;
export type CoachGoalAction = Extract<CoachAction, { type: 'confirm_goal_update' }>;

export async function getCoachConversations() {
  const { data, error } = await supabase.from('ai_conversations')
    .select('id,title,created_at,updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getCoachConversation(conversationId: string) {
  const { data: conversation, error } = await supabase.from('ai_conversations')
    .select('id,title,created_at,updated_at')
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!conversation) throw new Error('That Coach conversation is no longer available.');

  const { data: messages, error: messagesError } = await supabase.from('ai_messages')
    .select('id,role,content,ui_action,attachments,created_at')
    .eq('conversation_id', conversation.id)
    .order('created_at');
  if (messagesError) throw messagesError;
  return { conversation, messages };
}

export const MAX_COACH_ATTACHMENTS = 4;

/**
 * Uploads a picked image and returns its storage path. The path is prefixed with the
 * user id because the bucket policies key off that first folder segment.
 */
export async function uploadCoachAttachment(userId: string) {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (result.canceled) return null;
  return processAndUpload(userId, result.assets[0].uri);
}

export async function captureCoachAttachment(userId: string) {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera access is needed to attach a photo. You can enable it in your phone settings.');
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
  if (result.canceled) return null;
  return processAndUpload(userId, result.assets[0].uri);
}

async function processAndUpload(userId: string, uri: string) {
  const context = ImageManipulator.ImageManipulator.manipulate(uri);
  context.resize({ width: 1400, height: null });
  const rendered = await context.renderAsync();
  const image = await rendered.saveAsync({ compress: 0.78, format: ImageManipulator.SaveFormat.JPEG });
  const response = await fetch(image.uri);
  if (!response.ok) throw new Error('That image could not be read.');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('That image was empty.');
  const path = `${userId}/${uuid()}.jpg`;
  const { error } = await supabase.storage.from('coach-attachments')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

export async function removeCoachAttachment(path: string) {
  await supabase.storage.from('coach-attachments').remove([path]);
}

export async function signedCoachAttachmentUrl(path: string) {
  const { data } = await supabase.storage.from('coach-attachments').createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function sendCoachMessage(message: string, conversationId: string | null, attachments: string[] = []) {
  const { data, error } = await supabase.functions.invoke('ai-coach', {
    body: { message, conversationId, ...(attachments.length ? { attachments } : {}) },
  });
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    throw new Error(typeof body?.error === 'string' ? body.error : 'Coach could not complete that request.');
  }
  if (error) throw error;
  const response = coachResponseSchema.parse(data);

  // The Edge function persists the messages. Keep the existing conversation
  // summary sorted by its most recent successful exchange without making a
  // failed timestamp refresh look like a failed Coach response.
  await supabase.from('ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', response.conversationId);

  return response;
}

export async function applyCoachGoalUpdate(messageId: string, action: CoachGoalAction) {
  // confirm_coach_goal_update has no argument defaults, so both nullable args must be sent
  // explicitly. The generated Args type drops `| null` from nullable parameters.
  const { data, error } = await supabase.rpc('confirm_coach_goal_update', {
    target_message_id: messageId,
    target_goal_type: action.goalType,
    target_notes: action.notes,
    expected_goal_id: action.currentGoalId ?? null,
  } as never);
  if (error) throw error;
  return data;
}

export async function dismissCoachGoalUpdate(messageId: string) {
  const { error } = await supabase.rpc('dismiss_coach_goal_update', { target_message_id: messageId });
  if (error) throw error;
}
