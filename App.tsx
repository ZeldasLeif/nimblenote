import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { initStore, useAppState } from './src/services/appStore';
import { forgetAuth } from './src/services/auth';
import { Home } from './src/ui/Home';
import { LockScreen } from './src/ui/LockScreen';
import { makeMotion, MotionContext, useEffectiveMotion } from './src/ui/motion';
import { DARK, DISPLAY_FONT, LIGHT, ThemeContext } from './src/ui/theme';

const RELOCK_AFTER_MS = 5 * 60 * 1000;

export default function App() {
  const state = useAppState();
  const system = useColorScheme();
  const base = state.settings.theme === 'system' ? (system === 'dark' ? DARK : LIGHT) : state.settings.theme === 'dark' ? DARK : LIGHT;
  // The serif loads from the app bundle in the background; nothing waits for it (system serif until then).
  const [fontsLoaded] = useFonts({ [DISPLAY_FONT]: Fraunces_600SemiBold });
  const palette = useMemo(() => (fontsLoaded ? { ...base, display: DISPLAY_FONT } : base), [base, fontsLoaded]);
  const motionMode = useEffectiveMotion(state.settings.animations);
  const motion = useMemo(() => makeMotion(motionMode), [motionMode]);

  // Window color behind the (edge-to-edge) system bars: a deeper tone of the paper, never white.
  useEffect(() => { SystemUI.setBackgroundColorAsync(palette.chrome).catch(() => {}); }, [palette.chrome]);

  // Storage opens after the first frame; the input is usable immediately.
  useEffect(() => { void initStore(); }, []);

  // Optional app lock: on cold start (once settings are loaded) and after 5 minutes in the background.
  const [locked, setLocked] = useState(false);
  const lockChecked = useRef(false);
  const backgroundAt = useRef<number | null>(null);
  useEffect(() => {
    if (state.ready && !lockChecked.current) {
      lockChecked.current = true;
      if (state.settings.lockEnabled) setLocked(true);
    }
  }, [state.ready, state.settings.lockEnabled]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        backgroundAt.current = Date.now();
        forgetAuth();
      } else if (s === 'active' && backgroundAt.current !== null) {
        const away = Date.now() - backgroundAt.current;
        backgroundAt.current = null;
        if (state.settings.lockEnabled && away > RELOCK_AFTER_MS) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [state.settings.lockEnabled]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* initialWindowMetrics: render the first frame immediately instead of waiting for native insets. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <KeyboardProvider>
        <ThemeContext.Provider value={palette}>
          <MotionContext.Provider value={motion}>
            <View style={{ flex: 1, backgroundColor: palette.bg }}>
              {locked ? <LockScreen onUnlock={() => setLocked(false)} /> : <Home reduceMotion={motionMode === 'off' && state.settings.animations !== 'off'} />}
            </View>
            <StatusBar style={palette.dark ? 'light' : 'dark'} />
          </MotionContext.Provider>
        </ThemeContext.Provider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
