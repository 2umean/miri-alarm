import { useCallback, useEffect, useState } from 'react';

import { AlarmService } from '../alarm/AlarmService';
import { AlarmHealth } from '../alarm/alarmHealth';
import { Chain, latestAlarmInstant } from '../domain';
import { clearArmedChain, loadArmedChain, saveArmedChain } from '../storage/armedChain';

/**
 * v2 twin of useArming: owns the armed-chain snapshot + native arming. An armed
 * chain stays live until its LAST alarm has fired (latestAlarmInstant), not the
 * first — so dismissing the wake alarm doesn't hide a still-scheduled backup.
 */
export function useArmingChain() {
  const [armed, setArmed] = useState<Chain | null>(null);
  const [health, setHealth] = useState<AlarmHealth>(() => AlarmService.getHealth());

  const refreshHealth = useCallback(() => setHealth(AlarmService.getHealth()), []);

  useEffect(() => {
    let cancelled = false;
    refreshHealth();
    loadArmedChain().then((c) => {
      if (cancelled) return;
      const last = c ? latestAlarmInstant(c) : null;
      if (c && last != null && last > Date.now()) {
        setArmed(c);
        // Re-ensure native scheduling matches the snapshot — self-heals after an
        // app update cancels AlarmManager alarms, or any native↔JS divergence.
        // Best-effort: a failure here doesn't drop the (still-valid) snapshot.
        AlarmService.armChain(c).catch((e) =>
          console.warn('[useArmingChain] re-arm on launch failed:', e),
        );
      } else if (c) {
        clearArmedChain();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshHealth]);

  const arm = useCallback(
    async (chain: Chain) => {
      try {
        // Arm native FIRST and await it — only persist + mark armed if the OS
        // actually scheduled the alarms (else a silent oversleep would look armed).
        await AlarmService.armChain(chain);
        await saveArmedChain(chain);
        setArmed(chain);
      } catch (e) {
        console.warn('[useArmingChain] arm failed; leaving un-armed:', e);
      }
      refreshHealth();
    },
    [refreshHealth],
  );

  const disarm = useCallback(async () => {
    AlarmService.dismiss();
    await clearArmedChain();
    setArmed(null);
  }, []);

  return { armed, health, arm, disarm, refreshHealth };
}
