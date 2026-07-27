import * as Sentry from '@sentry/react-native';

const SENTRY_DSN =
  'https://a08534baf94f16a2c9c825c52301e319@o4511783754727424.ingest.de.sentry.io/4511783770521680'; // EU ingest

let isStarted = false;
let pendingClose: Promise<void> = Promise.resolve();

/** Idempotent. Init is deferred past any in-flight close() so a quick
 * revoke→re-grant cannot shut down the freshly re-inited client. */
export function startSentry(): void {
  if (isStarted) return;
  isStarted = true;
  void pendingClose
    .then(() => {
      if (!isStarted) return; // revoked again while the old close was in flight
      Sentry.init({
        dsn: SENTRY_DSN,
        // Crashes + unhandled JS errors only: tracesSampleRate omitted (no tracing),
        // replay options omitted (no replay), sendDefaultPii omitted (defaults false).
        enableAutoSessionTracking: false, // no release-health session pings
      });
    })
    .catch(() => {});
}

/** Flushes buffered events then stops transport (Sentry.close semantics —
 * the small pre-revocation buffer may drain during close; accepted trade-off,
 * nothing NEW is captured from this point). */
export function stopSentry(): void {
  if (!isStarted) return;
  isStarted = false;
  pendingClose = Sentry.close().then(() => {}).catch(() => {});
}
