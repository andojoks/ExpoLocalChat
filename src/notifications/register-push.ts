import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const EXPO_PUSH_TOKEN_KEY = 'qb_expo_push_token';
const PUSH_CHANNEL_ID = 'default';

const memory = new Map<string, string>();

async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    memory.set(key, value);
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (memory.has(key)) return memory.get(key) || null;
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

function projectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ||
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
  );
}

async function ensureAndroidPushChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'General',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250],
    lightColor: '#0548E8',
  });
}

export async function getCachedExpoPushToken(): Promise<string | null> {
  return (await getItem(EXPO_PUSH_TOKEN_KEY))?.trim() || null;
}

export async function setCachedExpoPushToken(token: string): Promise<void> {
  await setItem(EXPO_PUSH_TOKEN_KEY, token.trim());
}

export type RegisterPushOptions = {
  /** When true, may show the OS permission dialog. Default false. */
  requestPermission?: boolean;
};

/**
 * Deferred Expo push registration (docs order: Android channel → permissions → token).
 * Safe to call after UI is interactive; does not run on cold-start splash.
 */
export async function registerForPushNotificationsAsync(
  opts: RegisterPushOptions = {},
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;

  try {
    await ensureAndroidPushChannel();

    const current = await Notifications.getPermissionsAsync();
    let granted =
      current.granted ||
      current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

    if (!granted && opts.requestPermission) {
      const asked = await Notifications.requestPermissionsAsync();
      granted =
        asked.granted ||
        asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    }

    if (!granted) return null;

    const pid = projectId();
    if (pid) {
      try {
        const expoToken = await Notifications.getExpoPushTokenAsync({ projectId: pid });
        const data = expoToken.data?.trim();
        if (data) {
          await setCachedExpoPushToken(data);
          return data;
        }
      } catch {
        /* fall through to native */
      }
    }

    try {
      const native = await Notifications.getDevicePushTokenAsync();
      const data =
        typeof native.data === 'string' ? native.data.trim() : String(native.data || '').trim();
      if (data) {
        const token = `native:${Platform.OS}:${data}`;
        await setCachedExpoPushToken(token);
        return token;
      }
    } catch {
      /* simulator / missing push config */
    }
  } catch {
    /* ignore */
  }
  return null;
}

let registerInFlight: Promise<string | null> | null = null;

/** Fire-and-forget register when permission already granted (no OS prompt). */
export function registerPushInBackground(opts: RegisterPushOptions = {}) {
  if (registerInFlight) return;
  registerInFlight = (async () => {
    try {
      return await registerForPushNotificationsAsync(opts);
    } catch {
      return null;
    } finally {
      registerInFlight = null;
    }
  })();
}
