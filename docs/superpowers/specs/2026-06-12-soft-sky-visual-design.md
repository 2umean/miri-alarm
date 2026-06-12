# schedularm — "Soft Sky" Visual Design & Identity Spec

**Date:** 2026-06-12 · **Status:** approved direction from visual brainstorm (browser companion session)
**Scope:** full identity pass — ChainScreen, OnboardingScreen, editor dialogs, native ring screen, app icon + splash, Korean-primary copy with KO/EN i18n.
**Source decisions:** friendly-consumer mood → light-first theme → "Soft Sky" direction (chosen over "Cabin White" and "Sunrise Ticket") → AERO K brand inspiration (midnight navy `#1C2C4C` + amber `#FCB44C` on white) reinterpreted as a pale-sky palette → Pretendard typography → "Reverse clock" logo.
**Mockups:** committed alongside this spec in `2026-06-12-soft-sky-mockups/` (open in any browser).

---

## 1. Design language

**Personality:** maximum-friendly consumer app (Duolingo/Headspace energy) for airline/shift workers. Light, airy, rounded. Personality comes from *shape* (bubbles, pills) and *one warm accent*, not from color quantity. Amber is reserved for the schedule anchor and "required" emphasis; sky blue is the interactive color.

### 1.1 Color tokens

| Token | Hex | Role |
|---|---|---|
| `skyBg` | `#F2F8FF` | screen background (flat base) |
| `skyBgTop` | `#EAF4FF` | top of background gradient (`skyBgTop → #F7FBFF`) |
| `bubble` | `#FFFFFF` | cards/rows ("bubbles") |
| `sky500` | `#4FA8FF` | primary interactive: buttons, ALARM chip, outlines, links |
| `sky700` | `#2C7BD4` | pressed/emphasis, gradient end, big clock accent |
| `amber` | `#FFB84C` | the "Arrive by" anchor bubble, REQUIRED chip, sunrise accent |
| `ink` | `#1F3349` | primary text |
| `ink2` | `#6E84A3` | secondary text, day labels, inactive |
| `line` | `#D8E9FB` | hairline borders (pills, swatch edges) |
| `mintBg` / `green` | `#E9F9F0` / `#1E9E5C` | armed banner |
| `blushBg` / `red` | `#FFECEC` / `#D64545` | at-risk banner |
| `warnBg` / `warnText` | `#FFF6E5` / `#9A6B1F` | validation warnings |
| `disabledBg` / `disabledText` | `#DCE7F3` / `#8CA0BC` | disabled buttons |
| `coral` | `#FF8A7A` | disarm button (soft, non-alarming red) |

Gradients: button `sky500 → sky700` (90°); screen bg `skyBgTop → #F7FBFF` (180°); ring screen `sky700 → sky500 → amber` (170°, night→sunrise).

### 1.2 Shape & elevation

- Bubble radius **20**; chips/pills/buttons radius **999** (full round).
- Soft shadow: `rgba(40,90,160,0.08)`, y-offset 2, radius 8 (bubbles); stronger `0.22` + sky tint for the outlined wake row; `0.4` glow under primary buttons.
- The **wake row is the only outlined bubble** (2px `sky500`) — it carries the ALARM chip.
- The **"Arrive by" row is the only amber bubble** — the fixed anchor.

### 1.3 Typography

- **Pretendard** (bundled OTF statics 400/600/700/800) — all Korean + Latin UI text.
- **Nunito ExtraBold** (`@expo-google-fonts/nunito`) — *clock digits only* (HH:MM displays), for the rounded-friendly touch. Hangul never renders in Nunito.
- Scale: clocks 16–20 (chain) / 56 (ring screen), labels 13–14/700, secondary 11–12/600, screen titles 18/800, day labels 9–10.
- Wordmark: lowercase `schedularm` in Pretendard 800 + small ✈.

---

## 2. Screens

### 2.1 ChainScreen

Per mockup `soft-sky-chainscreen.html`:

- Background gradient `skyBgTop → #F7FBFF`; small `SCHEDULARM ✈` wordmark header (`ink2`, letter-spaced).
- **Status chip** (full-round pill, not a bar): armed = mint "✓ 알람 설정됨 · 기상 06:30 · 출발 07:15"; ready = white "🛏 도착 시간을 설정해 주세요"; at-risk = blush card "⚠ 알람이 울리지 않을 수 있어요 — 눌러서 해결" + reason bullets.
- **Chain bubbles** top→bottom: 🌙 잠들기 → 😴 pill → ⏰ 기상 (outlined, ALARM chip, sky700 clock) → 🚿 pill → 🚪 집에서 출발 → 🚕/🛟 pill row → 📍 도착 (amber bubble, biggest clock). Each row: emoji + label left; clock + day label (오늘/내일/어젯밤) right.
- **Duration pills float centered between bubbles** (white, `line` border, emoji + H:MM) — they read as "the gap between times".
- Validation warnings: `warnBg` rounded chips above the chain.
- **Arm button**: full-width pill, gradient sky, "알람 켜기 ✈"; armed state = "알람 끄기" soft coral (`#FF8A7A`); disabled = `disabledBg`.
- Empty state: dashed sky-border bubble, 🛬, "언제까지 도착해야 하나요?" / "탭해서 설정 — 거꾸로 계산해 드려요".

### 2.2 OnboardingScreen

Per mockup `soft-sky-onboarding.html`:

- Hero 🛫 + title "알람이 꼭 울리도록 설정할게요" + one-line reason (aggressive-OEM sentence when applicable).
- Steps as bubbles: **completed steps collapse to slim ✓ rows** (green title only); the **current step is outlined** (`sky500`) with description + "허용하기" pill. Battery step outlined **amber** with a `필수` (REQUIRED) chip.
- Continue: `disabledBg` pill "필수 단계를 완료해 주세요" → gradient "계속하기 ✈" when `isArmReliable`. "다시 확인 ↻" text link below.

### 2.3 Editor dialogs

- **DurationEditorModal**: white bubble card (radius 24) on dimmed-ink backdrop; title = field emoji + Korean label (예: "😴 수면"); round − (skyBg/sky700) and ＋ (sky500/white) buttons; Pretendard/Nunito value; 취소 ghost + 설정 pill.
- **Time picker stays the bare Android system dialog** (committed fix `5b70125`) — not themed; system locale handles its 취소/확인.

### 2.4 Ring screen (native Kotlin, AlarmActivity)

Per mockup `soft-sky-ring-icon.html`:

- Full-bleed gradient `sky700 → sky500 → amber` (night ends, sun rises).
- Content: ☀️ → "좋은 아침!" (white 800) → "이제 일어날 시간이에요" (sub) → huge clock (white, 56–72sp) → translucent white chip "🚪 {HH:mm} 출발까지 {n}분".
- One giant white full-round dismiss pill: "알람 끄기" (sky700 text).
- Built with plain Kotlin views (gradient drawable + texts + button) — no web/RN in the ring path.
- **Native API change:** `scheduleAlarm(wakeEpochMs, leaveHomeEpochMs)` — the leave instant rides along (intent extra + persisted for boot re-arm) so the countdown chip can render. JS `AlarmService.arm` passes `reverseCalc(s).leaveHome`.
- **Strings via Android resources** (`values/strings.xml` + `values-ko/strings.xml`) so the OS selects language natively.

### 2.5 Push alerts (chainAlerts)

Texts move to the i18n catalogs: 🌙 "잠들 시간이에요" / body "{wake} 기상을 위해 지금 주무세요"; 🚪 "지금 출발하세요" / "{leave}까지 출발해야 제시간에 도착해요". (EN equivalents preserved.)

### 2.6 App icon & splash

- **Logo: "Reverse clock"** (chosen) — rounded-square sky gradient tile; white clock face + hands; amber counterclockwise arrow sweeping over it = "time planned backwards". SVG master in the mockup file; production assets: `icon.png` 1024², Android adaptive (white-clock foreground on `sky700→sky500` gradient bg layer), monochrome layer for themed icons.
- **Splash:** `skyBg` background, centered icon tile + lowercase `schedularm` wordmark (`expo-splash-screen` config in `app.config.ts`).

---

## 3. i18n architecture (KO + EN by device locale)

- **Deps:** `expo-localization` (native — locale detection) + `i18n-js` (pure JS).
- `src/i18n/index.ts` — configures i18n-js with device locale, fallback `en`; exposes `t(key, params)`. `src/i18n/ko.ts`, `src/i18n/en.ts` — flat, namespaced catalogs (`chain.fallAsleep`, `banner.armed`, `onboarding.battery.title`, `issue.past-wake`, `reason.overlay-denied`, `alerts.leaveHome.body`, …). **Korean is the primary voice; English is the fallback locale.**
- All current hardcoded UI strings migrate: StatusBanner REASON_TEXT, ChainScreen ISSUE_TEXT + labels + editor titles, OnboardingScreen copy, App loading, day labels (`format.ts` DAY_TEXT → keys: 오늘/어젯밤/내일), chainAlerts notification texts.
- **Key-parity jest test**: recursively compares ko/en key sets — a missing translation fails the suite.
- Native ring screen uses Android string resources (§2.4), not the JS catalog. No in-app language switcher (device locale only — YAGNI).

---

## 4. Implementation architecture

- **`src/ui/theme.ts` (new):** `colors`, `radii`, `shadows`, `spacing`, `type` token objects (§1). All components consume tokens; no inline hex anywhere after the re-skin.
- **Fonts:** Pretendard OTFs in `assets/fonts/` + Nunito via `@expo-google-fonts/nunito`, loaded with `useFonts` in `App.tsx`; splash holds until loaded (assets only — no native rebuild).
- **Gradients:** `expo-linear-gradient` (native dep).
- **Component inventory unchanged** — restyle only; no structural rewrites. AlarmService stays the only native-module caller.
- **Build impact:** new native deps `expo-localization` + `expo-linear-gradient` + the Kotlin ring-screen/`scheduleAlarm` changes → **one** new EAS dev build at the end; all RN restyling iterates over Metro reload.
- **Testing:** key-parity i18n test (jest); existing 60-test suite must stay green (day-label change touches `format.ts` tests — they assert the mapped strings and will be updated to assert via the catalog); visual verification on the S24+ against the committed mockups.

## 5. Out of scope

Accessibility pass (Plan 4), in-app language switcher, dark theme, iOS visuals (AlarmKit milestone), pressed-state animations/haptics (nice-to-have later), Settings screen.
