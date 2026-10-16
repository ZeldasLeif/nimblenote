import { memo, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { parseAmount } from '../core/parse';
import type { Entry } from '../data/store';
import { store } from '../services/appStore';
import { authenticate } from '../services/auth';
import { Axis, Flash } from './kit';
import { useMotion } from './motion';
import { SPACE, TOUCH, useTheme } from './theme';
import { Draggable } from './trash';

const REVEAL_MS = 30_000;

interface Props {
  entry: Entry;
  hidden: boolean; // category or entry is sensitive
  highlighted: boolean;
  onMessage: (msg: string) => void;
}

/**
 * One list item or fact on the center axis ("flour │ 500g", "dad │ 12.03.1960").
 * Tap: edit in place (a hidden value is revealed first). Long-press: drag it to the trash.
 */
function EntryRowImpl({ entry, hidden, highlighted, onMessage }: Props) {
  const t = useTheme();
  const motion = useMotion();
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

  const onTap = async () => {
    if (isSecret && revealed === null) { await reveal(); return; } // first tap shows, the next one edits
    const v = await reveal();
    if (v === null) return;
    setDraft(entry.key ? `${entry.key}: ${v}` : entry.amount ? `${v}:${entry.amount}` : v);
    setEditing(true);
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

  const shown = isSecret ? revealed ?? '••••••' : entry.value ?? '';
  const hiddenStyle = isSecret && revealed === null ? { color: t.faint, letterSpacing: 2 } : null;
  const isFact = entry.key !== null;
  const label = isFact ? entry.key! : isSecret ? 'hidden item' : entry.value ?? '';

  return (
    <Animated.View entering={motion.item} exiting={motion.itemExit} layout={motion.layout}>
      {editing ? (
        <View style={[styles.row, { borderTopColor: t.border }]}>
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
        </View>
      ) : (
        <Draggable target={{ kind: 'entry', id: entry.id, label }} onTap={onTap} testID={`entry-${entry.id}`}>
          <Flash on={highlighted}>
            <View style={[styles.row, { borderTopColor: t.border }]} accessibilityHint="Tap to edit. Hold and drag to the trash to delete.">
              <Axis
                left={isFact ? entry.key : shown}
                right={isFact ? shown : entry.amount}
                leftStyle={isFact ? [styles.key, { color: t.muted }] : [styles.value, { color: t.text }, hiddenStyle]}
                rightStyle={isFact ? [styles.value, { color: t.text }, hiddenStyle] : [styles.amount, { color: t.muted }]}
                selectableRight={isFact && !isSecret}
              />
            </View>
          </Flash>
        </Draggable>
      )}
    </Animated.View>
  );
}

export const EntryRow = memo(EntryRowImpl);

const styles = StyleSheet.create({
  row: { minHeight: TOUCH + 4, paddingVertical: SPACE.m, paddingHorizontal: SPACE.s, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  key: { fontSize: 16 },
  value: { fontSize: 17 },
  amount: { fontSize: 16, fontVariant: ['tabular-nums'] },
  edit: { fontSize: 17, borderBottomWidth: 2, paddingVertical: 4 },
});
