import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  applyCoachGoalUpdate,
  dismissCoachGoalUpdate,
  getCoachConversation,
  getCoachConversations,
  sendCoachMessage,
  type CoachGoalAction,
} from '@/features/coach/api/coach';

export const coachKeys = {
  all: ['coach'] as const,
  conversations: ['coach', 'conversations'] as const,
  conversation: (conversationId: string) => ['coach', 'conversation', conversationId] as const,
};

export function useCoachConversations() {
  return useQuery({ queryKey: coachKeys.conversations, queryFn: getCoachConversations });
}

export function useCoachConversation(conversationId: string | null) {
  return useQuery({
    queryKey: coachKeys.conversation(conversationId ?? 'new'),
    queryFn: () => {
      if (!conversationId) throw new Error('A conversation is required.');
      return getCoachConversation(conversationId);
    },
    enabled: Boolean(conversationId),
  });
}

export function useSendCoachMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ message, conversationId, attachments }: { message: string; conversationId: string | null; attachments?: string[] }) => sendCoachMessage(message, conversationId, attachments),
    onSuccess: (result) => result.uiAction?.type === 'review_routine'
      ? Promise.all([
          client.invalidateQueries({ queryKey: ['routines'] }),
          client.invalidateQueries({ queryKey: ['today'] }),
        ])
      : undefined,
    onSettled: () => client.invalidateQueries({ queryKey: coachKeys.all }),
  });
}

export function useApplyCoachGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, action }: { messageId: string; action: CoachGoalAction }) => applyCoachGoalUpdate(messageId, action),
    onSuccess: () => Promise.all([
      client.invalidateQueries({ queryKey: ['today'] }),
      client.invalidateQueries({ queryKey: ['settings'] }),
      client.invalidateQueries({ queryKey: coachKeys.all }),
    ]),
  });
}

export function useDismissCoachGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: dismissCoachGoalUpdate,
    onSuccess: () => client.invalidateQueries({ queryKey: coachKeys.all }),
  });
}
