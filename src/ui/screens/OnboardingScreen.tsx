import { useState } from 'react';
import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';

import { AlarmService } from '../../alarm/AlarmService';
import { AlarmHealth } from '../../alarm/alarmHealth';

type Props = { onDone: () => void };

export function OnboardingScreen({ onDone }: Props) {
  const [health, setHealth] = useState<AlarmHealth>(() => AlarmService.getHealth());
  const refresh = () => setHealth(AlarmService.getHealth());

  const has = (r: AlarmHealth['reasons'][number]) => !health.reasons.includes(r);

  const Step = ({
    title,
    desc,
    done,
    onFix,
  }: {
    title: string;
    desc: string;
    done: boolean;
    onFix: () => void;
  }) => (
    <View style={styles.step}>
      <Text style={styles.stepTitle}>
        {done ? '✓ ' : '○ '}
        {title}
      </Text>
      <Text style={styles.stepDesc}>{desc}</Text>
      {!done ? (
        <Pressable onPress={onFix} style={styles.fix}>
          <Text style={styles.fixText}>Enable</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Let's make sure your alarm can wake you</Text>
      <Text style={styles.subtitle}>
        schedularm is a safety alarm. These permissions stop your phone from silently
        killing it. {health.isAggressiveOEM ? 'Your phone’s brand is known to kill alarms — the battery step is required.' : ''}
      </Text>

      <Step
        title="Notifications & exact alarms"
        desc="So the alarm can fire on time and show up."
        done={has('notifications-denied') && has('exact-alarm-denied')}
        onFix={async () => {
          await AlarmService.requestCritical();
          refresh();
        }}
      />
      <Step
        title="Show over the lock screen"
        desc="So the alarm takes over the screen, not just a banner."
        done={has('full-screen-denied')}
        onFix={async () => {
          await AlarmService.requestCritical();
          refresh();
        }}
      />
      <Step
        title="Appear on top"
        desc="The fallback that forces full-screen on phones that suppress it."
        done={has('overlay-denied')}
        onFix={async () => {
          await AlarmService.requestOverlay();
          refresh();
        }}
      />
      {health.isAggressiveOEM ? (
        <Step
          title="Disable battery optimization"
          desc="Required on your phone — otherwise the alarm gets killed in the background."
          done={has('battery-not-whitelisted')}
          onFix={async () => {
            await AlarmService.requestBattery();
            refresh();
          }}
        />
      ) : null}

      <Pressable
        onPress={onDone}
        disabled={!health.isArmReliable}
        style={[styles.continue, health.isArmReliable ? styles.continueOn : styles.continueOff]}
      >
        <Text style={styles.continueText}>
          {health.isArmReliable ? 'Continue' : 'Finish the required steps'}
        </Text>
      </Pressable>
      <Pressable onPress={refresh}>
        <Text style={styles.recheck}>Re-check</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#0B1021', padding: 24, paddingTop: 72, gap: 12 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#9AA4C2', fontSize: 15, lineHeight: 21, marginBottom: 8 },
  step: { backgroundColor: '#161C33', borderRadius: 14, padding: 16, gap: 6 },
  stepTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  stepDesc: { color: '#9AA4C2', fontSize: 14, lineHeight: 19 },
  fix: { alignSelf: 'flex-start', backgroundColor: '#3D6BFF', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 18, marginTop: 6 },
  fixText: { color: '#FFFFFF', fontWeight: '700' },
  continue: { borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  continueOn: { backgroundColor: '#3DDC84' },
  continueOff: { backgroundColor: '#27314F' },
  continueText: { color: '#0B1021', fontSize: 18, fontWeight: '800' },
  recheck: { color: '#7E8AB0', textAlign: 'center', padding: 12 },
});
