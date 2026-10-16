// Answer card, notes, your lists, location and help panels.

import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { Scored } from '../core/match';
import type { Note } from '../data/store';
import { store, useAppState } from '../services/appStore';
import type { LocResult } from '../services/location';
import { viewDoc } from './describe';
import { fmtDateTime } from './format';
import { Button, Chip, Flash, SectionTitle } from './kit';
import { Draggable } from './trash';
import { useMotion } from './motion';
import { RADIUS, SPACE, TOUCH, useTheme } from './theme';

/**
 * The answer card: title on top, then each smaller line on its own row, all centered.
 * Tap opens it; hold and drag it to the trash to delete what it shows.
 */
export function AnswerCard({ s, onOpen }: { s: Scored; onOpen: (s: Scored) => void }) {
  const t = useTheme();
  const v = viewDoc(s.doc);
  if (!v) return null;
  return (
    <Draggable target={{ kind: v.kind, id: v.id, label: v.title }} onTap={() => onOpen(s)} testID="answer">
      <View
        accessibilityRole="button"
        accessibilityHint="Tap to open. Hold and drag to the trash to delete. Swipe left to dismiss."
        style={[styles.card, { backgroundColor: t.surface, boxShadow: t.shadow }]}
      >
        {v.photoUri ? <Image source={{ uri: v.photoUri }} style={styles.cardPhoto} /> : null}
        <Text style={[styles.cardTitle, { color: t.text, fontFamily: t.display }]} numberOfLines={2}>{v.title}</Text>
        {v.lines.map((line, i) => (
          <Text key={i} style={[styles.cardDetail, { color: i === 0 && v.lines.length > 1 ? t.text : t.muted }]} numberOfLines={3}>{line}</Text>
        ))}
      </View>
    </Draggable>
  );
}

export function NotesView({ notes, label, highlight }: { notes: Note[]; label: string; highlight: ReadonlySet<number> }) {
  const t = useTheme();
  const motion = useMotion();
  useAppState();
  return (
    <View>
      <Text style={[styles.panelTitle, { color: t.text, fontFamily: t.display }]}>Notes · {label}</Text>
      {notes.length === 0 ? <Text style={[styles.empty, { color: t.muted }]}>No notes {label === 'recent' ? 'yet. Type “n called landlord”.' : label}.</Text> : null}
      {notes.map((n) => (
        <Animated.View key={n.id} entering={motion.item} exiting={motion.itemExit} layout={motion.layout}>
          <Flash on={highlight.has(n.id)}>
            <Draggable target={{ kind: 'note', id: n.id, label: n.text }}>
              <View style={[styles.note, { borderBottomColor: t.border }]} accessibilityHint="Hold and drag to the trash to delete">
                <Text style={[styles.noteText, { color: t.text }]}>{n.text}</Text>
                <Text style={[styles.noteTime, { color: t.faint }]}>{fmtDateTime(n.createdAt)}</Text>
              </View>
            </Draggable>
          </Flash>
        </Animated.View>
      ))}
      {notes.length > 0 ? <Text style={[styles.hint, { color: t.faint, textAlign: 'center' }]}>Hold a note and drag it to the trash to delete it.</Text> : null}
    </View>
  );
}

/** The second screen (swipe right on an empty home screen): everything you have saved, grouped by type. */
export function CategoriesView({ onOpen }: { onOpen: (id: number) => void }) {
  const t = useTheme();
  const s = useAppState();
  // Sub-lists appear right after their parent as "parent › child".
  const byType = (type: string) => s.categories
    .filter((c) => c.type === type && c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((c) => [c, ...store.childrenOf(c.id)]);
  const chipLabel = (c: (typeof s.categories)[number]) => {
    const parent = c.parentId !== null ? store.categoryById(c.parentId) : undefined;
    return `${parent ? `${parent.name} › ` : ''}${c.name} · ${store.entriesOf(c.id).length}`;
  };
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
            <View style={[styles.chips, { justifyContent: 'center' }]}>
              {cats.map((c) => <Chip key={c.id} label={chipLabel(c)} onPress={() => onOpen(c.id)} />)}
            </View>
          </View>
        );
      })}
      <Text style={[styles.hint, { color: t.faint, textAlign: 'center' }]}>Swipe left to go back.</Text>
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
  ['add to groceries eggs:6, flour:1kg', 'Amounts after a colon go in their own column'],
  ['+ recipes/pancakes eggs:2, flour:500g', 'A list inside a list (one level). Later just “+ pancakes milk”'],
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
        Swipe anything left to clear it from the screen (nothing is deleted). Swipe right on the empty home screen for your lists. Tap a title to rename it, tap an item to edit it. Hold a title, item or card and drag it to the trash to delete it; every change can be undone.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  peekSlot: { paddingHorizontal: SPACE.l, paddingBottom: SPACE.s },
  card: {
    alignItems: 'center', minHeight: 72, borderRadius: 22,
    paddingHorizontal: SPACE.xl, paddingVertical: SPACE.l,
  },
  cardPhoto: { width: 64, height: 64, borderRadius: RADIUS.m, marginBottom: SPACE.s },
  cardTitle: { fontSize: 24, textAlign: 'center' },
  cardDetail: { fontSize: 15, marginTop: 4, textAlign: 'center', lineHeight: 20 },
  results: { paddingHorizontal: SPACE.l },
  resultGap: { marginTop: SPACE.s },
  empty: { paddingHorizontal: SPACE.l, paddingVertical: SPACE.l, fontSize: 15 },
  panelTitle: { fontSize: 24, textAlign: 'center', paddingHorizontal: SPACE.l, paddingTop: SPACE.m, paddingBottom: SPACE.s },
  note: { paddingHorizontal: SPACE.xl, paddingVertical: SPACE.m, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: TOUCH, alignItems: 'center' },
  noteText: { fontSize: 17, textAlign: 'center' },
  noteTime: { fontSize: 13, marginTop: 4, textAlign: 'center' },
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
