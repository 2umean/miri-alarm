import { Minutes } from './schedule';

/**
 * v2 model (Schedularm UI v2). The day is an ORDERED, arbitrary-length list of
 * "pills" anchored to a single arrival time. Each pill's clock times are derived
 * (engine.ts), never stored. A pill's `type` decides what happens when it ENDS:
 *   - 'none'  → timing only, no alert
 *   - 'push'  → a best-effort push notification (expo-notifications)
 *   - 'alarm' → a strong, OS-guaranteed wake alarm (bespoke native module)
 *
 * Replaces v1's fixed 4-duration Schedule (schedule.ts), which still backs the
 * current UI until Phase 2 swaps it over.
 */

export type PillType = 'none' | 'push' | 'alarm';

export const PILL_TYPES: readonly PillType[] = ['none', 'push', 'alarm'];

export type Pill = {
  id: string; // stable, caller-supplied (UI generates) — keeps the reducer pure & testable
  icon: string; // emoji
  name: string; // user-facing, free text
  dur: Minutes; // whole minutes, >= 0
  type: PillType;
};

/** Canonical v2 state — the ONLY source of truth. Every clock time is a pure function of this. */
export type Chain = {
  arrival: number | null; // the single anchor: epoch ms (secs/millis zeroed), or null before entry
  zone: string; // IANA zone captured at entry, e.g. "Asia/Seoul"
  pills: Pill[]; // chronological: pills[0] is the first activity of the day; the last ends at arrival
};

/** Per-pill duration bound, in minutes (24h). */
export const MAX_PILL_MINUTES = 24 * 60;

/**
 * A language-free pill blueprint: structure + an i18n key for the name. Display
 * names are resolved at materialize time (materializePills) so the domain layer
 * carries no UI strings, exactly like the rest of domain/.
 */
export type PillSpec = {
  icon: string;
  nameKey: string; // i18n key, resolved by the caller (Phase 2 hook) via `t`
  dur: Minutes;
  type: PillType;
};

/**
 * First-run seed pills (chronological), used when an arrival is first set on an
 * empty chain — the v2 mockup's "기본 펄로 채웠어요". Durations match the design.
 */
export const SEED_PILLS: readonly PillSpec[] = [
  { icon: '😴', nameKey: 'pill.sleep', dur: 420, type: 'alarm' },
  { icon: '🚿', nameKey: 'pill.shower', dur: 20, type: 'none' },
  { icon: '🍳', nameKey: 'pill.breakfast', dur: 20, type: 'none' },
  { icon: '🚇', nameKey: 'pill.commute', dur: 35, type: 'none' },
];
