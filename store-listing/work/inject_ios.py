#!/usr/bin/env python3
"""Inject per-scene AsyncStorage state into the iOS simulator app container.

Usage: python3 inject_ios.py <scene> [lang] [udid]
Scenes:
  standby  - active standby preset, arrival tomorrow 09:00 (scenes 04 pill-editor, 05 presets)
  early    - active early-pickup preset, arrival tomorrow 09:00, unarmed (scene 01 before arming)
  current  - no active preset (chip = current schedule), arrival tomorrow 09:00 (scenes 02, 03)
  ring     - early-pickup chain whose ⏰ alarm fires ~2 min from now (scene 06)
  snooze   - two-alarm chain, first ⏰ ~2 min out (snooze spike)
Lang: ko (default) or en — controls pill/preset display names stored in state.

Run with the app TERMINATED (simctl terminate first). Merges into the existing
manifest.json so unrelated keys (telemetry consent etc.) survive.
"""
import json
import subprocess
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

ARGS = sys.argv[1:]
SCENE = ARGS[0] if ARGS else "current"
LANG = ARGS[1] if len(ARGS) > 1 else "ko"
UDID = ARGS[2] if len(ARGS) > 2 else "CEAA3DF2-0327-4F8E-9A59-5DA6ABE0D532"
BUNDLE = "com.umean.miri"
SEOUL = ZoneInfo("Asia/Seoul")

NAMES = {
    "ko": {"sleep": "수면", "shower": "샤워", "breakfast": "아침", "commute": "지하철",
           "early": "이른 픽업", "standby": "국내선 스탠바이"},
    "en": {"sleep": "Sleep", "shower": "Shower", "breakfast": "Breakfast", "commute": "Commute",
           "early": "Early pickup", "standby": "Domestic standby"},
}[LANG]


def tomorrow_9am_ms():
    now = datetime.now(SEOUL)
    t = (now + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
    return int(t.timestamp() * 1000)


def pills(prefix, commute_min):
    return [
        {"id": f"{prefix}1", "type": "none", "icon": "😴", "name": NAMES["sleep"], "dur": 420},
        {"id": f"{prefix}2", "type": "alarm"},
        {"id": f"{prefix}3", "type": "none", "icon": "🚿", "name": NAMES["shower"], "dur": 20},
        {"id": f"{prefix}4", "type": "none", "icon": "🍳", "name": NAMES["breakfast"], "dur": 20},
        {"id": f"{prefix}5", "type": "none", "icon": "🚇", "name": NAMES["commute"], "dur": commute_min},
        {"id": f"{prefix}6", "type": "push"},
    ]


EARLY_PILLS = pills("e", 35)    # 총 8:15
STANDBY_PILLS = pills("s", 25)  # 총 8:05

# Spike scene for the snooze work (docs/superpowers/plans/2026-08-31-snooze.md):
# two ⏰ markers 5 min apart. The first fires ~2 min after arming; the second
# keeps the chain "live" so a cold launch during the snooze exercises the
# launch-time re-arm (useArmingChain re-arms only while a later alarm is
# pending) and then must fire exactly once itself (re-arm cancelled + re-
# scheduled it cleanly).
SNOOZE_PILLS = [
    {"id": "z1", "type": "none", "icon": "😴", "name": NAMES["sleep"], "dur": 420},
    {"id": "z2", "type": "alarm"},                                   # arrival − 60 min
    {"id": "z3", "type": "none", "icon": "🚿", "name": NAMES["shower"], "dur": 5},
    {"id": "z4", "type": "alarm"},                                   # arrival − 55 min
    {"id": "z5", "type": "none", "icon": "🍳", "name": NAMES["breakfast"], "dur": 20},
    {"id": "z6", "type": "none", "icon": "🚇", "name": NAMES["commute"], "dur": 35},
]


def chain(p, arrival_ms):
    return {"arrival": arrival_ms, "zone": "Asia/Seoul", "pills": p}


def build_scene(name):
    lib = {
        "presets": [
            {"id": "preset-early", "name": NAMES["early"], "pills": EARLY_PILLS},
            {"id": "preset-standby", "name": NAMES["standby"], "pills": STANDBY_PILLS},
        ],
        "activeId": None,
    }
    if name == "standby":
        lib["activeId"] = "preset-standby"
        return lib, chain(STANDBY_PILLS, tomorrow_9am_ms()), None
    if name == "early":
        lib["activeId"] = "preset-early"
        return lib, chain(EARLY_PILLS, tomorrow_9am_ms()), None
    if name == "current":
        return lib, chain(EARLY_PILLS, tomorrow_9am_ms()), None
    if name == "ring":
        now = datetime.now(SEOUL).replace(second=0, microsecond=0)
        alarm_at = now + timedelta(minutes=2)
        arrival = int((alarm_at + timedelta(minutes=75)).timestamp() * 1000)
        lib["activeId"] = "preset-early"
        return lib, chain(EARLY_PILLS, arrival), alarm_at
    if name == "snooze":
        now = datetime.now(SEOUL).replace(second=0, microsecond=0)
        alarm_at = now + timedelta(minutes=2)
        arrival = int((alarm_at + timedelta(minutes=60)).timestamp() * 1000)  # z2 = alarm_at, z4 = alarm_at + 5 min
        lib["activeId"] = "preset-early"
        return lib, chain(SNOOZE_PILLS, arrival), alarm_at
    raise SystemExit(f"unknown scene {name}")


def main():
    lib, draft, alarm_at = build_scene(SCENE)

    container = subprocess.run(
        ["xcrun", "simctl", "get_app_container", UDID, BUNDLE, "data"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    manifest_path = f"{container}/Library/Application Support/{BUNDLE}/RCTAsyncLocalStorage_V1/manifest.json"

    try:
        with open(manifest_path) as f:
            manifest = json.load(f)
    except FileNotFoundError:
        raise SystemExit(f"manifest not found — launch the app once first: {manifest_path}")

    manifest["schedularm.onboarded.v1"] = "true"
    manifest["schedularm.presets.v2"] = json.dumps(lib, ensure_ascii=False)
    manifest["schedularm.draft.v3"] = json.dumps(draft, ensure_ascii=False)
    manifest.pop("schedularm.armed.v3", None)

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, ensure_ascii=False)

    print(f"scene={SCENE} lang={LANG} written")
    if alarm_at is not None:
        print(f"RING: alarm fires at {alarm_at:%H:%M} KST — arm within ~{(alarm_at - datetime.now(SEOUL)).seconds}s")


if __name__ == "__main__":
    main()
