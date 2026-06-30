import { useCallback, useEffect, useState } from 'react';

import { AlarmService } from '../alarm/AlarmService';
import { AlarmHealth } from '../alarm/alarmHealth';
import { Chain, primaryEventInstant } from '../domain';
import { clearArmedChain, loadArmedChain, saveArmedChain } from '../storage/armedChain';

/**
 * v2 twin of useArming: owns the armed-chain snapshot + native arming, keyed off
 * the chain's primary instant (so a still-future armed alarm survives relaunch).
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
      const primary = c ? primaryEventInstant(c) : null;
      if (c && primary != null && primary > Date.now()) setArmed(c);
      else if (c) clearArmedChain();
    });
    return () => {
      cancelled = true;
    };
  }, [refreshHealth]);

  const arm = useCallback(
    async (chain: Chain) => {
      // Arm native FIRST — if persistence fails the alarm still rings (fail-safe).
      AlarmService.armChain(chain);
      await saveArmedChain(chain);
      setArmed(chain);
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
