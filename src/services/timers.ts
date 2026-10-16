// Timers and alarms as scheduled local notifications (works in Expo Go; remote push is not used).
// Only the local-notification parts of expo-notifications are imported. Its package index also loads
// push-token registration and topic subscription, which Expo Go on Android lacks (that caused the
// "Cannot find native module 'ExpoTopicSubscriptionModule'" error and the push warning).
// Loaded on first use so it costs nothing at cold start.

import { Platform } from 'react-native';
import { store } from './appStore';

async function load() {
  const [handler, permissions, schedule, cancel, channel, channelTypes, types] = await Promise.all([
    import('expo-notifications/build/NotificationsHandler'),
    import('expo-notifications/build/NotificationPermissions'),
    import('expo-notifications/build/scheduleNotificationAsync'),
    import('expo-notifications/build/cancelScheduledNotificationAsync'),
    import('expo-notifications/build/setNotificationChannelAsync'),
    import('expo-notifications/build/NotificationChannelManager.types'),
    import('expo-notifications/build/Notifications.types'),
  ]);
  return {
    setNotificationHandler: handler.setNotificationHandler,
    getPermissionsAsync: permissions.getPermissionsAsync,
    requestPermissionsAsync: permissions.requestPermissionsAsync,
    scheduleNotificationAsync: schedule.scheduleNotificationAsync,
    cancelScheduledNotificationAsync: cancel.cancelScheduledNotificationAsync,
    setNotificationChannelAsync: channel.setNotificationChannelAsync,
    AndroidImportance: channelTypes.AndroidImportance,
    SchedulableTriggerInputTypes: types.SchedulableTriggerInputTypes,
  };
}
let mod: ReturnType<typeof load> | null = null;
const notifications = () => (mod ??= load());

const CHANNEL = 'timers';
let prepared = false;

async function prepare(): Promise<boolean> {
  const Notifications = await notifications();
  if (!prepared) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Timers and alarms',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 400, 200, 400],
        sound: 'default',
      });
    }
    prepared = true;
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export type TimerResult = { ok: true; notified: boolean } | { ok: false; message: string };

export async function startTimer(label: string, firesAt: number): Promise<TimerResult> {
  let notificationId: string | null = null;
  let notified = false;
  try {
    if (await prepare()) {
      const Notifications = await notifications();
      notificationId = await Notifications.scheduleNotificationAsync({
        content: { title: label || 'Timer', body: label ? 'Time is up' : 'Your timer is done' },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(firesAt),
          channelId: CHANNEL,
        },
      });
      notified = true;
    }
  } catch {
    notified = false;
  }
  await store.addTimer(label, firesAt, notificationId);
  return { ok: true, notified };
}

export async function cancelTimer(id: number): Promise<void> {
  const t = store.getState().timers.find((x) => x.id === id);
  if (t?.notificationId) {
    try { await (await notifications()).cancelScheduledNotificationAsync(t.notificationId); } catch { /* already fired */ }
  }
  await store.finishTimer(id);
}
