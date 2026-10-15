import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { authenticate } from '../services/auth';
import { Button } from './kit';
import { SPACE, useTheme } from './theme';

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const t = useTheme();
  const [msg, setMsg] = useState('');
  const unlock = async () => {
    const r = await authenticate('Unlock NimbleNote', true);
    if (r.ok) onUnlock();
    else setMsg(r.reason);
  };
  useEffect(() => { void unlock(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Text style={[styles.title, { color: t.text }]}>NimbleNote</Text>
      <Text style={[styles.sub, { color: t.muted }]}>Locked</Text>
      <Button label="Unlock" tone="accent" onPress={unlock} />
      {msg ? <Text style={[styles.sub, { color: t.muted, marginTop: SPACE.m }]}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xl },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 15, marginTop: SPACE.s, marginBottom: SPACE.xl },
});
