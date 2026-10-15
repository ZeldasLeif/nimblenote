import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { store, useAppState } from '../services/appStore';
import { cancelTimer } from '../services/timers';
import { countdown } from './format';
import { RADIUS, SPACE, useTheme } from './theme';

/** Active timers with a live countdown. Only this component re-renders every second. */
export function TimersStrip() {
  const t = useTheme();
  const s = useAppState();
  const active = s.timers.filter((x) => !x.done);
  const [now, setNow] = useState(Date.now());
  const finished = useRef(new Set<number>());

  useEffect(() => {
    if (active.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active.length]);

  useEffect(() => {
    for (const timer of active) {
      if (timer.firesAt <= now && !finished.current.has(timer.id)) {
        finished.current.add(timer.id);
        void store.finishTimer(timer.id);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }
  }, [now, active]);

  if (active.length === 0) return null;
  return (
    <View style={styles.strip}>
      {active.map((x) => (
        <View key={x.id} style={[styles.timer, { backgroundColor: t.accentSoft }]}>
          <Text style={[styles.time, { color: t.accent }]}>{countdown(x.firesAt - now)}</Text>
          {x.label ? <Text style={[styles.label, { color: t.text }]} numberOfLines={1}>{x.label}</Text> : null}
          <Pressable onPress={() => cancelTimer(x.id)} hitSlop={12} accessibilityLabel="Cancel timer" style={styles.x}>
            <Text style={{ color: t.muted, fontSize: 16 }}>×</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACE.l, paddingTop: SPACE.s, gap: SPACE.s },
  timer: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.m, paddingLeft: SPACE.m, minHeight: 36, maxWidth: '100%' },
  time: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  label: { fontSize: 14, marginLeft: SPACE.s, flexShrink: 1 },
  x: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
