import { ConsentState, loadConsent, saveConsent } from './consent';
import { sanitizeProps, TelemetryEventName, TelemetryEvents } from './events';
import { capturePosthog, startPosthog, stopPosthog } from './posthogClient';
import { startSentry, stopSentry } from './sentryClient';

export type { ConsentState } from './consent';

let consent: ConsentState = 'unset';
let ready: Promise<void> | null = null;

// Each vendor guarded independently — a throwing constructor/shutdown in one
// SDK must never skip or crash out of the other.
const startAll = () => {
  try {
    startSentry();
  } catch {}
  try {
    startPosthog();
  } catch {}
};
const stopAll = () => {
  try {
    stopPosthog();
  } catch {}
  try {
    stopSentry();
  } catch {}
};

/**
 * Idempotent; App.tsx calls it once on mount, and every other entry point
 * awaits it internally — so callers never race the stored-consent read.
 * Starts the SDKs iff a previous session granted consent.
 */
export function initTelemetry(): Promise<void> {
  if (!ready) {
    ready = loadConsent()
      .then((stored) => {
        consent = stored;
        if (stored === 'granted') {
          startAll();
        }
      })
      .catch(() => {}); // telemetry must never break startup
  }
  return ready;
}

export async function getConsent(): Promise<ConsentState> {
  await initTelemetry();
  return consent;
}

/** Persist a choice and start/stop collection immediately (no restart needed). */
export async function setConsent(granted: boolean): Promise<void> {
  await initTelemetry();
  const next = granted ? 'granted' : 'denied';
  if (consent === next) return;
  const previous = consent;
  consent = next;
  await saveConsent(next);
  if (consent !== next) return; // a newer setConsent call superseded this one mid-await
  if (granted) {
    startAll();
    // Only a CHANGE after an initial choice is an event; the initial choice is
    // carried by onboarding_completed. Revocation sends nothing — no byte may
    // leave the device after withdrawal.
    if (previous === 'denied') track('consent_changed', { granted: true });
  } else {
    stopAll();
  }
}

/** Fire-and-forget; drops silently unless consent is granted. Never throws. */
export function track<E extends TelemetryEventName>(event: E, props: TelemetryEvents[E]): void {
  void (async () => {
    try {
      await initTelemetry();
      if (consent !== 'granted') return;
      capturePosthog(event, sanitizeProps(props));
    } catch {
      // deliberately swallowed — see spec: telemetry never crashes the app
    }
  })();
}
