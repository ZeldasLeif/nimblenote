// Timers and alarms as scheduled local notifications (works in Expo Go; remote push is not used).
// expo-notifications is loaded on first use so it costs nothing at cold start.

import { Platform } from 'react-native';
import { store } from './appStore';

type NotificationsModule = typeof import('expo-notifications');
let mod: Promise<NotificationsModule> | null = null;
const notifications = () => (mod ??= import('expo-notifications'));


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
          // Uses setAlarmClock() when the exact-alarm permission exists (development build);
          // otherwise Android falls back to best effort, which may be late by a little.
          delivery: 'alarmClock',
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
