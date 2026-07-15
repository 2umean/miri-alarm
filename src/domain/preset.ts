import { Pill, isEventPill } from './pill';

/**
 * A preset is a named, saved pill list (design rows 08–11). It stores EVENTS
 * ONLY — never the arrival anchor or zone, which stay global on the working
 * chain. Pill ids keep their original values: ids only need uniqueness within
 * one chain, and every layer treats pills as immutable (reducers copy on
 * write), so shared references between a preset and the working chain — or
 * between two presets snapshotted from the same base — are safe.
 */
export type Preset = {
  id: string; // stable, caller-supplied (hook mints) — same contract as Pill.id
  name: string; // user-facing, non-empty (trimmed); creation UI enforces this
  pills: Pill[];
};

/**
 * The whole preset store: the library + which preset the working chain
 * mirrors. Shared by the reducer (state shape) and storage (payload shape) so
 * neither layer imports from the other — the Chain/ChainState idiom.
 * Invariant: activeId is null or the id of a preset in the list.
 */
export type PresetLibrary = {
  presets: Preset[];
  activeId: string | null;
};

/** List-row summary data: the emoji strip + "이벤트 {count}개 · 총 {H:MM}". */
export type PresetSummary = { count: number; totalMinutes: number; icons: string };

/** List-row summary data: the emoji strip + "이벤트 {count}개 · 총 {H:MM}" — EVENT pills only. */
export function presetSummary(pills: Pill[]): PresetSummary {
  const events = pills.filter(isEventPill);
  return {
    count: events.length,
    totalMinutes: events.reduce((sum, p) => sum + p.dur, 0),
    icons: events.map((p) => p.icon).join(''),
  };
}
