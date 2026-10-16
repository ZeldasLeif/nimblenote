// Swipe left anywhere on what is shown to throw it off the screen. Only hides it from view; nothing is deleted.

import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useMotion } from './motion';

const THROW_DISTANCE = 90;
const THROW_VELOCITY = 700;

export function SwipeAway({ onDismiss, children, testID = 'swipe-away' }: { onDismiss: () => void; children: ReactNode; testID?: string }) {
  const { width } = useWindowDimensions();
  const motion = useMotion();
  const animate = motion.highlightMs > 0; // Off mode: dismiss without motion
  const x = useSharedValue(0);

  const pan = Gesture.Pan()
    .withTestId(testID)
    .activeOffsetX(-12) // only leftward drags start the gesture
    .failOffsetY([-12, 12]) // vertical drags keep scrolling
    .onUpdate((e) => {
      x.value = Math.min(0, e.translationX);
    })
    .onEnd((e) => {
      const thrown = e.translationX < -THROW_DISTANCE || e.velocityX < -THROW_VELOCITY;
      if (!thrown) {
        x.value = animate ? withSpring(0, { damping: 18, stiffness: 220 }) : 0;
        return;
      }
      if (!animate) {
        scheduleOnRN(onDismiss);
        return;
      }
      // Throw: keep the release velocity, slight rotation, fade out.
      x.value = withTiming(-width * 1.1, { duration: 180 }, (done) => {
        if (done) scheduleOnRN(onDismiss);
      });
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${x.value / 40}deg` }],
    opacity: 1 + Math.max(-0.8, x.value / (width * 0.9)),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ flex: 1 }, style]} collapsable={false}>{children}</Animated.View>
    </GestureDetector>
  );
}
