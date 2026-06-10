import { useCallback, useEffect, useState } from 'react';

import { AlarmService } from '../alarm/AlarmService';
import { AlarmHealth } from '../alarm/alarmHealth';
import { Schedule, reverseCalc } from '../domain';
import { clearArmed, loadArmed, saveArmed } from '../storage/armedSchedule';

export function useArming() {
  const [armed, setArmed] = useState<Schedule | null>(null);
  const [health, setHealth] = useState<AlarmHealth>(() => AlarmService.getHealth());

  const refreshHealth = useCallback(() => setHealth(AlarmService.getHealth()), []);

  // Restore a still-valid armed schedule so the banner survives relaunch.
  useEffect(() => {
    refreshHealth();
    loadArmed().then((s) => {
      if (s && reverseCalc(s).wake > Date.now()) {
        setArmed(s);
      } else if (s) {
        clearArmed();
      }
    });
  }, [refreshHealth]);

  const arm = useCallback(
    async (schedule: Schedule) => {
      AlarmService.arm(schedule);
      await saveArmed(schedule);
      setArmed(schedule);
      refreshHealth();
    },
    [refreshHealth],
  );

  const disarm = useCallback(async () => {
    AlarmService.dismiss();
    await clearArmed();
    setArmed(null);
  }, []);

  return { armed, health, arm, disarm, refreshHealth };
}
