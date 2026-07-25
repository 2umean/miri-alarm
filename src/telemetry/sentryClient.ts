import * as Sentry from '@sentry/react-native';

const SENTRY_DSN =
  'https://a08534baf94f16a2c9c825c52301e319@o4511783754727424.ingest.de.sentry.io/4511783770521680'; // EU ingest

let isStarted = false;

/** Idempotent. Called only after consent — Sentry.init installs the global
 * crash handlers, so before this runs nothing is captured or sent. */
export function startSentry(): void {
  if (isStarted) return;
  isStarted = true;
  Sentry.init({
    dsn: SENTRY_DSN,
    // Crashes + unhandled JS errors only: tracesSampleRate omitted (no tracing),
    // replay options omitted (no replay), sendDefaultPii omitted (defaults false).
    enableAutoSessionTracking: false, // no release-health session pings
  });
}

/** Stops capture AND transport (revocation). Re-grant calls startSentry again. */
export function stopSentry(): void {
  if (!isStarted) return;
  isStarted = false;
  void Sentry.close(); // no args; Promise<void> — fire-and-forget by design
}
