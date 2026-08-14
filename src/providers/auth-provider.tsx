import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { supabase } from '@/lib/supabase/client';
import { useActiveWorkoutStore } from '@/store/active-workout-store';

type AuthContextValue = {
  isLoading: boolean;
  isOnboarded: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  session: Session | null;
  user: User | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);
type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error';

const PROFILE_LOAD_ATTEMPTS = 2;
const PROFILE_RETRY_DELAY_MS = 250;

function waitForRetry() {
  return new Promise<void>((resolve) => setTimeout(resolve, PROFILE_RETRY_DELAY_MS));
}

export function AuthProvider({ children }: PropsWithChildren) {
  const clearActiveWorkout = useActiveWorkoutStore((state) => state.clear);
  const scopeActiveWorkoutToUser = useActiveWorkoutStore((state) => state.scopeToUser);
  const [session, setSession] = useState<Session | null>(null);
  const [isSessionResolved, setIsSessionResolved] = useState(false);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');
  const mountedRef = useRef(false);
  const sessionResolvedRef = useRef(false);
  const sessionUserIdRef = useRef<string | null>(null);
  const profileRequestIdRef = useRef(0);
  const profileStatusRef = useRef<ProfileStatus>('idle');

  const updateProfileStatus = useCallback((status: ProfileStatus) => {
    profileStatusRef.current = status;
    setProfileStatus(status);
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    const requestId = ++profileRequestIdRef.current;
    updateProfileStatus('loading');
    setProfileError(null);

    let lastError: unknown;
    for (let attempt = 0; attempt < PROFILE_LOAD_ATTEMPTS; attempt += 1) {
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed_at')
        .eq('id', userId)
        .maybeSingle();

      if (!error) {
        if (mountedRef.current && profileRequestIdRef.current === requestId) {
          setIsOnboarded(Boolean(data?.onboarding_completed_at));
          updateProfileStatus('ready');
        }
        return;
      }

      lastError = error;
      if (attempt + 1 < PROFILE_LOAD_ATTEMPTS) await waitForRetry();
    }

    if (mountedRef.current && profileRequestIdRef.current === requestId) {
      setProfileError("We couldn't load your setup. Check your connection and try again.");
      updateProfileStatus('error');
    }
    throw lastError;
  }, [updateProfileStatus]);

  const applySession = useCallback(async (nextSession: Session | null) => {
    if (!mountedRef.current) return;

    const nextUserId = nextSession?.user.id ?? null;
    const previousUserId = sessionUserIdRef.current;
    scopeActiveWorkoutToUser(nextUserId);
    sessionUserIdRef.current = nextUserId;
    sessionResolvedRef.current = true;
    setSession(nextSession);
    setIsSessionResolved(true);

    if (!nextUserId) {
      profileRequestIdRef.current += 1;
      clearActiveWorkout();
      setIsOnboarded(false);
      setProfileError(null);
      updateProfileStatus('idle');
      return;
    }

    if (previousUserId !== nextUserId) {
      if (previousUserId) clearActiveWorkout();
      setIsOnboarded(false);
      setProfileError(null);
      updateProfileStatus('idle');
    } else if (profileStatusRef.current === 'loading' || profileStatusRef.current === 'ready') {
      return;
    }

    try {
      await loadProfile(nextUserId);
    } catch {
      // loadProfile exposes a retryable, non-sensitive error through context.
    }
  }, [clearActiveWorkout, loadProfile, scopeActiveWorkoutToUser, updateProfileStatus]);

  useEffect(() => useActiveWorkoutStore.persist.onFinishHydration(() => {
    scopeActiveWorkoutToUser(sessionUserIdRef.current);
  }), [scopeActiveWorkoutToUser]);

  const refreshProfile = useCallback(async () => {
    const userId = sessionUserIdRef.current;
    if (!userId) return;
    await loadProfile(userId);
  }, [loadProfile]);

  useEffect(() => {
    mountedRef.current = true;
    if (profileStatusRef.current === 'loading') profileStatusRef.current = 'idle';
    let cancelled = false;
    let receivedAuthEvent = false;

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true;
      void applySession(nextSession);
    });

    async function initializeSession() {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled || receivedAuthEvent || !mountedRef.current) return;
      if (error) {
        if (!sessionResolvedRef.current) {
          sessionResolvedRef.current = true;
          setIsSessionResolved(true);
          setSession(null);
        } else if (sessionUserIdRef.current) {
          setProfileError("We couldn't restore your session. Check your connection and try again.");
          updateProfileStatus('error');
        }
        return;
      }
      await applySession(data.session);
    }

    void initializeSession();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      profileRequestIdRef.current += 1;
      listener.subscription.unsubscribe();
    };
  }, [applySession, updateProfileStatus]);

  const isLoading = !isSessionResolved || profileStatus === 'loading';

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      isOnboarded,
      profileError,
      refreshProfile,
      session,
      user: session?.user ?? null,
    }),
    [isLoading, isOnboarded, profileError, refreshProfile, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
