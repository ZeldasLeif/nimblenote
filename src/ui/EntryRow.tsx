import * as Clipboard from 'expo-clipboard';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated from 'react-native-reanimated';
import { parseAmount } from '../core/parse';
import type { Entry } from '../data/store';
import { store } from '../services/appStore';
import { authenticate } from '../services/auth';
import { relTime } from './format';
import { Axis, Flash } from './kit';
import { useMotion } from './motion';
import { RADIUS, SPACE, TOUCH, useTheme } from './theme';

const REVEAL_MS = 30_000;

interface Props {
  entry: Entry;
  hidden: boolean; // category or entry is sensitive
  showTime?: boolean;
  highlighted: boolean;
  onDelete: (id: number) => void;
  onMessage: (msg: string) => void;
}

function EntryRowImpl({ entry, hidden, showTime, highlighted, onDelete, onMessage }: Props) {
  const t = useTheme();
  const motion = useMotion();
  const swipe = useRef<SwipeableMethods>(null);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const isSecret = hidden || entry.value === null;

  useEffect(() => {
    if (revealed === null) return;
    const id = setTimeout(() => setRevealed(null), REVEAL_MS);
    return () => clearTimeout(id);
  }, [revealed]);

  const reveal = async (): Promise<string | null> => {
    if (!isSecret) return entry.value;
    if (revealed !== null) return revealed;
    const a = await authenticate('Show hidden value');
    if (!a.ok) { onMessage(a.reason); return null; }
    if (a.noDeviceLock) onMessage('Shown without a check: this phone has no screen lock');
    const v = await store.reveal(entry);
    setRevealed(v);
    return v;
  };

  const startEdit = async () => {
    const v = await reveal();
    if (v === null) return;
    setDraft(entry.key ? `${entry.key}: ${v}` : entry.amount ? `${v}:${entry.amount}` : v);
    setEditing(true);
    setMenu(false);
  };

  const saveEdit = async () => {
    setEditing(false);
    const text = draft.trim();
    if (!text) return;
    if (entry.key !== null) {
      const i = text.indexOf(':');
      const key = i > 0 ? text.slice(0, i).trim() : entry.key;
      const value = i > 0 ? text.slice(i + 1).trim() : text;
      onMessage((await store.updateEntry(entry.id, { key, value })).message);
    } else {
      // List item: "eggs:6" edits the amount too; removing ":6" clears it.
      const { text: value, amount } = parseAmount(text);
      onMessage((await store.updateEntry(entry.id, { value, amount })).message);
    }
    setRevealed(null);
  };

  const copy = async () => {
    const v = await reveal();
    if (v === null) return;
    await Clipboard.setStringAsync(v);
    setMenu(false);
    onMessage('Copied');
  };

  const shown = isSecret ? revealed ?? '••••••' : entry.value ?? '';
  const hiddenStyle = isSecret && revealed === null ? { color: t.faint, letterSpacing: 2 } : null;
  // Facts read "key | value"; locations "place | when"; list items "item | amount".
  const kind: 'fact' | 'place' | 'list' = entry.key !== null ? 'fact' : showTime ? 'place' : 'list';

  return (
    <Animated.View entering={motion.item} exiting={motion.itemExit} layout={motion.layout}>
      <Swipeable
        ref={swipe}
        friction={1.6}
        rightThreshold={72}
        overshootRight={false}
        onSwipeableOpen={() => onDelete(entry.id)}
        renderRightActions={() => (
          <View style={[styles.swipeAction, { backgroundColor: t.dangerSoft }]}>
            <Text style={{ color: t.danger, fontWeight: '600' }}>Delete</Text>
          </View>
        )}
      >
        <Flash on={highlighted}>
          <Pressable
            onLongPress={() => setMenu((m) => !m)}
            onPress={() => { if (isSecret && revealed === null) void reveal(); else if (menu) setMenu(false); }}
            delayLongPress={350}
            style={[styles.row, { backgroundColor: t.surface, borderTopColor: t.border }]}
            accessibilityHint="Long press for edit and delete. Swipe left to delete."
          >
            {editing ? (
              <TextInput
                value={draft}
                onChangeText={setDraft}
                autoFocus
                onSubmitEditing={saveEdit}
                onBlur={() => setEditing(false)}
                autoCorrect={false}
                autoCapitalize="none"
                textAlign="center"
                style={[styles.edit, { color: t.text, borderColor: t.accent }]}
              />
            ) : (
              <Axis
                left={kind === 'fact' ? entry.key : shown}
                right={kind === 'fact' ? shown : kind === 'place' ? relTime(entry.createdAt) : entry.amount}
                leftStyle={kind === 'fact' ? [styles.key, { color: t.muted }] : [styles.value, { color: t.text }, hiddenStyle]}
                rightStyle={kind === 'fact'
                  ? [styles.value, { color: t.text }, hiddenStyle]
                  : kind === 'place' ? [styles.time, { color: t.faint }] : [styles.amount, { color: t.muted }]}
                selectableRight={kind === 'fact' && !isSecret}
              />
            )}
          </Pressable>
        </Flash>
      </Swipeable>
      {menu && !editing ? (
        <Animated.View entering={motion.card} style={[styles.menu, { borderTopColor: t.border, backgroundColor: t.surface }]}>
          <MenuButton label="Edit" onPress={startEdit} />
          <MenuButton label="Copy" onPress={copy} />
          <MenuButton label="Delete" danger onPress={() => { setMenu(false); onDelete(entry.id); }} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function MenuButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuBtn, { backgroundColor: danger ? t.dangerSoft : t.surfaceAlt, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={{ color: danger ? t.danger : t.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export const EntryRow = memo(EntryRowImpl);

const styles = StyleSheet.create({
  row: { minHeight: TOUCH + 4, paddingVertical: SPACE.m, paddingHorizontal: SPACE.s, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  key: { fontSize: 16 },
  value: { fontSize: 17 },
  time: { fontSize: 14 },
  amount: { fontSize: 16, fontVariant: ['tabular-nums'] },
  edit: { fontSize: 17, borderBottomWidth: 2, paddingVertical: 4 },
  swipeAction: { flex: 1, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: SPACE.xl, borderRadius: RADIUS.s },
  menu: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.s, paddingHorizontal: SPACE.l, paddingVertical: SPACE.s, borderTopWidth: StyleSheet.hairlineWidth },
  menuBtn: { minHeight: 40, paddingHorizontal: SPACE.l, borderRadius: RADIUS.s, justifyContent: 'center' },
});
