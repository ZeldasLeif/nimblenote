// Delete by dragging: long-press a title, an item or a card and drop it on the trash can that appears
// under the settings button. A quick tap keeps doing the element's normal action (rename, edit, open).

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View, type ViewStyle, type StyleProp } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from './theme';

export type TrashTarget =
  | { kind: 'category'; id: number; label: string }
  | { kind: 'entry'; id: number; label: string }
  | { kind: 'note'; id: number; label: string };

type Rect = { x: number; y: number; w: number; h: number };

interface TrashApi {
  rect: SharedValue<Rect>;
  hot: SharedValue<number>;
  gx: SharedValue<number>;
  gy: SharedValue<number>;
  begin: (label: string) => void;
  end: () => void;
  drop: (target: TrashTarget) => void;
}

const TrashContext = createContext<TrashApi | null>(null);
const HIT_SLOP = 28;
const LONG_PRESS_MS = 380;

/** Owns the trash can and the floating label. Render `overlay` last so it sits above everything. */
export function useTrashHost(opts: { confirm: boolean; remove: (t: TrashTarget) => void; topOffset: number }) {
  const rect = useSharedValue<Rect>({ x: -1000, y: -1000, w: 0, h: 0 });
  const hot = useSharedValue(0);
  const gx = useSharedValue(0);
  const gy = useSharedValue(0);
  const [dragging, setDragging] = useState<string | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const drop = useCallback((target: TrashTarget) => {
    const { confirm, remove } = optsRef.current;
    if (!confirm) return remove(target);
    Alert.alert('Remove?', `Are you sure you want to remove “${target.label}”?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'OK', style: 'destructive', onPress: () => remove(target) },
    ]);
  }, []);

  const api = useMemo<TrashApi>(() => ({
    rect, hot, gx, gy, drop,
    begin: (label: string) => setDragging(label),
    end: () => setDragging(null),
  }), [rect, hot, gx, gy, drop]);

  const overlay = dragging !== null ? <TrashOverlay api={api} label={dragging} topOffset={opts.topOffset} /> : null;
  return { api, overlay, Provider: TrashContext.Provider };
}

function TrashOverlay({ api, label, topOffset }: { api: TrashApi; label: string; topOffset: number }) {
  const t = useTheme();
  const can = useRef<View>(null);
  const canStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(api.hot.value ? 1.18 : 1, { duration: 120 }) }],
    backgroundColor: api.hot.value ? t.danger : t.surface,
  }));
  const ghostStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: api.gx.value - 90 }, { translateY: api.gy.value - 64 }],
  }));
  const ink = t.danger;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        ref={can}
        onLayout={() => can.current?.measureInWindow((x, y, w, h) => { api.rect.value = { x, y, w, h }; })}
        style={[styles.can, { top: topOffset, boxShadow: t.shadow }, canStyle]}
        accessibilityLabel="Trash"
      >
        <TrashIcon color={ink} />
      </Animated.View>
      <Animated.View style={[styles.ghost, { backgroundColor: t.surface, boxShadow: t.shadow }, ghostStyle]}>
        <Text style={{ color: t.text, fontSize: 15, textAlign: 'center' }} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </View>
  );
}

/** A small trash can drawn with views (no icon font needed). */
function TrashIcon({ color }: { color: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 8, height: 3, borderTopLeftRadius: 2, borderTopRightRadius: 2, backgroundColor: color }} />
      <View style={{ width: 22, height: 3, borderRadius: 1.5, backgroundColor: color, marginTop: 1 }} />
      <View style={{ width: 17, height: 19, marginTop: 2, borderWidth: 2.5, borderTopWidth: 0, borderColor: color, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, flexDirection: 'row', justifyContent: 'space-evenly', paddingTop: 3 }}>
        <View style={{ width: 2, height: 11, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ width: 2, height: 11, backgroundColor: color, borderRadius: 1 }} />
      </View>
    </View>
  );
}

/**
 * Long-press (~0.4 s) to pick up and drag to the trash; a quick tap calls onTap.
 * While lifted, the original dims and a label follows the finger above everything else.
 */
export function Draggable({ target, onTap, children, style, testID }: {
  target: TrashTarget;
  onTap?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const api = useContext(TrashContext);
  const lifted = useSharedValue(0);
  const targetRef = useRef(target);
  targetRef.current = target;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const gesture = useMemo(() => {
    if (!api) return Gesture.Tap().enabled(false);
    const inside = (x: number, y: number) => {
      'worklet';
      const r = api.rect.value;
      return x >= r.x - HIT_SLOP && x <= r.x + r.w + HIT_SLOP && y >= r.y - HIT_SLOP && y <= r.y + r.h + HIT_SLOP;
    };
    // Refs are only read on the JS thread: worklets just call these functions.
    // (Touching a ref inside a worklet freezes it, and the next render's update then warns.)
    const beginDrag = () => api.begin(targetRef.current.label);
    const fireDrop = () => api.drop(targetRef.current);
    const fireTap = () => onTapRef.current?.();
    const pan = Gesture.Pan()
      .withTestId(testID ? `${testID}-drag` : 'drag')
      .activateAfterLongPress(LONG_PRESS_MS)
      .onStart((e) => {
        lifted.value = 1;
        api.gx.value = e.absoluteX;
        api.gy.value = e.absoluteY;
        scheduleOnRN(beginDrag);
      })
      .onUpdate((e) => {
        api.gx.value = e.absoluteX;
        api.gy.value = e.absoluteY;
        api.hot.value = inside(e.absoluteX, e.absoluteY) ? 1 : 0;
      })
      .onEnd((e) => {
        if (inside(e.absoluteX, e.absoluteY)) scheduleOnRN(fireDrop);
      })
      .onFinalize(() => {
        lifted.value = 0;
        api.hot.value = 0;
        scheduleOnRN(api.end);
      });
    const tap = Gesture.Tap()
      .withTestId(testID ? `${testID}-tap` : 'tap')
      .maxDuration(LONG_PRESS_MS)
      .onEnd((_e, success) => {
        if (success) scheduleOnRN(fireTap);
      });
    return Gesture.Race(pan, tap);
  }, [api, lifted, testID]);

  const dim = useAnimatedStyle(() => ({ opacity: lifted.value ? 0.35 : 1 }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[style, dim]} collapsable={false}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  can: {
    position: 'absolute', right: 16, width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
  },
  ghost: {
    position: 'absolute', left: 0, top: 0, width: 180, minHeight: 44, borderRadius: 14,
    paddingHorizontal: 14, justifyContent: 'center',
  },
});
