import Storage from 'expo-sqlite/kv-store';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const PREF_KEY = 'expertlearner:pref-study-reminders';
const STUDY_ID = 'daily-study-reminder';
const STREAK_ID = 'daily-streak-reminder';
const CHANNEL_ID = 'study-reminders';

const STUDY_HOUR = 8;
const STREAK_HOUR = 20;

let handlerConfigured = false;

export async function getStudyRemindersEnabled(): Promise<boolean> {
  try {
    const value = await Storage.getItem(PREF_KEY);
    // Default on when the preference has never been set.
    if (value == null) return true;
    return value === '1';
  } catch {
    return true;
  }
}

export async function setStudyRemindersEnabled(enabled: boolean): Promise<void> {
  await Storage.setItem(PREF_KEY, enabled ? '1' : '0');
}

export function ensureNotificationHandler() {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Study reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250],
  });
}

export async function requestReminderPermissions(): Promise<boolean> {
  ensureNotificationHandler();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const asked = await Notifications.requestPermissionsAsync();
  return (
    asked.granted ||
    asked.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function cancelStudyReminders(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(STUDY_ID);
  } catch {
    /* may not exist */
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_ID);
  } catch {
    /* may not exist */
  }
}

export async function scheduleStudyReminders(): Promise<void> {
  ensureNotificationHandler();
  await ensureAndroidChannel();
  await cancelStudyReminders();

  const channelId = Platform.OS === 'android' ? CHANNEL_ID : undefined;

  await Notifications.scheduleNotificationAsync({
    identifier: STUDY_ID,
    content: {
      title: 'Time to study',
      body: 'Open a paper for a few minutes — small sessions add up.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: STUDY_HOUR,
      minute: 0,
      ...(channelId ? { channelId } : {}),
    },
  });

  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_ID,
    content: {
      title: 'Keep your streak going',
      body: 'Study today so your streak doesn’t reset.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: STREAK_HOUR,
      minute: 0,
      ...(channelId ? { channelId } : {}),
    },
  });
}

/** Enable or disable reminders; returns whether they are now on. */
export async function setRemindersEnabled(enabled: boolean): Promise<boolean> {
  if (!enabled) {
    await cancelStudyReminders();
    await setStudyRemindersEnabled(false);
    return false;
  }
  const ok = await requestReminderPermissions();
  if (!ok) {
    await setStudyRemindersEnabled(false);
    return false;
  }
  await scheduleStudyReminders();
  await setStudyRemindersEnabled(true);
  return true;
}

/** Re-apply scheduled reminders after login if the preference is on. */
export async function syncStudyRemindersOnLaunch(): Promise<void> {
  ensureNotificationHandler();
  const enabled = await getStudyRemindersEnabled();
  if (!enabled) return;
  const ok = await requestReminderPermissions();
  if (!ok) return;
  await scheduleStudyReminders();
}
