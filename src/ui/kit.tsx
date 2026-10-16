// Small shared UI primitives with large touch targets.

import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotion } from './motion';
import { RADIUS, SPACE, TOUCH, useTheme } from './theme';

export function Chip({ label, onPress, active, tone }: { label: string; onPress: () => void; active?: boolean; tone?: 'danger' }) {
  const t = useTheme();
  const bg = tone === 'danger' ? t.dangerSoft : active ? t.accent : t.surfaceAlt;
  const fg = tone === 'danger' ? t.danger : active ? t.accentText : t.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => [styles.chip, { backgroundColor: bg, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[styles.chipText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: t.surfaceAlt }]}>
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.segmentItem, on && { backgroundColor: t.surface, borderColor: t.border }]}
          >
            <Text style={[styles.segmentText, { color: on ? t.text : t.muted, fontWeight: on ? '600' : '400' }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.section, { color: t.muted }]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>{children}</View>;
}

export function Button({ label, onPress, tone, disabled }: { label: string; onPress: () => void; tone?: 'accent' | 'danger' | 'plain'; disabled?: boolean }) {
  const t = useTheme();
  const bg = tone === 'accent' ? t.accent : tone === 'danger' ? t.dangerSoft : t.surfaceAlt;
  const fg = tone === 'accent' ? t.accentText : tone === 'danger' ? t.danger : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Two columns meeting at an invisible vertical center line: the left text is right-aligned against it,
 * the right text left-aligned ("flour | 500g"). With no left text, the right text is simply centered.
 */
export function Axis({ left, right, leftStyle, rightStyle, selectableRight }: {
  left: ReactNode;
  right?: ReactNode;
  leftStyle?: StyleProp<TextStyle>;
  rightStyle?: StyleProp<TextStyle>;
  selectableRight?: boolean;
}) {
  if (left === null || left === undefined || left === '') {
    return <Text style={[styles.axisSolo, rightStyle]} selectable={selectableRight}>{right}</Text>;
  }
  return (
    <View style={styles.axis}>
      <Text style={[styles.axisLeft, leftStyle]}>{left}</Text>
      <View style={styles.axisGap} />
      <Text style={[styles.axisRight, rightStyle]} selectable={selectableRight}>{right ?? ''}</Text>
    </View>
  );
}

/** A brief background flash that confirms an item was just added or changed. Never blocks interaction. */
export function Flash({ on, children, style }: { on: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const motion = useMotion();
  const o = useSharedValue(0);
  useEffect(() => {
    if (!on || motion.highlightMs === 0) return;
    o.value = 1;
    o.value = withTiming(0, { duration: motion.highlightMs });
  }, [on, motion.highlightMs, o]);
  const overlay = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <View style={style}>
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: t.highlight, borderRadius: RADIUS.s }, overlay]} />
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { flexDirection: 'row', alignItems: 'baseline' },
  axisLeft: { flex: 1, textAlign: 'right' },
  axisGap: { width: 18 },
  axisRight: { flex: 1, textAlign: 'left' },
  axisSolo: { textAlign: 'center' },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center', marginRight: SPACE.s, marginBottom: SPACE.s },
  chipText: { fontSize: 15 },
  segment: { flexDirection: 'row', borderRadius: RADIUS.m, padding: 3 },
  segmentItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.s, borderWidth: 1, borderColor: 'transparent' },
  segmentText: { fontSize: 14 },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: SPACE.xl, marginBottom: SPACE.s },
  card: { borderRadius: RADIUS.l, borderWidth: StyleSheet.hairlineWidth, padding: SPACE.l },
  button: { minHeight: TOUCH, paddingHorizontal: SPACE.l, borderRadius: RADIUS.m, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
