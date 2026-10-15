// Peek card, results list, notes, categories, location and help panels.

import { memo } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { Scored } from '../core/match';
import type { Note } from '../data/store';
import { store, useAppState } from '../services/appStore';
import type { LocResult } from '../services/location';
import { viewDoc } from './describe';
import { fmtDateTime } from './format';
import { Button, Chip, Flash, SectionTitle } from './kit';
import { useMotion } from './motion';
import { RADIUS, SPACE, TOUCH, useTheme } from './theme';

/** One best match in a fixed slot. Re-keyed per document so the text swaps with a very short fade, never stacking. */
export const PeekCard = memo(function PeekCard({ best, onOpen }: { best: Scored | null; onOpen: (s: Scored) => void }) {
  const t = useTheme();
  const motion = useMotion();
  const v = best ? viewDoc(best.doc) : null;
  return (
    <View style={styles.peekSlot}>
      {best && v ? (
        <Animated.View key={best.doc.id} entering={motion.peek}>
          <Pressable onPress={() => onOpen(best)} style={({ pressed }) => [styles.peek, { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.8 : 1 }]}>
            {v.photoUri ? <Image source={{ uri: v.photoUri }} style={styles.peekPhoto} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={[styles.peekTitle, { color: t.muted }]} numberOfLines={1}>{v.title}</Text>
              <Text style={[styles.peekDetail, { color: t.text }]} numberOfLines={2}>{v.detail}</Text>
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
});

export function ResultsList({ results, onOpen }: { results: Scored[]; onOpen: (s: Scored) => void }) {
  const t = useTheme();
  const motion = useMotion();
  if (results.length === 0) {
    return <Text style={[styles.empty, { color: t.muted }]}>Nothing found. Save something with “+ name value”.</Text>;
  }
  return (
    <View>
      {results.map((r) => {
        const v = viewDoc(r.doc);
        if (!v) return null;
        return (
          <Animated.View key={r.doc.id} entering={motion.card}>
            <Pressable onPress={() => onOpen(r)} style={({ pressed }) => [styles.result, { borderBottomColor: t.border, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={[styles.resultTitle, { color: t.text }]} numberOfLines={1}>{v.title}</Text>
              <Text style={[styles.resultDetail, { color: t.muted }]} numberOfLines={2}>{v.detail}</Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

export function NotesView({ notes, label, highlight, onMessage }: { notes: Note[]; label: string; highlight: ReadonlySet<number>; onMessage: (m: string, undoable?: boolean) => void }) {
  const t = useTheme();
  const motion = useMotion();
  useAppState();
  return (
    <View>
      <Text style={[styles.panelTitle, { color: t.text }]}>Notes · {label}</Text>
      {notes.length === 0 ? <Text style={[styles.empty, { color: t.muted }]}>No notes {label === 'recent' ? 'yet. Type “n called landlord”.' : label}.</Text> : null}
      {notes.map((n) => (
        <Animated.View key={n.id} entering={motion.item} exiting={motion.itemExit} layout={motion.layout}>
          <Flash on={highlight.has(n.id)}>
            <Pressable
              onLongPress={async () => onMessage((await store.deleteNote(n.id)).message, true)}
              style={[styles.note, { borderBottomColor: t.border }]}
              accessibilityHint="Long press to delete"
            >
              <Text style={[styles.noteText, { color: t.text }]} selectable>{n.text}</Text>
              <Text style={[styles.noteTime, { color: t.faint }]}>{fmtDateTime(n.createdAt)}</Text>
            </Pressable>
          </Flash>
        </Animated.View>
      ))}
      {notes.length > 0 ? <Text style={[styles.hint, { color: t.faint }]}>Long-press a note to delete it.</Text> : null}
    </View>
  );
}

export function CategoriesView({ onOpen }: { onOpen: (id: number) => void }) {
  const t = useTheme();
  const s = useAppState();
  const byType = (type: string) => s.categories.filter((c) => c.type === type).sort((a, b) => a.name.localeCompare(b.name));
  const groups: Array<[string, string]> = [['list', 'Lists'], ['fact', 'Facts'], ['place', 'Locations']];
  if (s.categories.length === 0) {
    return <Text style={[styles.empty, { color: t.muted }]}>Nothing yet. Try “+ groceries eggs, milk”.</Text>;
  }
  return (
    <View style={styles.pad}>
      {groups.map(([type, label]) => {
        const cats = byType(type);
        if (cats.length === 0) return null;
        return (
          <View key={type}>
            <SectionTitle>{label}</SectionTitle>
            <View style={styles.chips}>
              {cats.map((c) => <Chip key={c.id} label={`${c.name} · ${store.entriesOf(c.id).length}`} onPress={() => onOpen(c.id)} />)}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function LocView({ loc, onSaveNote }: { loc: LocResult | 'loading'; onSaveNote: (text: string) => void }) {
  const t = useTheme();
  const motion = useMotion();
  if (loc === 'loading') return <Text style={[styles.empty, { color: t.muted }]}>Getting location…</Text>;
  if (!loc.ok) {
    return (
      <Animated.View entering={motion.card} style={styles.pad}>
        <Text style={[styles.locError, { color: t.text }]}>{loc.message}</Text>
        {loc.reason === 'denied' ? <Button label="Open settings" onPress={() => Linking.openSettings()} /> : null}
      </Animated.View>
    );
  }
  const coords = `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;
  const text = loc.address ? `${loc.address} (${coords})` : coords;
  return (
    <Animated.View entering={motion.card} style={styles.pad}>
      {loc.address ? <Text style={[styles.locAddr, { color: t.text }]} selectable>{loc.address}</Text> : null}
      <Text style={[styles.locCoords, { color: loc.address ? t.muted : t.text }]} selectable>{coords}</Text>
      {loc.accuracy ? <Text style={[styles.hint, { color: t.faint, paddingHorizontal: 0 }]}>± {Math.round(loc.accuracy)} m</Text> : null}
      <View style={{ height: SPACE.m }} />
      <Button label="Save as note" onPress={() => onSaveNote(`📍 ${text}`)} />
    </Animated.View>
  );
}

const HELP: Array<[string, string]> = [
  ['groceries', 'Look up anything: a list, a fact, where something is'],
  ["when is my dad's birthday?", 'Questions work: filler words are ignored'],
  ['+ groceries eggs, milk, olive oil', 'Add to a list (created on first use). Split on commas and “and”'],
  ['+ bank pin: 4533', 'Save a fact: colon separates key and value'],
  ['+pw bankpin2 4321', 'Without colon the last word is the value if it looks like one'],
  ['+ keys sofa', 'Remember where something is (or “+loc drill garage”)'],
  ['new list groceries', 'Create a list (adds to it if it exists)'],
  ['5+5', 'Calculator, live. Enter replaces the input with the result'],
  ['n called landlord', 'Timestamped note (also “r …”)'],
  ['n yesterday · n last week · n this month', 'Notes by date'],
  ['t 5 · timer 1h30m · a water plants 1h · a 7:30', 'Timers and alarms (bare numbers are minutes)'],
  ['loc', 'Current coordinates and street address'],
  ['photo keys', 'Take a photo and attach it to “keys”'],
  ['l · l groceries', 'Show everything · open one'],
  ['undo · settings · help', 'Commands'],
];

export function HelpView() {
  const t = useTheme();
  return (
    <View style={styles.pad}>
      <SectionTitle>Grammar</SectionTitle>
      {HELP.map(([cmd, text]) => (
        <View key={cmd} style={[styles.helpRow, { borderBottomColor: t.border }]}>
          <Text style={[styles.helpCmd, { color: t.accent }]}>{cmd}</Text>
          <Text style={[styles.helpText, { color: t.muted }]}>{text}</Text>
        </View>
      ))}
      <Text style={[styles.hint, { color: t.faint, paddingHorizontal: 0 }]}>
        After opening a list, just type to add to it. Tap the title to return to search. Swipe left or long-press an entry to delete; every change can be undone.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  peekSlot: { minHeight: 76, paddingHorizontal: SPACE.l, paddingTop: SPACE.s },
  peek: { flexDirection: 'row', alignItems: 'center', minHeight: 64, borderRadius: RADIUS.l, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.l, paddingVertical: SPACE.m },
  peekPhoto: { width: 44, height: 44, borderRadius: RADIUS.s, marginRight: SPACE.m },
  peekTitle: { fontSize: 13, fontWeight: '600' },
  peekDetail: { fontSize: 18, marginTop: 2 },
  empty: { paddingHorizontal: SPACE.l, paddingVertical: SPACE.l, fontSize: 15 },
  result: { minHeight: TOUCH + 8, paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  resultTitle: { fontSize: 17, fontWeight: '500' },
  resultDetail: { fontSize: 15, marginTop: 2 },
  panelTitle: { fontSize: 22, fontWeight: '700', paddingHorizontal: SPACE.l, paddingTop: SPACE.m, paddingBottom: SPACE.s },
  note: { paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: TOUCH },
  noteText: { fontSize: 17 },
  noteTime: { fontSize: 13, marginTop: 4 },
  hint: { fontSize: 13, paddingHorizontal: SPACE.l, paddingVertical: SPACE.m },
  pad: { paddingHorizontal: SPACE.l, paddingBottom: SPACE.l },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  locAddr: { fontSize: 20, fontWeight: '600', marginTop: SPACE.m },
  locCoords: { fontSize: 17, marginTop: SPACE.s, fontVariant: ['tabular-nums'] },
  locError: { fontSize: 16, marginVertical: SPACE.m },
  helpRow: { paddingVertical: SPACE.m, borderBottomWidth: StyleSheet.hairlineWidth },
  helpCmd: { fontSize: 16, fontWeight: '600', fontFamily: 'monospace' },
  helpText: { fontSize: 14, marginTop: 2 },
});
