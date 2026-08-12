import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  getCachedExpoPushToken,
  setCachedExpoPushToken,
} from '@/notifications/register-push';

const DEVICE_ID_KEY = 'qb_device_id';

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

/** Cached Expo push token only — never triggers permission or network on cold start. */
export async function getExpoPushTokenCached(): Promise<string | null> {
  return getCachedExpoPushToken();
}

/**
 * Stable per-install device id for single-device auth binding.
 * Kept separate from Expo push token storage. Push registration is deferred.
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
      await setCachedExpoPushToken(cached);
      const hardware = await resolveHardwareDeviceId();
      await setItem(DEVICE_ID_KEY, hardware);
      return hardware;
    }
    return cached;
  }

  const id = await resolveHardwareDeviceId();
  await setItem(DEVICE_ID_KEY, id);
  return id;
}

export type DeviceAuthPayload = {
  deviceId: string;
  expoPushToken?: string;
  deviceType: string;
  devicePublicKey?: string;
};

/** Collect device id, optional cached push token, and device type for auth APIs. */
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
