#!/usr/bin/env python3
"""Compose App Store listing screenshots (1320x2868, 6.9-inch class) from raw
iPhone 17 Pro Max simulator captures. Same visual system as the Play set
(compose.py), scaled to the taller iOS canvas."""
import os
import subprocess
import sys

LANG = sys.argv[1] if len(sys.argv) > 1 else "ko"

ROOT = "/Users/umean/Documents/dev/agent/miri-alarm/store-listing"
WORK = f"{ROOT}/work"
RAW = f"{ROOT}/ios-raw" + ("" if LANG == "ko" else f"-{LANG}")
OUT = f"{ROOT}/ios" + ("" if LANG == "ko" else f"-{LANG}")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

W, H = 1320, 2868

SHOTS_KO = [
    ("01", "01-hero-armed.png",     "도착 시간만 정하세요",       "나머지는 미리가 거꾸로 계산해요"),
    ("02", "02-arrival-picker.png", "언제까지 도착해야 하나요?",  "날짜와 시간만 정하면 끝이에요"),
    ("03", "03-chain-markers.png",  "알림과 알람을 원하는 곳에",  "부드러운 알림 🔔 확실한 알람 ⏰"),
    ("04", "04-pill-editor.png",    "단계마다 이모지와 시간을",   "변경은 프리셋에 자동 저장돼요"),
    ("05", "05-presets.png",        "루틴은 프리셋으로 한 번에",  "이른 픽업, 스탠바이, 휴무까지"),
    ("06", "06-preset-load.png",    "루틴 바꾸기는 탭 한 번",     "불러오면 시간표 전체가 다시 계산돼요"),
    ("07", "07-ring-snooze.png",    "끄거나, 5분 뒤 다시",        "잠금화면 알람에 스누즈까지"),
]
SHOTS_EN = [
    ("01", "01-hero-armed.png",     "Set only your arrival time",  "MIRI works the rest out backwards"),
    ("02", "02-arrival-picker.png", "When do you need to arrive?", "Just pick the date and time"),
    ("03", "03-chain-markers.png",  "Alerts and alarms anywhere",  "Gentle alerts 🔔 hard alarms ⏰"),
    ("04", "04-pill-editor.png",    "Emoji and minutes per step",  "Changes auto-save to your preset"),
    ("05", "05-presets.png",        "Routines become presets",     "Early pickup, standby, day off"),
    ("06", "06-preset-load.png",    "Switch routines in one tap",  "Load one and every time recomputes"),
    ("07", "07-ring-snooze.png",    "Stop it — or snooze 5 minutes", "Right on the lock-screen alarm"),
]
SHOTS = SHOTS_KO if LANG == "ko" else SHOTS_EN
H1_SIZE = 92 if LANG == "ko" else 76
P_SIZE = 54 if LANG == "ko" else 48

FONT_CSS = f"""
@font-face {{ font-family: 'Pretendard'; font-weight: 800;
  src: url('file://{WORK}/Pretendard-ExtraBold.otf') format('opentype'); }}
@font-face {{ font-family: 'Pretendard'; font-weight: 700;
  src: url('file://{WORK}/Pretendard-Bold.otf') format('opentype'); }}
@font-face {{ font-family: 'Pretendard'; font-weight: 600;
  src: url('file://{WORK}/Pretendard-SemiBold.otf') format('opentype'); }}
"""

SHOT_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
{font_css}
* {{ margin:0; padding:0; box-sizing:border-box; }}
html,body {{ width:1320px; height:2868px; overflow:hidden; }}
body {{ background: linear-gradient(180deg, #DDEEFF 0%, #EAF4FF 45%, #F7FBFF 100%);
  font-family:'Pretendard'; position:relative; }}
.glow {{ position:absolute; width:1720px; height:1720px; border-radius:50%;
  background: radial-gradient(circle, rgba(79,168,255,0.16) 0%, rgba(79,168,255,0) 65%);
  top:-620px; left:-200px; }}
.caption {{ position:absolute; top:170px; width:100%; text-align:center; z-index:2; }}
.caption h1 {{ font-weight:800; font-size:{h1}px; color:#1F3349; letter-spacing:-2px; }}
.caption p {{ font-weight:600; font-size:{p_size}px; color:#5E7699; margin-top:30px; letter-spacing:-0.6px; }}
.frame {{ position:absolute; top:520px; left:50%; transform:translateX(-50%);
  width:1090px; border-radius:74px; background:#fff; padding:17px;
  box-shadow: 0 56px 134px rgba(40,90,160,0.30), 0 15px 42px rgba(40,90,160,0.16); }}
.frame .clip {{ border-radius:59px; overflow:hidden; }}
.frame img {{ width:100%; display:block; }}
</style></head><body>
<div class="glow"></div>
<div class="caption"><h1>{title}</h1><p>{sub}</p></div>
<div class="frame"><div class="clip"><img src="file://{img}"></div></div>
</body></html>"""


def render(html_path, out_png):
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=1", f"--window-size={W},{H}",
                    f"--screenshot={out_png}", "--virtual-time-budget=5000",
                    f"file://{html_path}"], check=True, capture_output=True)


def to_jpeg(png, jpg):
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "95",
                    png, "--out", jpg], check=True, capture_output=True)
    os.remove(png)


os.makedirs(OUT, exist_ok=True)
for num, raw, title, sub in SHOTS:
    src = f"{RAW}/{raw}"
    if not os.path.exists(src):
        print(f"shot {num} SKIPPED (no {raw})")
        continue
    html = SHOT_HTML.format(font_css=FONT_CSS, title=title, sub=sub, img=src, h1=H1_SIZE, p_size=P_SIZE)
    hp = f"{WORK}/ios-shot-{num}.html"
    with open(hp, "w") as f:
        f.write(html)
    render(hp, f"{WORK}/ios-p{num}.png")
    to_jpeg(f"{WORK}/ios-p{num}.png", f"{OUT}/{num}.jpg")
    print(f"shot {num} done")
