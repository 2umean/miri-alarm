import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  dismiss,
  getPermissionsStatus,
  requestPermissions,
  scheduleAlarm,
  type PermissionStatus,
} from '../modules/schedularm-alarm';

const RING_DELAY_MS = 2 * 60 * 1000; // "Ring in 2 min"
const REBOOT_TEST_DELAY_MS = 15 * 60 * 1000; // long lead so a reboot finishes before it fires

export default function AlarmSpike() {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const [lastAction, setLastAction] = useState<string>('—');

  const refreshStatus = useCallback(() => {
    try {
      setStatus(getPermissionsStatus());
    } catch (e) {
      Alert.alert('Status error', String(e));
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const onRequestPermissions = useCallback(async () => {
    try {
      await requestPermissions();
    } catch (e) {
      Alert.alert('Permission error', String(e));
    } finally {
      // Re-read after the user (hopefully) returns from settings.
      refreshStatus();
    }
  }, [refreshStatus]);

  const armIn = useCallback((ms: number) => {
    try {
      const fireAt = Date.now() + ms;
      scheduleAlarm(fireAt);
      setLastAction(`Armed for ${new Date(fireAt).toLocaleTimeString()}`);
    } catch (e) {
      Alert.alert('Schedule error', String(e));
    }
  }, []);

  const onDismiss = useCallback(() => {
    try {
      dismiss();
      setLastAction('Dismissed');
    } catch (e) {
      Alert.alert('Dismiss error', String(e));
    }
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>schedularm — M0 alarm spike</Text>

      <View style={styles.statusCard}>
        <StatusRow label="Exact alarms" ok={status?.canScheduleExactAlarms} />
        <StatusRow label="Full-screen intent" ok={status?.canUseFullScreenIntent} />
        <StatusRow label="Notifications" ok={status?.canPostNotifications} />
      </View>

      <Button label="Request permissions" onPress={onRequestPermissions} />
      <Button label="Ring in 2 min" onPress={() => armIn(RING_DELAY_MS)} kind="primary" />
      <Button label="Ring in 15 min (reboot test)" onPress={() => armIn(REBOOT_TEST_DELAY_MS)} kind="primary" />
      <Button label="Dismiss" onPress={onDismiss} kind="danger" />
      <Button label="Refresh status" onPress={refreshStatus} kind="ghost" />

      <Text style={styles.lastAction}>Last action: {lastAction}</Text>
      <Text style={styles.hint}>
        Arm, then lock the screen / let it Doze. The alarm must ring full-screen
        with looping audio until you tap Dismiss.
      </Text>
    </ScrollView>
  );
}

function StatusRow({ label, ok }: { label: string; ok?: boolean }) {
  const text = ok == null ? '…' : ok ? '✓ granted' : '✗ missing';
  const color = ok == null ? '#9AA4C2' : ok ? '#3DDC84' : '#FF5C5C';
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color }]}>{text}</Text>
    </View>
  );
}

function Button({
  label,
  onPress,
  kind = 'default',
}: {
  label: string;
  onPress: () => void;
  kind?: 'default' | 'primary' | 'danger' | 'ghost';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${kind}`],
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonText, kind === 'ghost' && styles.buttonTextGhost]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#0B1021',
    padding: 24,
    paddingTop: 72,
    gap: 14,
  },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '700', marginBottom: 8 },
  statusCard: {
    backgroundColor: '#161C33',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 8,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statusLabel: { color: '#C7CEE6', fontSize: 16 },
  statusValue: { fontSize: 16, fontWeight: '600' },
  button: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  button_default: { backgroundColor: '#2A3A66' },
  button_primary: { backgroundColor: '#3D6BFF' },
  button_danger: { backgroundColor: '#B5304A' },
  button_ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2A3A66' },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  buttonTextGhost: { color: '#9AA4C2' },
  lastAction: { color: '#9AA4C2', fontSize: 14, marginTop: 8 },
  hint: { color: '#5C6688', fontSize: 13, lineHeight: 18 },
});
