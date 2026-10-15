// Motion policy. Animations only soften appearance: content is rendered and interactive on the first frame.
// All animations are Reanimated layout animations (UI thread), so typing on the JS thread is unaffected.
// The input field, keyboard and cursor are never animated.

import { createContext, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { FadeIn, FadeInDown, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import type { AnimationPref } from '../data/store';

export type MotionMode = AnimationPref; // 'smooth' | 'minimal' | 'off'

/** OS "remove animations / reduce motion" forces Off. */
export function useEffectiveMotion(pref: AnimationPref): MotionMode {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce ? 'off' : pref;
}

const RM = ReduceMotion.System;

export function makeMotion(mode: MotionMode) {
  if (mode === 'off') {
    return { card: undefined, peek: undefined, item: undefined, itemExit: undefined, layout: undefined, toast: undefined, toastExit: undefined, highlightMs: 0 };
  }
  if (mode === 'minimal') {
    return {
      card: FadeIn.duration(90).reduceMotion(RM),
      peek: undefined, // text swaps instantly
      item: FadeIn.duration(90).reduceMotion(RM),
      itemExit: FadeOut.duration(80).reduceMotion(RM),
      layout: undefined,
      toast: FadeIn.duration(90).reduceMotion(RM),
      toastExit: FadeOut.duration(80).reduceMotion(RM),
      highlightMs: 500,
    };
  }
  return {
    card: FadeIn.duration(120).reduceMotion(RM),
    peek: FadeIn.duration(70).reduceMotion(RM), // very short crossfade-in; never an exit, so nothing stacks while typing
    item: FadeInDown.duration(170).reduceMotion(RM),
    itemExit: FadeOut.duration(140).reduceMotion(RM),
    layout: LinearTransition.duration(170).reduceMotion(RM), // collapse after delete
    toast: FadeInDown.duration(150).reduceMotion(RM),
    toastExit: FadeOut.duration(120).reduceMotion(RM),
    highlightMs: 900,
  };
}

export type Motion = ReturnType<typeof makeMotion>;
export const MotionContext = createContext<Motion>(makeMotion('smooth'));
export const useMotion = () => useContext(MotionContext);
