import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { clientEnvironment } from '@/lib/env';
import type { Database } from '@/types/database';

const environment = clientEnvironment ?? {
  EXPO_PUBLIC_SUPABASE_URL: 'https://configuration-required.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'configuration-required',
};

const isStaticWebRender = Platform.OS === 'web' && typeof window === 'undefined';
const staticRenderStorage = {
  getItem: async (_key: string) => null,
  setItem: async (_key: string, _value: string) => undefined,
  removeItem: async (_key: string) => undefined,
};

class StaticRenderWebSocket {
  readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSING = 2; readonly CLOSED = 3;
  readonly readyState = 3; readonly protocol = ''; readonly url: string;
  onopen: ((event: Event) => unknown) | null = null; onmessage: ((event: MessageEvent) => unknown) | null = null; onclose: ((event: CloseEvent) => unknown) | null = null; onerror: ((event: Event) => unknown) | null = null;
  constructor(address: string | URL, _subprotocols?: string | string[]) { this.url = String(address); }
  close() {} send(_data: string | ArrayBufferLike | Blob | ArrayBufferView) {} addEventListener(_type: string, _listener: EventListener) {} removeEventListener(_type: string, _listener: EventListener) {}
}

export const supabase = createClient<Database>(
  environment.EXPO_PUBLIC_SUPABASE_URL,
  environment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: isStaticWebRender ? staticRenderStorage : AsyncStorage,
      autoRefreshToken: !isStaticWebRender,
      persistSession: !isStaticWebRender,
      detectSessionInUrl: false,
    },
    ...(isStaticWebRender ? { realtime: { transport: StaticRenderWebSocket } } : {}),
  },
);

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
