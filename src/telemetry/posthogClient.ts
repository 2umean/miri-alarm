import PostHog, { PostHogPersistedProperty } from 'posthog-react-native';

import type { TelemetryProps } from './events';

const POSTHOG_API_KEY = 'phc_ugpiArFE7jNDcXcx6vtyrsHXEog8MnygXyN72jkHQgF9';
const POSTHOG_HOST = 'https://eu.i.posthog.com'; // EU project — PIPA cross-border posture

let client: PostHog | null = null;

/** Construct-on-grant: no client object exists (and nothing can touch the
 * network) until consent. optIn() clears a persisted opt-out from an earlier
 * revoke — PostHog persists that flag across launches. */
export function startPosthog(): void {
  if (!client) {
    client = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      captureAppLifecycleEvents: false, // default TRUE since 4.39 — explicit off
      enableSessionReplay: false, // default, restated to document intent
      preloadFeatureFlags: false, // we use no flags; skip the startup fetch
    });
  }
  void client.optIn();
}

/** Revocation: opt out AND drop the persisted backlog — the SDK's flush timer
 * and AppState-foreground flush still fire, but no-op on an empty queue, so
 * nothing can leave the device after this returns. */
export function stopPosthog(): void {
  if (!client) return;
  void client.optOut();
  client.setPersistedProperty(PostHogPersistedProperty.Queue, null);
}

export function capturePosthog(event: string, props: TelemetryProps): void {
  client?.capture(event, props);
}
