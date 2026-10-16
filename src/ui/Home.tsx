import { type ComponentRef, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
// Gesture-handler's ScrollView coordinates with the swipe and drag gestures (no scrolling while dragging).
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDuration } from '../core/duration';
import { confidentBest, type Scored, search } from '../core/match';
import { parse } from '../core/parse';
import { describe } from '../core/preview';
import type { Command } from '../core/types';
import { store, useAppState } from '../services/appStore';
import { currentLocation, type LocResult } from '../services/location';
import { takePhoto } from '../services/photos';
import { startTimer } from '../services/timers';
import { CategoryView } from './CategoryView';
import { useMotion } from './motion';
import { AnswerCard, CategoriesView, HelpView, LocView, NotesView } from './Panels';
import { SettingsView } from './SettingsView';
import { markFocused } from './startup';
import { SwipeAway } from './SwipeAway';
import { DARK, LIGHT, SPACE, TOUCH, useTheme } from './theme';
import { TimersStrip } from './TimersStrip';
import { type TrashTarget, useTrashHost } from './trash';

type ViewState =
  | { kind: 'home' }
  | { kind: 'library' }
  | { kind: 'card'; scored: Scored }
  | { kind: 'category'; id: number }
  | { kind: 'notes'; range: { start: number; end: number } | null; label: string }
  | { kind: 'loc'; loc: LocResult | 'loading' }
  | { kind: 'settings' }
  | { kind: 'help' };

type Toast = { id: number; message: string; undoable: boolean };

const PEEK_DEBOUNCE_MS = 150;
const TOAST_MS = 5000;
const LIBRARY_SWIPE = 60;
const TITLE_ROW = 48;

export function Home({ reduceMotion }: { reduceMotion: boolean }) {
  const t = useTheme();
  const motion = useMotion();
  const insets = useSafeAreaInsets();
  const state = useAppState();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [text, setText] = useState('');
  const [view, setView] = useState<ViewState>({ kind: 'home' });
  const [peek, setPeek] = useState<Scored | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [highlight, setHighlight] = useState<ReadonlySet<number>>(new Set());
  const dismissed = useRef<{ query: string; id: string } | null>(null);
  const busy = useRef(false);

  // The input sits directly on the keyboard: bottom padding follows the keyboard height on the UI thread.
  const keyboard = useReanimatedKeyboardAnimation();
  const bottomInset = insets.bottom;
  const dockStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(-keyboard.height.value, bottomInset) + SPACE.s,
  }));

  const say = useCallback((message: string, undoable = false) => setToast({ id: Date.now(), message, undoable }), []);
  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  // Delete by dragging onto the trash can (which appears under the settings button).
  const remove = useCallback(async (target: TrashTarget) => {
    try {
      const out = target.kind === 'category' ? await store.deleteCategory(target.id)
        : target.kind === 'note' ? await store.deleteNote(target.id)
        : await store.deleteEntry(target.id);
      say(out.message, out.undoable);
    } catch (e) {
      say(e instanceof Error ? e.message : 'Could not delete');
    }
  }, [say]);
  const trash = useTrashHost({
    confirm: state.settings.confirmDelete,
    remove,
    topOffset: insets.top + SPACE.m + TITLE_ROW + SPACE.s,
  });

  const category = view.kind === 'category' ? store.categoryById(view.id) : undefined;

  // Parsing is synchronous and pure: it runs on every keystroke.
  const cmd: Command = useMemo(() => parse(text, store.catalog()), [text, state.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = describe(cmd);
  const typing = text.trim().length > 0;

  // Live answer: debounced, and only shown when the match is clearly the answer.
  const readKey = cmd.kind === 'read' ? cmd.tokens.join(' ') : '';
  useEffect(() => {
    if (!state.settings.liveAnswers || cmd.kind !== 'read' || cmd.tokens.length === 0) {
      setPeek(null);
      return;
    }
    const tokens = cmd.tokens;
    const id = setTimeout(() => {
      let best = confidentBest(search(store.docs(), tokens, 5));
      const d = dismissed.current;
      if (best && d && d.query === readKey && d.id === best.doc.id) best = null; // swiped away for this query
      setPeek((prev) => (prev?.doc.id === best?.doc.id && prev?.doc.ts === best?.doc.ts ? prev : best));
    }, PEEK_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [readKey, state.version, state.settings.liveAnswers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (highlight.size === 0) return;
    const id = setTimeout(() => setHighlight(new Set()), 1500);
    return () => clearTimeout(id);
  }, [highlight]);

  // Keyboard up on launch and whenever the app returns to the foreground.
  useEffect(() => {
    const raf = requestAnimationFrame(focusInput);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setTimeout(focusInput, 50); });
    return () => { cancelAnimationFrame(raf); sub.remove(); };
  }, [focusInput]);

  const goHome = useCallback(() => {
    setView({ kind: 'home' });
    focusInput();
  }, [focusInput]);

  // New input always replaces what is on screen.
  const onChangeText = useCallback((next: string) => {
    setText(next);
    if (next.trim()) setView((v) => (v.kind === 'home' ? v : { kind: 'home' }));
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (view.kind !== 'home' || text) {
        setText('');
        setView({ kind: 'home' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [view.kind, text]);

  useEffect(() => {
    if (view.kind === 'category' && !store.categoryById(view.id)) setView({ kind: 'home' });
    if (view.kind === 'card' && !store.docs().some((d) => d.id === view.scored.doc.id)) setView({ kind: 'home' });
  }, [view, state.version]);

  const openScored = useCallback((s: Scored) => {
    const [kind, id] = s.doc.id.split(':');
    if (kind === 'n') {
      setView({ kind: 'notes', range: null, label: 'recent' });
      setHighlight(new Set([Number(id)]));
    } else if (kind === 'c') {
      setView({ kind: 'category', id: Number(id) });
    } else {
      const e = store.entryById(Number(id));
      if (e) {
        setView({ kind: 'category', id: e.categoryId });
        setHighlight(new Set([e.id]));
      }
    }
    setText('');
    focusInput();
  }, [focusInput]);

  const undo = useCallback(async () => {
    try {
      const label = await store.undo();
      say(label ? `Undone: ${label}` : 'Nothing to undo');
    } catch (e) {
      say(e instanceof Error ? e.message : 'Could not undo');
    }
  }, [say]);

  const submit = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await run(cmd);
    } catch (e) {
      say(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      busy.current = false;
    }
  };

  const run = async (c: Command) => {
    switch (c.kind) {
      case 'empty':
        if (view.kind !== 'home') goHome();
        return;
      case 'calc':
        if (c.result !== null) setText(c.result);
        return;
      case 'invalid':
        say(c.message);
        return;
      case 'read': {
        // Exactly one result: a list opens, anything else is shown as its card.
        const results = search(store.docs(), c.tokens, 5, false);
        const best = confidentBest(results) ?? results[0];
        if (!best) return say('Nothing found. Save something with “+ name value”.');
        setText('');
        setPeek(null);
        if (best.doc.kind === 'category') setView({ kind: 'category', id: Number(best.doc.id.slice(2)) });
        else setView({ kind: 'card', scored: best });
        return;
      }
      case 'write': {
        const out = await store.applyWrite(c);
        setText('');
        say(c.notes[0] ? `${out.message} · ${c.notes[0]}` : out.message, out.undoable);
        setHighlight(new Set(out.highlight ?? []));
        // Show the updated list as confirmation; the input stays a normal command line.
        if (out.categoryId) setView({ kind: 'category', id: out.categoryId });
        return;
      }
      case 'note-add': {
        const out = await store.addNote(c.text);
        setText('');
        say(out.message, true);
        setHighlight(new Set(out.highlight ?? []));
        return;
      }
      case 'note-query':
        setText('');
        setView({ kind: 'notes', range: c.range, label: c.label });
        return;
      case 'timer': {
        const firesAt = c.at ?? Date.now() + c.ms;
        const r = await startTimer(c.label, firesAt);
        setText('');
        const what = c.at ? 'Alarm' : 'Timer';
        say(r.ok && r.notified ? `${what} set · ${formatDuration(c.ms)}` : `${what} runs in the app only: notifications are off`);
        return;
      }
      case 'loc': {
        setText('');
        setView({ kind: 'loc', loc: 'loading' });
        const loc = await currentLocation(state.settings.reverseGeocode);
        setView((v) => (v.kind === 'loc' ? { kind: 'loc', loc } : v));
        return;
      }
      case 'photo': {
        const p = await takePhoto();
        if (!p.ok) return say(p.message);
        const id = await store.ensureCategory(c.category);
        const out = await store.setPhoto(id, p.uri);
        setText('');
        say(out.message, true);
        setView({ kind: 'category', id });
        return;
      }
      case 'list-categories':
        setText('');
        setView({ kind: 'library' });
        return;
      case 'open-category': {
        const cat = store.categoryByKey(c.key);
        if (!cat) return say(`Nothing called “${c.key}” yet`);
        setText('');
        setView({ kind: 'category', id: cat.id });
        return;
      }
      case 'settings':
        setText('');
        Keyboard.dismiss();
        setView({ kind: 'settings' });
        return;
      case 'help':
        setText('');
        setView({ kind: 'help' });
        return;
      case 'undo':
        setText('');
        await undo();
        return;
    }
  };

  // ---- The stage: exactly one thing on screen, swapped with a quick crossfade ----

  let stage: { key: string; node: ReactNode; top?: boolean } | null = null;
  if (typing) {
    if (state.settings.liveAnswers && cmd.kind === 'read' && peek) {
      stage = { key: `peek:${peek.doc.id}`, node: <View style={styles.cardPad}><AnswerCard s={peek} onOpen={openScored} /></View> };
    }
  } else {
    switch (view.kind) {
      case 'library': stage = { key: 'library', node: <CategoriesView onOpen={(id) => setView({ kind: 'category', id })} /> }; break;
      case 'card': stage = { key: `card:${view.scored.doc.id}`, node: <View style={styles.cardPad}><AnswerCard s={view.scored} onOpen={openScored} /></View> }; break;
      case 'category':
        if (category) {
          stage = {
            key: `category:${category.id}`,
            node: <CategoryView category={category} highlight={highlight} onMessage={say} onOpenCategory={(id) => setView({ kind: 'category', id })} />,
          };
        }
        break;
      case 'notes': stage = { key: `notes:${view.label}`, node: <NotesView notes={store.notesIn(view.range)} label={view.label} highlight={highlight} /> }; break;
      case 'loc': stage = { key: `loc:${view.loc === 'loading' ? 'loading' : 'done'}`, node: <LocView loc={view.loc} onSaveNote={async (s) => { const o = await store.addNote(s); say(o.message, true); }} /> }; break;
      case 'settings': stage = { key: 'settings', top: true, node: <SettingsView onMessage={say} reduceMotion={reduceMotion} /> }; break;
      case 'help': stage = { key: 'help', top: true, node: <HelpView /> }; break;
    }
  }

  // Swiping left on whatever is shown clears it from the screen (nothing is deleted).
  const dismissStage = useCallback(() => {
    if (text.trim()) {
      if (peek) dismissed.current = { query: readKey, id: peek.doc.id };
      setPeek(null);
    } else {
      setView({ kind: 'home' });
    }
  }, [text, peek, readKey]);

  // Swipe right on the empty home screen: your lists.
  const emptyHome = !stage && !typing;
  const librarySwipe = useMemo(() => Gesture.Pan()
    .withTestId('library-swipe')
    .enabled(emptyHome)
    .runOnJS(true)
    .activeOffsetX(24)
    .failOffsetY([-16, 16])
    .onEnd((e) => { if (e.translationX > LIBRARY_SWIPE) setView({ kind: 'library' }); }), [emptyHome]);

  return (
    <trash.Provider value={trash.api}>
      <View style={[styles.root, { backgroundColor: t.bg }]}>
        {/* System bar strips in a deeper paper tone. */}
        <View style={{ height: insets.top, backgroundColor: t.chrome }} />
        <View style={[styles.titleRow, { marginTop: SPACE.m }]}>
          <Pressable onPress={goHome} accessibilityRole="button" accessibilityLabel="NimbleNote, back to search" hitSlop={8}>
            <Text style={[styles.title, { color: t.text, fontFamily: t.display }]}>NimbleNote</Text>
          </Pressable>
          <Pressable
            onPress={() => (view.kind === 'settings' ? goHome() : setView({ kind: 'settings' }))}
            style={styles.gear}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
          >
            <Text style={{ color: t.muted, fontSize: 20 }}>{view.kind === 'settings' && !typing ? '×' : '⚙'}</Text>
          </Pressable>
        </View>

        <GestureDetector gesture={librarySwipe}>
          <View style={styles.stage} collapsable={false}>
            {stage ? (
              <Animated.View key={stage.key} entering={motion.swapIn} exiting={motion.swapOut} style={StyleSheet.absoluteFill}>
                <SwipeAway onDismiss={dismissStage} testID="stage-swipe">
                  <ScrollView
                    contentContainerStyle={[styles.scroll, !stage.top && styles.center]}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="none"
                  >
                    {stage.node}
                  </ScrollView>
                </SwipeAway>
              </Animated.View>
            ) : !typing ? (
              <Animated.View key="hint" entering={motion.swapIn} exiting={motion.swapOut} style={[StyleSheet.absoluteFill, styles.center]}>
                <HomeHint />
              </Animated.View>
            ) : null}
          </View>
        </GestureDetector>

        <Animated.View style={dockStyle}>
          <TimersStrip />
          {toast ? (
            <Animated.View key={toast.id} entering={motion.toast} exiting={motion.toastExit} style={[styles.toast, { backgroundColor: t.text }]}>
              <Text style={[styles.toastText, { color: t.bg }]} numberOfLines={2}>{toast.message}</Text>
              {toast.undoable ? (
                <Pressable onPress={() => { setToast(null); void undo(); }} style={styles.undo} accessibilityRole="button" hitSlop={8}>
                  <Text style={{ color: t.dark ? LIGHT.accent : DARK.accent, fontWeight: '700' }}>Undo</Text>
                </Pressable>
              ) : null}
            </Animated.View>
          ) : null}

          <View style={styles.previewSlot}>
            {preview?.note ? <Text style={[styles.previewNote, { color: t.warn }]} numberOfLines={1}>{preview.note}</Text> : null}
            {preview ? (
              <Text
                style={[
                  styles.preview,
                  { color: preview.tone === 'warn' ? t.warn : preview.tone === 'neutral' ? t.muted : t.accent },
                  preview.tone === 'calc' && styles.calc,
                ]}
                numberOfLines={2}
              >
                {preview.text}
              </Text>
            ) : null}
          </View>

          <View style={[styles.inputBar, { backgroundColor: t.surface, borderColor: t.border, boxShadow: t.shadow }]}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={onChangeText}
              onSubmitEditing={submit}
              onFocus={markFocused}
              placeholder="search · + to save · 5+5 · help"
              placeholderTextColor={t.faint}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
              importantForAutofill="no"
              returnKeyType="go"
              submitBehavior="submit"
              selectionColor={t.accent}
              style={[styles.input, { color: t.text }]}
              accessibilityLabel="Command input"
            />
            {text ? (
              <Pressable onPress={() => setText('')} style={styles.clear} accessibilityLabel="Clear" hitSlop={6}>
                <Text style={{ color: t.faint, fontSize: 18 }}>×</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>

        <View pointerEvents="none" style={[styles.bottomStrip, { height: insets.bottom, backgroundColor: t.chrome }]} />
        {trash.overlay}
      </View>
    </trash.Provider>
  );
}

function HomeHint() {
  const t = useTheme();
  const s = useAppState();
  const text = s.categories.length > 0
    ? 'Swipe right for your lists'
    : 'Try “+ groceries eggs:6, milk”, “+ keys sofa”, “n called landlord”, “t 5” or “5+5”. Type “help” for everything.';
  return <Text style={[styles.hint, { color: t.faint }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  titleRow: { alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.s, minHeight: TITLE_ROW },
  title: { fontSize: 27, textAlign: 'center', letterSpacing: -0.3 },
  gear: { position: 'absolute', right: SPACE.l, width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1 },
  scroll: { flexGrow: 1, paddingVertical: SPACE.s },
  center: { justifyContent: 'center' },
  cardPad: { paddingHorizontal: SPACE.l },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center', width: '92%', maxWidth: 560, minHeight: 56,
    borderRadius: 18, borderWidth: 1.5, paddingHorizontal: SPACE.l,
  },
  input: { flex: 1, fontSize: 19, paddingVertical: SPACE.m },
  clear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  previewSlot: { minHeight: 26, paddingHorizontal: SPACE.xl, paddingBottom: SPACE.s, alignItems: 'center', justifyContent: 'flex-end' },
  preview: { fontSize: 15, textAlign: 'center' },
  calc: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  previewNote: { fontSize: 13, marginBottom: 2, textAlign: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center', width: '92%', maxWidth: 560, marginBottom: SPACE.s,
    borderRadius: 12, paddingLeft: SPACE.l, minHeight: 44,
  },
  toastText: { flex: 1, fontSize: 15, paddingVertical: SPACE.s },
  undo: { paddingHorizontal: SPACE.l, minHeight: 44, justifyContent: 'center' },
  hint: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: SPACE.xl },
  bottomStrip: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
