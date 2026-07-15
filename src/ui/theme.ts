/**
 * Soft Sky design tokens (spec §1, docs/superpowers/specs/2026-06-12-soft-sky-visual-design.md).
 * The ONLY place colors/radii/shadows/fonts are defined — components must not
 * carry inline hex values.
 */

export const colors = {
  skyBg: '#F2F8FF',
  skyBgTop: '#EAF4FF',
  skyBgBottom: '#F7FBFF',
  bubble: '#FFFFFF',
  sky500: '#4FA8FF',
  sky700: '#2C7BD4',
  amber: '#FFB84C',
  ink: '#1F3349',
  ink2: '#6E84A3',
  line: '#D8E9FB',
  mintBg: '#E9F9F0',
  green: '#1E9E5C',
  blushBg: '#FFECEC',
  red: '#D64545',
  blushText: '#B36B6B',
  warnBg: '#FFF6E5',
  warnText: '#9A6B1F',
  disabledBg: '#DCE7F3',
  disabledText: '#8CA0BC',
  coral: '#FF8A7A',
  white: '#FFFFFF',
  backdrop: 'rgba(12,24,48,0.34)', // modal dim behind bottom sheets
  // v2 pill-chain palette (Schedularm UI v2).
  faint: '#94A8C2', // start row + drag handles
  pushEventBorder: '#BBD9F7', // push event-row outline
  alarmCardBg: '#FFF8EE', // alarm pill card fill
  alarmCardBorder: '#FFE0A6', // alarm pill card border
  alarmAccentText: '#E8743C', // alarm event time
  dashed: '#A9CFF5', // dashed "add" affordances (＋ 이벤트 추가, ＋ 새 프리셋)
} as const;

/**
 * Per-marker-type visual recipe (v3). Keyed by 'push' | 'alarm' so a marker row
 * reads its colors from one place instead of branching with inline hex.
 */
export const pillStyle = {
  push: {
    cardBg: colors.skyBg,
    cardBorder: colors.line,
    accent: colors.sky500,
    durText: colors.sky700,
    eventBorder: colors.pushEventBorder,
    eventTime: colors.sky700,
    badgeBg: colors.sky500,
    eventIcon: '🔔',
  },
  alarm: {
    cardBg: colors.alarmCardBg,
    cardBorder: colors.alarmCardBorder,
    accent: colors.amber,
    durText: colors.warnText,
    eventBorder: colors.coral,
    eventTime: colors.alarmAccentText,
    badgeBg: colors.amber,
    eventIcon: '⏰',
  },
} as const;

export const radii = { bubble: 20, modal: 24, pill: 999 } as const;

export const spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24 } as const;

/** Static font families registered in App.tsx. Use fontFamily, never fontWeight. */
export const fonts = {
  regular: 'Pretendard-Regular',
  semi: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  extra: 'Pretendard-ExtraBold',
  /** Latin clock digits only (HH:MM) — Hangul never renders in Nunito. */
  clock: 'Nunito-ExtraBold',
} as const;

/** Soft shadow recipes (iOS shadow* + Android elevation). */
export const shadows = {
  bubble: {
    shadowColor: '#285AA0',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  focus: {
    shadowColor: '#4FA8FF',
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 4,
  },
  button: {
    shadowColor: '#4FA8FF',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 5,
  },
} as const;
