import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { confidentBest, type Scored, search } from '../core/match';
import { parse } from '../core/parse';
import { formatDuration } from '../core/duration';
import { describe } from '../core/preview';
import type { Command, InputContext } from '../core/types';
import { store, useAppState } from '../services/appStore';
import { currentLocation, type LocResult } from '../services/location';
import { takePhoto } from '../services/photos';
import { startTimer } from '../services/timers';
import { CategoryView } from './CategoryView';
import { Chip } from './kit';
import { useMotion } from './motion';
import { CategoriesView, HelpView, LocView, NotesView, PeekCard, ResultsList } from './Panels';
import { SettingsView } from './SettingsView';
import { markFocused } from './startup';
import { DARK, LIGHT, RADIUS, SPACE, TOUCH, useTheme } from './theme';
import { TimersStrip } from './TimersStrip';

type ViewState =
  | { kind: 'home' }
  | { kind: 'results'; results: Scored[] }
  | { kind: 'category'; id: number }
  | { kind: 'notes'; range: { start: number; end: number } | null; label: string }
  | { kind: 'categories' }
  | { kind: 'loc'; loc: LocResult | 'loading' }
  | { kind: 'settings' }
  | { kind: 'help' };

type Toast = { id: number; message: string; undoable: boolean };

const PEEK_DEBOUNCE_MS = 150;
const TOAST_MS = 5000;

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
  const busy = useRef(false);

  const category = view.kind === 'category' ? store.categoryById(view.id) : undefined;
  const context: InputContext = category ? { kind: 'category', key: category.key } : { kind: 'none' };

  // Parsing is synchronous and pure: it runs on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cmd: Command = useMemo(() => parse(text, store.catalog(), context), [text, state.version, context.kind === 'category' ? context.key : '']);
  const preview = describe(cmd);

  // Live answer: debounced, and only shown when the match is clearly the answer.
  const readKey = cmd.kind === 'read' ? cmd.tokens.join(' ') : '';
  useEffect(() => {
    if (!state.settings.liveAnswers || cmd.kind !== 'read' || cmd.tokens.length === 0) {
      setPeek(null);
      return;
    }
    const tokens = cmd.tokens;
    const id = setTimeout(() => {
      const best = confidentBest(search(store.docs(), tokens, 5));
      setPeek((prev) => (prev?.doc.id === best?.doc.id && prev?.doc.ts === best?.doc.ts ? prev : best));
    }, PEEK_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [readKey, state.version, state.settings.liveAnswers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toast lifetime.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  // Highlight lifetime.
  useEffect(() => {
    if (highlight.size === 0) return;
    const id = setTimeout(() => setHighlight(new Set()), 1500);
    return () => clearTimeout(id);
  }, [highlight]);

  const say = useCallback((message: string, undoable = false) => setToast({ id: Date.now(), message, undoable }), []);

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

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

  // Android back: leave the current panel first.
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

  // If the viewed category disappears (deleted, undone), fall back to search.
  useEffect(() => {
    if (view.kind === 'category' && !store.categoryById(view.id)) setView({ kind: 'home' });
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
        const results = search(store.docs(), c.tokens, 30, false);
        const best = confidentBest(results);
        if (best && best.doc.kind === 'category' && best.score >= 1) {
          openScored(best);
          return;
        }
        setView({ kind: 'results', results });
        return;
      }
      case 'write': {
        const out = await store.applyWrite(c);
        setText('');
        say(c.notes[0] ? `${out.message} · ${c.notes[0]}` : out.message, out.undoable);
        setHighlight(new Set(out.highlight ?? []));
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
        setView({ kind: 'categories' });
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

  const placeholder = category
    ? category.type === 'list' ? `add to ${category.name}`
      : category.type === 'place' ? `${category.name} is now at…`
      : `add to ${category.name} (name: value)`
    : 'search · + to save · 5+5 · help';

  const showPeek = view.kind === 'home' || view.kind === 'results';

  return (
    <View style={[styles.root, { backgroundColor: t.bg, paddingTop: insets.top + SPACE.m }]}>
      <View style={styles.titleRow}>
        <Pressable onPress={goHome} accessibilityRole="button" accessibilityLabel="NimbleNote, back to search" hitSlop={8}>
          <Text style={[styles.title, { color: t.text }]}>NimbleNote</Text>
        </Pressable>
        <Pressable
          onPress={() => (view.kind === 'settings' ? goHome() : setView({ kind: 'settings' }))}
          style={styles.gear}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={8}
        >
          <Text style={{ color: t.muted, fontSize: 20 }}>{view.kind === 'settings' ? '×' : '⚙'}</Text>
        </Pressable>
      </View>

      <View style={[styles.inputBar, { backgroundColor: t.surface, borderColor: category ? t.accent : t.border }]}>
        {category ? (
          <Pressable onPress={goHome} style={[styles.ctx, { backgroundColor: t.accentSoft }]} accessibilityLabel={`Stop adding to ${category.name}`} hitSlop={6}>
            <Text style={{ color: t.accent, fontWeight: '600' }} numberOfLines={1}>{category.name} ×</Text>
          </Pressable>
        ) : null}
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          onFocus={markFocused}
          onKeyPress={(e) => { if (e.nativeEvent.key === 'Backspace' && !text && category) goHome(); }}
          placeholder={placeholder}
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

      <View style={styles.previewSlot}>
        {preview ? (
          <Text
            style={[
              styles.preview,
              { color: preview.tone === 'warn' ? t.warn : preview.tone === 'calc' ? t.accent : preview.tone === 'neutral' ? t.muted : t.text },
              preview.tone === 'calc' && styles.calc,
            ]}
            numberOfLines={2}
          >
            {preview.text}
          </Text>
        ) : null}
        {preview?.note ? <Text style={[styles.previewNote, { color: t.warn }]} numberOfLines={1}>{preview.note}</Text> : null}
      </View>

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

      <TimersStrip />

      {showPeek && state.settings.liveAnswers && cmd.kind === 'read' ? <PeekCard best={peek} onOpen={openScored} /> : null}

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
      >
        {view.kind === 'home' ? <HomeHints onOpen={(id) => setView({ kind: 'category', id })} /> : null}
        {view.kind === 'results' ? <ResultsList results={view.results} onOpen={openScored} /> : null}
        {view.kind === 'category' && category ? (
          <CategoryView key={category.id} category={category} highlight={highlight} onMessage={say} onClosed={goHome} />
        ) : null}
        {view.kind === 'notes' ? (
          <NotesView notes={store.notesIn(view.range)} label={view.label} highlight={highlight} onMessage={say} />
        ) : null}
        {view.kind === 'categories' ? <CategoriesView onOpen={(id) => setView({ kind: 'category', id })} /> : null}
        {view.kind === 'loc' ? (
          <LocView loc={view.loc} onSaveNote={async (s) => { const o = await store.addNote(s); say(o.message, true); }} />
        ) : null}
        {view.kind === 'settings' ? <SettingsView onMessage={say} reduceMotion={reduceMotion} /> : null}
        {view.kind === 'help' ? <HelpView /> : null}
        {/* Tapping empty space below the content returns to normal search. */}
        {view.kind === 'category' ? <Pressable onPress={goHome} style={{ minHeight: 200 }} accessibilityLabel="Back to search" /> : null}
      </ScrollView>
    </View>
  );
}

function HomeHints({ onOpen }: { onOpen: (id: number) => void }) {
  const t = useTheme();
  const s = useAppState();
  const recent = [...s.categories].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  return (
    <View style={styles.hints}>
      {recent.length > 0 ? (
        <View style={styles.chips}>
          {recent.map((c) => <Chip key={c.id} label={c.name} onPress={() => onOpen(c.id)} />)}
        </View>
      ) : (
        <Text style={[styles.hintText, { color: t.muted }]}>
          Try “+ groceries eggs, milk”, “+ keys sofa”, “n called landlord”, “t 5” or “5+5”. Type “help” for everything.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  titleRow: { alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.m, minHeight: 36 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center' },
  gear: { position: 'absolute', right: SPACE.l, width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center', width: '92%', maxWidth: 560, minHeight: 56,
    borderRadius: RADIUS.l, borderWidth: 1.5, paddingHorizontal: SPACE.m,
  },
  ctx: { borderRadius: RADIUS.s, paddingHorizontal: SPACE.s, minHeight: 32, justifyContent: 'center', marginRight: SPACE.s, maxWidth: 140 },
  input: { flex: 1, fontSize: 19, paddingVertical: SPACE.m },
  clear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  previewSlot: { minHeight: 26, paddingHorizontal: SPACE.xl, paddingTop: SPACE.s, alignItems: 'center' },
  preview: { fontSize: 15, textAlign: 'center' },
  calc: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  previewNote: { fontSize: 13, marginTop: 2, textAlign: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center', width: '92%', maxWidth: 560, marginTop: SPACE.s,
    borderRadius: RADIUS.m, paddingLeft: SPACE.l, minHeight: 44,
  },
  toastText: { flex: 1, fontSize: 15, paddingVertical: SPACE.s },
  undo: { paddingHorizontal: SPACE.l, minHeight: 44, justifyContent: 'center' },
  body: { flex: 1, marginTop: SPACE.s },
  hints: { paddingHorizontal: SPACE.l, paddingTop: SPACE.m },
  hintText: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
