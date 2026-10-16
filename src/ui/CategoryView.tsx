import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CategoryType } from '../core/types';
import type { Category } from '../data/store';
import { store, useAppState } from '../services/appStore';
import { EntryRow } from './EntryRow';
import { relTime } from './format';
import { Axis } from './kit';
import { RADIUS, SPACE, useTheme } from './theme';
import { Draggable } from './trash';

interface Props {
  category: Category;
  highlight: ReadonlySet<number>;
  onMessage: (msg: string, undoable?: boolean) => void;
  onOpenCategory: (id: number) => void;
}

const TYPE_LABEL: Record<CategoryType, string> = { list: 'List', fact: 'Facts', place: 'Location' };

/**
 * A list, facts or a location on one paper card.
 * Tap the title to rename it; hold the title (or any row) and drag it to the trash to delete.
 */
export function CategoryView({ category: c, highlight, onMessage, onOpenCategory }: Props) {
  const t = useTheme();
  useAppState(); // re-render on store changes
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(c.name);
  const [photoLarge, setPhotoLarge] = useState(false);
  const entries = c.type === 'place' ? [] : store.entriesOf(c.id);
  const place = c.type === 'place' ? store.currentPlace(c.id) : undefined;
  const children = store.childrenOf(c.id);
  const parent = c.parentId !== null ? store.categoryById(c.parentId) : undefined;
  const msg = (m: string) => onMessage(m);

  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const summary = c.type === 'place'
    ? place ? `Location: ${c.sensitive ? '••••••' : place.value} · ${relTime(place.createdAt)}` : 'Location: not set yet'
    : [
      TYPE_LABEL[c.type],
      children.length ? count(children.length, 'list', 'lists') : '',
      c.type === 'list' ? count(entries.length, 'item', 'items') : count(entries.length, 'entry', 'entries'),
      c.sensitive ? 'hidden' : '',
    ].filter(Boolean).join(' · ');

  const startRename = () => {
    setName(c.name);
    setRenaming(true);
  };
  const finishRename = async () => {
    setRenaming(false);
    const next = name.trim();
    if (!next || next === c.name) return;
    const r = await store.renameCategory(c.id, next);
    onMessage(r.message, r.undoable);
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, boxShadow: t.shadow }]}>
      {parent ? (
        <Pressable onPress={() => onOpenCategory(parent.id)} style={styles.crumb} accessibilityRole="button" accessibilityLabel={`Open ${parent.name}`} hitSlop={8}>
          <Text style={{ color: t.muted, fontSize: 13 }}>in {parent.name}</Text>
        </Pressable>
      ) : null}

      <View style={styles.header}>
        {renaming ? (
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            selectTextOnFocus
            onSubmitEditing={finishRename}
            onBlur={finishRename}
            autoCorrect={false}
            autoCapitalize="none"
            textAlign="center"
            accessibilityLabel="Rename"
            style={[styles.title, styles.titleInput, { color: t.text, fontFamily: t.display, borderColor: t.accent }]}
          />
        ) : (
          <Draggable target={{ kind: 'category', id: c.id, label: c.name }} onTap={startRename} testID="category-title">
            <Text
              style={[styles.title, { color: t.text, fontFamily: t.display }]}
              numberOfLines={2}
              accessibilityRole="button"
              accessibilityHint="Tap to rename. Hold and drag to the trash to delete."
            >
              {c.name}
            </Text>
          </Draggable>
        )}
        <Text style={[styles.summary, { color: t.muted }]}>{summary}</Text>
      </View>

      {c.photoUri ? (
        <Pressable onPress={() => setPhotoLarge((v) => !v)} accessibilityLabel={`Photo of ${c.name}`}>
          <Image source={{ uri: c.photoUri }} style={[styles.photo, { height: photoLarge ? 320 : 120, backgroundColor: t.surfaceAlt }]} resizeMode="cover" />
        </Pressable>
      ) : null}

      {children.map((ch) => (
        <Draggable key={ch.id} target={{ kind: 'category', id: ch.id, label: ch.name }} onTap={() => onOpenCategory(ch.id)}>
          <View style={[styles.subRow, { borderTopColor: t.border }]} accessibilityRole="button" accessibilityLabel={`Open ${ch.name}`}>
            <Axis
              left={ch.name}
              right={`${store.entriesOf(ch.id).length} ›`}
              leftStyle={{ color: t.text, fontSize: 18, fontFamily: t.display }}
              rightStyle={{ color: t.muted, fontSize: 15 }}
            />
          </View>
        </Draggable>
      ))}

      {c.type !== 'place' && entries.length === 0 && children.length === 0 ? (
        <Text style={[styles.empty, { color: t.muted }]}>
          {c.type === 'list' ? `Empty. Add with “+ ${c.name} eggs:6, milk”.` : `No entries yet. Add with “+ ${c.name} name: value”.`}
        </Text>
      ) : null}

      {entries.map((e) => (
        <EntryRow key={e.id} entry={e} hidden={c.sensitive || e.sensitive} highlighted={highlight.has(e.id)} onMessage={msg} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: SPACE.l, borderRadius: 22, paddingHorizontal: SPACE.m, paddingBottom: SPACE.s },
  header: { alignItems: 'center', paddingHorizontal: SPACE.l, paddingTop: SPACE.l, paddingBottom: SPACE.m, minHeight: 48 },
  title: { fontSize: 24, textAlign: 'center' },
  titleInput: { minWidth: 160, borderBottomWidth: 2, paddingVertical: 2 },
  summary: { fontSize: 15, marginTop: 4, textAlign: 'center' },
  crumb: { alignSelf: 'center', paddingTop: SPACE.m },
  subRow: { minHeight: 52, justifyContent: 'center', paddingHorizontal: SPACE.s, borderTopWidth: StyleSheet.hairlineWidth },
  photo: { borderRadius: RADIUS.m, marginBottom: SPACE.m },
  empty: { paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, fontSize: 15, textAlign: 'center' },
});
