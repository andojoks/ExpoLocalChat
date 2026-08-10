import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = 'qb_device_id';
const EXPO_PUSH_TOKEN_KEY = 'qb_expo_push_token';

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

/** Human-readable device label for admin / sign-out messaging. */
export function getDeviceTypeLabel(): string {
  const os = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS;
  const model = Device.modelName || Device.modelId || 'device';
  return `${os} · ${model}`;
}

/** Stable hardware / install id — never overwritten by Expo push token. */
async function resolveHardwareDeviceId(): Promise<string> {
  try {
    if (Platform.OS === 'android') {
      const id = Application.getAndroidId()?.trim();
      if (id) return `android:${id}`;
    }
    if (Platform.OS === 'ios') {
      const id = (await Application.getIosIdForVendorAsync())?.trim();
      if (id) return `ios:${id}`;
    }
  } catch {
    /* fall through */
  }

  const parts = [
    Platform.OS,
    Device.osName || 'os',
    Device.modelId || Device.modelName || 'model',
    Device.osInternalBuildId || Device.osBuildId || 'build',
  ];
  const entropy = await Crypto.randomUUID();
  return `install:${parts.join(':')}:${entropy}`;
}

async function resolveExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    if (Device.isDevice) {
      const permissions = await Notifications.getPermissionsAsync();
      if (permissions.status !== 'granted') {
        await Notifications.requestPermissionsAsync();
      }
    }

    const pid = projectId();
    if (pid) {
      try {
        const expoToken = await Notifications.getExpoPushTokenAsync({ projectId: pid });
        const data = expoToken.data?.trim();
        if (data) return data;
      } catch {
        /* fall through */
      }
    }

    try {
      const native = await Notifications.getDevicePushTokenAsync();
      const data =
        typeof native.data === 'string' ? native.data.trim() : String(native.data || '').trim();
      if (data) return `native:${Platform.OS}:${data}`;
    } catch {
      /* simulator / missing push config */
    }
  } catch {
    /* ignore */
  }
  return null;
}

let pushRefreshInFlight: Promise<string | null> | null = null;

/** Refresh Expo push token in the background; does not change device id. */
export function refreshExpoPushTokenInBackground() {
  if (pushRefreshInFlight) return;
  pushRefreshInFlight = (async () => {
    try {
      const token = await resolveExpoPushToken();
      if (token) await setItem(EXPO_PUSH_TOKEN_KEY, token);
      return token;
    } catch {
      return null;
    } finally {
      pushRefreshInFlight = null;
    }
  })();
}

export async function getExpoPushTokenCached(): Promise<string | null> {
  const cached = (await getItem(EXPO_PUSH_TOKEN_KEY))?.trim() || null;
  if (!cached) refreshExpoPushTokenInBackground();
  return cached;
}

/**
 * Stable per-install device id for single-device auth binding.
 * Kept separate from Expo push token storage.
 */
export async function getStableDeviceId(): Promise<string> {
  const cached = (await getItem(DEVICE_ID_KEY))?.trim() || null;
  // Migrate legacy values that stored a push token as device id
  if (cached) {
    if (
      cached.startsWith('ExponentPushToken') ||
      cached.startsWith('ExpoPushToken') ||
      cached.startsWith('native:')
    ) {
      await setItem(EXPO_PUSH_TOKEN_KEY, cached);
      const hardware = await resolveHardwareDeviceId();
      await setItem(DEVICE_ID_KEY, hardware);
      refreshExpoPushTokenInBackground();
      return hardware;
    }
    refreshExpoPushTokenInBackground();
    return cached;
  }

  const id = await resolveHardwareDeviceId();
  await setItem(DEVICE_ID_KEY, id);
  refreshExpoPushTokenInBackground();
  return id;
}

export type DeviceAuthPayload = {
  deviceId: string;
  expoPushToken?: string;
  deviceType: string;
  devicePublicKey?: string;
};

/** Collect device id, optional push token, and device type for auth APIs. */
export async function collectDeviceAuthFields(
  devicePublicKey?: string,
): Promise<DeviceAuthPayload> {
  const [deviceId, expoPushToken] = await Promise.all([
    getStableDeviceId(),
    getExpoPushTokenCached(),
  ]);
  return {
    deviceId,
    deviceType: getDeviceTypeLabel(),
    ...(expoPushToken ? { expoPushToken } : {}),
    ...(devicePublicKey ? { devicePublicKey } : {}),
  };
}
