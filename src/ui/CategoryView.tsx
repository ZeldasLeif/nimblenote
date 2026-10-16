import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { parse } from '../core/parse';
import type { CategoryType } from '../core/types';
import type { Category } from '../data/store';
import { store, useAppState } from '../services/appStore';
import { authenticate } from '../services/auth';
import { takePhoto } from '../services/photos';
import { EntryRow } from './EntryRow';
import { relTime } from './format';
import { Button, Chip, Segmented } from './kit';
import { useMotion } from './motion';
import { RADIUS, SPACE, useTheme } from './theme';

interface Props {
  category: Category;
  highlight: ReadonlySet<number>;
  onMessage: (msg: string, undoable?: boolean) => void;
  onClosed: () => void;
  onOpenCategory: (id: number) => void;
}

const TYPE_LABEL: Record<CategoryType, string> = { list: 'List', fact: 'Facts', place: 'Location' };

export function CategoryView({ category: c, highlight, onMessage, onClosed, onOpenCategory }: Props) {
  const t = useTheme();
  const motion = useMotion();
  useAppState(); // re-render on store changes
  const [menu, setMenu] = useState(false);
  const [photoLarge, setPhotoLarge] = useState(false);
  const entries = c.type === 'place' ? store.placeHistory(c.id) : store.entriesOf(c.id);
  const children = store.childrenOf(c.id);
  const parent = c.parentId !== null ? store.categoryById(c.parentId) : undefined;
  const del = async (id: number) => onMessage((await store.deleteEntry(id)).message, true);
  const msg = (m: string) => onMessage(m);

  const moveTo = async (loc: string) => {
    const cmd = parse(loc, store.catalog(), { kind: 'category', key: c.key });
    if (cmd.kind === 'write') onMessage((await store.applyWrite(cmd)).message, true);
  };

  return (
    <Animated.View entering={motion.card}>
      {parent ? (
        <Pressable onPress={() => onOpenCategory(parent.id)} style={styles.crumb} accessibilityRole="button" accessibilityLabel={`Open ${parent.name}`} hitSlop={8}>
          <Text style={{ color: t.muted, fontSize: 13 }}>in {parent.name}</Text>
        </Pressable>
      ) : null}
      <Pressable onLongPress={() => setMenu((m) => !m)} onPress={() => setMenu((m) => !m)} style={styles.header} accessibilityHint="Opens the menu to edit or organize">
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{c.name}</Text>
        <Text style={[styles.badge, { color: t.muted, backgroundColor: t.surfaceAlt }]}>
          {TYPE_LABEL[c.type]}{c.sensitive ? ' · hidden' : ''}
        </Text>
        <Text style={[styles.more, { color: t.muted }]}>⋯</Text>
      </Pressable>

      {menu ? <CategoryMenu category={c} onMessage={onMessage} onClosed={onClosed} onDone={() => setMenu(false)} /> : null}

      {c.photoUri ? (
        <Pressable onPress={() => setPhotoLarge((v) => !v)} accessibilityLabel={`Photo of ${c.name}`}>
          <Image source={{ uri: c.photoUri }} style={[styles.photo, { height: photoLarge ? 320 : 120, backgroundColor: t.surfaceAlt }]} resizeMode="cover" />
        </Pressable>
      ) : null}

      {c.type === 'place' ? (
        <PlaceSummary category={c} onMove={moveTo} />
      ) : null}

      {children.length > 0 ? (
        <View style={styles.subs}>
          {children.map((ch) => (
            <Pressable
              key={ch.id}
              onPress={() => onOpenCategory(ch.id)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.subRow, { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>{ch.name}</Text>
              <Text style={{ color: t.muted, fontSize: 14 }}>{store.entriesOf(ch.id).length} ›</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {entries.length === 0 && children.length === 0 ? (
        <Text style={[styles.empty, { color: t.muted }]}>
          {c.type === 'list' ? `Empty. Add with “+ ${c.name} eggs:6, milk”.` : c.type === 'place' ? 'No location yet.' : `No entries yet. Add with “+ ${c.name} name: value”.`}
        </Text>
      ) : null}

      {c.type === 'place' && entries.length > 0 ? <Text style={[styles.sub, { color: t.muted }]}>History</Text> : null}
      {entries.map((e) => (
        <EntryRow
          key={e.id}
          entry={e}
          hidden={c.sensitive || e.sensitive}
          showTime={c.type === 'place'}
          highlighted={highlight.has(e.id)}
          onDelete={del}
          onMessage={msg}
        />
      ))}
    </Animated.View>
  );
}

function PlaceSummary({ category: c, onMove }: { category: Category; onMove: (loc: string) => void }) {
  const t = useTheme();
  const current = store.placeHistory(c.id)[0];
  const chips = store.placeChips(c.id);
  return (
    <View style={styles.place}>
      {current ? (
        <>
          <Text style={[styles.placeNow, { color: t.text }]}>{c.sensitive ? '••••••' : current.value}</Text>
          <Text style={[styles.placeTime, { color: t.muted }]}>{relTime(current.createdAt)}</Text>
        </>
      ) : null}
      {chips.length > 0 ? (
        <View style={styles.chips}>
          {chips.map((ch) => <Chip key={ch} label={ch} onPress={() => onMove(ch)} />)}
        </View>
      ) : null}
    </View>
  );
}

function CategoryMenu({ category: c, onMessage, onClosed, onDone }: { category: Category; onMessage: Props['onMessage']; onClosed: () => void; onDone: () => void }) {
  const t = useTheme();
  const motion = useMotion();
  const [name, setName] = useState(c.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const report = (m: string, undoable = true) => onMessage(m, undoable);

  const rename = async () => {
    if (name.trim() && name.trim() !== c.name) {
      const r = await store.renameCategory(c.id, name);
      report(r.message, r.undoable);
    }
  };

  const toggleSensitive = async () => {
    const a = await authenticate(c.sensitive ? 'Unhide values' : 'Hide and encrypt values');
    if (!a.ok) return report(a.reason, false);
    report((await store.setCategorySensitive(c.id, !c.sensitive)).message);
  };

  const photo = async () => {
    const p = await takePhoto();
    if (!p.ok) return report(p.message, false);
    report((await store.setPhoto(c.id, p.uri)).message);
  };

  return (
    <Animated.View entering={motion.card} style={[styles.menu, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.label, { color: t.muted }]}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        onSubmitEditing={rename}
        onBlur={rename}
        autoCorrect={false}
        autoCapitalize="none"
        style={[styles.input, { color: t.text, borderColor: t.border }]}
      />
      <Text style={[styles.label, { color: t.muted }]}>Type</Text>
      <Segmented<CategoryType>
        value={c.type}
        options={[['list', 'List'], ['fact', 'Facts'], ['place', 'Location']]}
        onChange={async (v) => report((await store.setCategoryType(c.id, v)).message)}
      />
      {c.type === 'list' ? (
        <>
          <Text style={[styles.label, { color: t.muted }]}>Split new items on</Text>
          <Segmented<'commas' | 'spaces'>
            value={c.splitOnSpaces ? 'spaces' : 'commas'}
            options={[['commas', 'Commas and “and”'], ['spaces', 'Also spaces']]}
            onChange={async (v) => report((await store.setSplitOnSpaces(c.id, v === 'spaces')).message)}
          />
        </>
      ) : null}
      <View style={styles.menuRow}>
        <Button label={c.sensitive ? 'Unhide values' : 'Hide values'} onPress={toggleSensitive} />
        <Button label={c.photoUri ? 'New photo' : 'Add photo'} onPress={photo} />
        {c.photoUri ? <Button label="Remove photo" onPress={async () => report((await store.setPhoto(c.id, null)).message)} /> : null}
      </View>
      <View style={styles.menuRow}>
        <Button
          label={confirmDelete ? `Tap again to delete “${c.name}”` : 'Delete'}
          tone="danger"
          onPress={async () => {
            if (!confirmDelete) return setConfirmDelete(true);
            const r = await store.deleteCategory(c.id);
            onMessage(r.message, r.undoable);
            onClosed();
          }}
        />
        <Button label="Done" onPress={onDone} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingHorizontal: SPACE.xl, paddingTop: SPACE.m, paddingBottom: SPACE.s, minHeight: 48 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  crumb: { alignSelf: 'center', paddingTop: SPACE.s },
  subs: { paddingHorizontal: SPACE.l, gap: SPACE.s, paddingBottom: SPACE.s },
  subRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52,
    paddingHorizontal: SPACE.l, borderRadius: RADIUS.m, borderWidth: StyleSheet.hairlineWidth,
  },
  badge: { fontSize: 12, marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  more: { position: 'absolute', right: SPACE.l, top: SPACE.m, fontSize: 22, paddingHorizontal: SPACE.s },
  photo: { marginHorizontal: SPACE.l, borderRadius: RADIUS.m, marginBottom: SPACE.m },
  empty: { paddingHorizontal: SPACE.l, paddingVertical: SPACE.m, fontSize: 15, textAlign: 'center' },
  sub: { paddingHorizontal: SPACE.l, paddingTop: SPACE.m, fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  place: { paddingHorizontal: SPACE.l, paddingBottom: SPACE.s, alignItems: 'center' },
  placeNow: { fontSize: 28, fontWeight: '600' },
  placeTime: { fontSize: 14, marginTop: 2, marginBottom: SPACE.m },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  menu: { marginHorizontal: SPACE.l, marginBottom: SPACE.m, padding: SPACE.l, borderRadius: RADIUS.l, borderWidth: StyleSheet.hairlineWidth, gap: SPACE.s },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: SPACE.s },
  input: { fontSize: 17, borderWidth: 1, borderRadius: RADIUS.s, paddingHorizontal: SPACE.m, minHeight: 44 },
  menuRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s, marginTop: SPACE.s },
});
