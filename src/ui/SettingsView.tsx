import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { AnimationPref, Settings, ThemePref } from '../data/store';
import { store, useAppState } from '../services/appStore';
import { authenticate, deviceHasLock } from '../services/auth';
import { exportToFile, importFromFile } from '../services/transfer';
import { Button, Card, SectionTitle, Segmented } from './kit';
import { startupMs } from './startup';
import { RADIUS, SPACE, TOUCH, useTheme } from './theme';

export function SettingsView({ onMessage, reduceMotion }: { onMessage: (m: string, undoable?: boolean) => void; reduceMotion: boolean }) {
  const t = useTheme();
  const s = useAppState();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => void store.setSetting(k, v);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hasLock, setHasLock] = useState<boolean | null>(null);
  useEffect(() => { deviceHasLock().then(setHasLock).catch(() => setHasLock(false)); }, []);

  const toggleLock = async (on: boolean) => {
    if (on && hasLock === false) return onMessage('Set a screen lock in Android settings first');
    const a = await authenticate(on ? 'Turn on app lock' : 'Turn off app lock', true);
    if (!a.ok) return onMessage(a.reason);
    set('lockEnabled', on);
  };

  const guarded = async (fn: () => Promise<string>, reason: string) => {
    try {
      const needsAuth = s.categories.some((c) => c.sensitive) || s.entries.some((e) => e.sensitive);
      if (needsAuth) {
        const a = await authenticate(reason, true);
        if (!a.ok) return onMessage(a.reason);
      }
      onMessage(await fn(), true);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  const ms = startupMs();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: t.text }]}>Settings</Text>

      <SectionTitle>Theme</SectionTitle>
      <Segmented<ThemePref> value={s.settings.theme} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(v) => set('theme', v)} />

      <SectionTitle>Show answers while typing</SectionTitle>
      <Segmented<'on' | 'enter'>
        value={s.settings.liveAnswers ? 'on' : 'enter'}
        options={[['on', 'On'], ['enter', 'On Enter only']]}
        onChange={(v) => set('liveAnswers', v === 'on')}
      />

      <SectionTitle>Animations</SectionTitle>
      <Segmented<AnimationPref>
        value={s.settings.animations}
        options={[['smooth', 'Smooth'], ['minimal', 'Minimal'], ['off', 'Off']]}
        onChange={(v) => set('animations', v)}
      />
      {reduceMotion ? <Text style={[styles.note, { color: t.muted }]}>Your phone asks to reduce motion, so animations are off.</Text> : null}

      <SectionTitle>Privacy</SectionTitle>
      <Row label="App lock" detail="Fingerprint, face or screen lock on open and after 5 minutes away">
        <Switch value={s.settings.lockEnabled} onValueChange={toggleLock} />
      </Row>
      <Row label="Street address for “loc”" detail="Uses Android's built-in geocoder, which may contact Google services">
        <Switch value={s.settings.reverseGeocode} onValueChange={(v) => set('reverseGeocode', v)} />
      </Row>
      {hasLock === false ? (
        <Text style={[styles.note, { color: t.warn }]}>This phone has no screen lock, so hidden values and the app lock cannot be protected.</Text>
      ) : null}
      <Text style={[styles.note, { color: t.muted }]}>
        Hidden categories (passwords by default) are encrypted on this phone and need authentication to show. This is a convenience, not a password manager.
      </Text>

      <SectionTitle>Aliases</SectionTitle>
      <AliasEditor onMessage={onMessage} />

      <SectionTitle>Lists</SectionTitle>
      {s.categories.filter((c) => c.type === 'list').length === 0 ? <Text style={[styles.note, { color: t.muted }]}>No lists yet.</Text> : null}
      {s.categories.filter((c) => c.type === 'list').map((c) => (
        <Row key={c.id} label={c.name} detail={c.splitOnSpaces ? 'Splits items on spaces too' : 'Splits items on commas and “and”'}>
          <Switch value={c.splitOnSpaces} onValueChange={async (v) => onMessage((await store.setSplitOnSpaces(c.id, v)).message, true)} />
        </Row>
      ))}

      <SectionTitle>Data</SectionTitle>
      <View style={styles.buttons}>
        <Button label="Export JSON" onPress={() => guarded(exportToFile, 'Export includes hidden values')} />
        <Button label="Import JSON" onPress={() => guarded(importFromFile, 'Import data')} />
      </View>
      <View style={styles.buttons}>
        <Button
          label={confirmDelete ? 'Tap again to delete everything' : 'Delete all data'}
          tone="danger"
          onPress={async () => {
            if (!confirmDelete) return setConfirmDelete(true);
            setConfirmDelete(false);
            const r = await store.deleteAll();
            onMessage(r.message, r.undoable);
          }}
        />
      </View>
      <Text style={[styles.note, { color: t.muted }]}>Exports contain hidden values in plain text. Photos are not included.</Text>

      <SectionTitle>About</SectionTitle>
      <Card>
        <Text style={{ color: t.text, fontSize: 15 }}>NimbleNote · local only, no network, no accounts</Text>
        <Text style={{ color: t.muted, fontSize: 14, marginTop: 4 }}>
          Startup to focused input: {ms === null ? '—' : `${ms} ms`} (app JavaScript only)
        </Text>
      </Card>
    </View>
  );
}

function Row({ label, detail, children }: { label: string; detail?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: t.border }]}>
      <View style={{ flex: 1, paddingRight: SPACE.m }}>
        <Text style={{ color: t.text, fontSize: 16 }}>{label}</Text>
        {detail ? <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }}>{detail}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function AliasEditor({ onMessage }: { onMessage: (m: string, undoable?: boolean) => void }) {
  const t = useTheme();
  const s = useAppState();
  const [alias, setAlias] = useState('');
  const [target, setTarget] = useState('');
  const add = async () => {
    const r = await store.addAlias(alias, target);
    onMessage(r.message, r.undoable);
    if (r.undoable) { setAlias(''); setTarget(''); }
  };
  return (
    <View>
      <View style={styles.aliasAdd}>
        <TextInput value={alias} onChangeText={setAlias} placeholder="alias (pw)" placeholderTextColor={t.faint} autoCapitalize="none" autoCorrect={false}
          style={[styles.aliasInput, { color: t.text, borderColor: t.border }]} />
        <Text style={{ color: t.muted, marginHorizontal: SPACE.s }}>→</Text>
        <TextInput value={target} onChangeText={setTarget} placeholder="target (passwords)" placeholderTextColor={t.faint} autoCapitalize="none" autoCorrect={false}
          onSubmitEditing={add} style={[styles.aliasInput, { color: t.text, borderColor: t.border }]} />
        <Pressable onPress={add} style={[styles.aliasBtn, { backgroundColor: t.accent }]}><Text style={{ color: t.accentText, fontWeight: '700' }}>Add</Text></Pressable>
      </View>
      {s.aliases.map((a) => (
        <View key={a.alias} style={[styles.row, { borderBottomColor: t.border, minHeight: 44 }]}>
          <Text style={{ color: t.text, fontSize: 15, flex: 1 }}>
            {a.alias} <Text style={{ color: t.muted }}>→ {a.target}</Text>{a.builtin ? <Text style={{ color: t.faint }}>  built-in</Text> : null}
          </Text>
          <Pressable onPress={async () => onMessage((await store.removeAlias(a.alias)).message, true)} hitSlop={10} style={styles.remove} accessibilityLabel={`Remove alias ${a.alias}`}>
            <Text style={{ color: t.muted, fontSize: 18 }}>×</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SPACE.l, paddingBottom: 80 },
  title: { fontSize: 22, fontWeight: '700', paddingTop: SPACE.m },
  note: { fontSize: 13, marginTop: SPACE.s, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH + 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: SPACE.s },
  buttons: { flexDirection: 'row', gap: SPACE.s, marginBottom: SPACE.s, flexWrap: 'wrap' },
  aliasAdd: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.s },
  aliasInput: { flex: 1, borderWidth: 1, borderRadius: RADIUS.s, paddingHorizontal: SPACE.s, minHeight: 44, fontSize: 15 },
  aliasBtn: { marginLeft: SPACE.s, minHeight: 44, paddingHorizontal: SPACE.m, borderRadius: RADIUS.s, justifyContent: 'center' },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
