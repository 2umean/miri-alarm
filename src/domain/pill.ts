import { Minutes } from './schedule';

/**
 * v3 model (marker pills). The day is an ORDERED list anchored to a single
 * arrival time. An EventPill is a block of time; a MarkerPill is a standalone,
 * zero-duration alert that fires where the previous item ends:
 *   - 'push'  → a best-effort push notification (expo-notifications)
 *   - 'alarm' → a strong, OS-guaranteed wake alarm (bespoke native module)
 * `type` stays the discriminator — it is literally what the editor's segmented
 * control sets. Replaces v2's event-carries-its-alert model.
 */

export type PillType = 'none' | 'push' | 'alarm';

export const PILL_TYPES: readonly PillType[] = ['none', 'push', 'alarm'];

export type EventPill = {
  id: string; // stable, caller-supplied (UI generates) — keeps the reducer pure & testable
  type: 'none';
  icon: string; // emoji
  name: string; // user-facing, free text
  dur: Minutes; // whole minutes, [0, MAX_PILL_MINUTES]
};

export type MarkerPill = {
  id: string;
  type: 'push' | 'alarm'; // no icon, no name, no dur — the label is derived (markerLabel.ts)
};

export type Pill = EventPill | MarkerPill;

export const isEventPill = (p: Pill): p is EventPill => p.type === 'none';
export const isMarkerPill = (p: Pill): p is MarkerPill => p.type !== 'none';

/** The one seam. A marker occupies zero minutes, so its startAt === endAt = its fire instant. */
export const pillDur = (p: Pill): Minutes => (isEventPill(p) ? p.dur : 0);

/** Canonical state — the ONLY source of truth. Every clock time is a pure function of this. */
export type Chain = {
  arrival: number | null; // the single anchor: epoch ms (secs/millis zeroed), or null before entry
  zone: string; // IANA zone captured at entry, e.g. "Asia/Seoul"
  pills: Pill[]; // chronological: pills[0] is the first item of the day; the last event ends at arrival
};

/** Per-pill duration bound, in minutes (24h). */
export const MAX_PILL_MINUTES = 24 * 60;

/**
 * Language-free pill blueprints mirroring the Pill union: structure + an i18n
 * key for event names, resolved at materialize time (materializePills) so the
 * domain layer carries no UI strings.
 */
export type EventPillSpec = { type: 'none'; icon: string; nameKey: string; dur: Minutes };
export type MarkerPillSpec = { type: 'push' | 'alarm' };
export type PillSpec = EventPillSpec | MarkerPillSpec;

/**
 * First-run seed pills (chronological). Ships PRE-SPLIT: 수면 is a plain event
 * followed by a bare ⏰ marker, so toggling 수면's kind can never silently
 * delete 7 hours from the day. Default 09:00 arrival → 시작 00:45 ·
 * ⏰ 수면 종료 07:45 · 📍 도착 09:00 (design 2A).
 */
export const SEED_PILLS: readonly PillSpec[] = [
  { type: 'none', icon: '😴', nameKey: 'pill.sleep', dur: 420 },
  { type: 'alarm' },
  { type: 'none', icon: '🚿', nameKey: 'pill.shower', dur: 20 },
  { type: 'none', icon: '🍳', nameKey: 'pill.breakfast', dur: 20 },
  { type: 'none', icon: '🚇', nameKey: 'pill.commute', dur: 35 },
];

/**
 * The editor sheet's full local draft. It always carries every field regardless
 * of the selected type, so toggling kinds within one sheet session is free —
 * the discard happens only at pillFromDraft (저장).
 */
export type PillDraft = { icon: string; name: string; dur: Minutes; type: PillType };

/** Blank event draft: the create sheet's default AND the seed when opening an existing marker. */
export const DEFAULT_PILL_DRAFT: PillDraft = { icon: '🧥', name: '', dur: 15, type: 'none' };

/** Commit a draft: 'none' persists an EventPill; a marker type drops the event fields. */
export function pillFromDraft(id: string, draft: PillDraft): Pill {
  return draft.type === 'none'
    ? { id, type: 'none', icon: draft.icon, name: draft.name, dur: draft.dur }
    : { id, type: draft.type };
}

/** Seed the sheet from an existing pill. A marker stores nothing to edit, so it seeds a blank draft. */
export function draftFromPill(pill: Pill): PillDraft {
  return isEventPill(pill)
    ? { icon: pill.icon, name: pill.name, dur: pill.dur, type: 'none' }
    : { ...DEFAULT_PILL_DRAFT, type: pill.type };
}
