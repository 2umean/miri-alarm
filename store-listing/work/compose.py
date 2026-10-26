#!/usr/bin/env python3
"""Compose Play Store listing graphics from raw emulator captures."""
import subprocess, os, sys

ROOT = "/Users/umean/Documents/dev/agent/miri-alarm/store-listing"
WORK = f"{ROOT}/work"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

SHOTS = [
    ("01", "01-hero-armed.png",    "도착 시간만 정하세요",       "나머지는 미리가 거꾸로 계산해요"),
    ("02", "02-arrival-picker.png", "언제까지 도착해야 하나요?",  "날짜와 시간만 정하면 끝이에요"),
    ("03", "03-chain-markers.png",  "알림과 알람을 원하는 곳에",  "부드러운 알림 🔔 확실한 알람 ⏰"),
    ("04", "04-pill-editor.png",    "단계마다 이모지와 시간을",   "변경은 프리셋에 자동 저장돼요"),
    ("05", "05-presets.png",        "루틴은 프리셋으로 한 번에",  "이른 픽업, 스탠바이, 휴무까지"),
    ("06", "06-ring.png",           "잠금화면 위 풀스크린 알람",  "끄기 전엔 사라지지 않아요"),
]
TABLET_SHOTS = {"01", "02", "05", "06"}

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
html,body {{ width:1080px; height:1920px; overflow:hidden; }}
body {{ background: linear-gradient(180deg, #DDEEFF 0%, #EAF4FF 45%, #F7FBFF 100%);
  font-family:'Pretendard'; position:relative; }}
.glow {{ position:absolute; width:1400px; height:1400px; border-radius:50%;
  background: radial-gradient(circle, rgba(79,168,255,0.16) 0%, rgba(79,168,255,0) 65%);
  top:-500px; left:-160px; }}
.caption {{ position:absolute; top:118px; width:100%; text-align:center; z-index:2; }}
.caption h1 {{ font-weight:800; font-size:72px; color:#1F3349; letter-spacing:-1.5px; }}
.caption p {{ font-weight:600; font-size:42px; color:#5E7699; margin-top:22px; letter-spacing:-0.5px; }}
.frame {{ position:absolute; top:392px; left:50%; transform:translateX(-50%);
  width:854px; border-radius:60px; background:#fff; padding:14px;
  box-shadow: 0 46px 110px rgba(40,90,160,0.30), 0 12px 34px rgba(40,90,160,0.16); }}
.frame .clip {{ border-radius:48px; overflow:hidden; }}
.frame img {{ width:100%; display:block; }}
</style></head><body>
<div class="glow"></div>
<div class="caption"><h1>{title}</h1><p>{sub}</p></div>
<div class="frame"><div class="clip"><img src="file://{img}"></div></div>
</body></html>"""

FEATURE_HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
{font_css}
* {{ margin:0; padding:0; box-sizing:border-box; }}
html,body {{ width:1024px; height:500px; overflow:hidden; }}
body {{ background: linear-gradient(118deg, #4FA8FF 0%, #3B92EC 55%, #2C7BD4 100%);
  font-family:'Pretendard'; position:relative; }}
.sun {{ position:absolute; bottom:-210px; right:-90px; width:520px; height:520px;
  border-radius:50%; background: radial-gradient(circle, rgba(255,184,76,0.55) 0%, rgba(255,184,76,0.0) 70%); }}
.ring1 {{ position:absolute; top:-160px; left:-120px; width:430px; height:430px; border-radius:50%;
  border: 3px solid rgba(255,255,255,0.14); }}
.ring2 {{ position:absolute; bottom:-190px; left:230px; width:380px; height:380px; border-radius:50%;
  border: 3px solid rgba(255,255,255,0.10); }}
.row {{ position:absolute; top:0; left:0; width:100%; height:100%;
  display:flex; align-items:center; justify-content:center; gap:64px; }}
.icon {{ width:292px; height:292px; border-radius:66px;
  box-shadow: 0 28px 60px rgba(15,45,90,0.38); }}
.word {{ color:#fff; }}
.word .brand {{ font-weight:800; font-size:150px; letter-spacing:10px; line-height:1; }}
.word .tail {{ display:flex; align-items:center; gap:18px; margin-top:26px; }}
.word .tail .bar {{ width:132px; height:10px; border-radius:5px; background:#FFB84C; }}
.word .tail .plane {{ font-size:44px; }}
</style></head><body>
<div class="sun"></div><div class="ring1"></div><div class="ring2"></div>
<div class="row">
  <img class="icon" src="file://{icon}">
  <div class="word"><div class="brand">MIRI</div>
    <div class="tail"><div class="bar"></div><div class="plane">✈</div></div></div>
</div>
</body></html>"""

def render(html_path, out_png, w, h, dsf):
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    f"--force-device-scale-factor={dsf}", f"--window-size={w},{h}",
                    f"--screenshot={out_png}", "--virtual-time-budget=5000",
                    f"file://{html_path}"], check=True, capture_output=True)

def to_jpeg(png, jpg):
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "95",
                    png, "--out", jpg], check=True, capture_output=True)
    os.remove(png)

# --- screenshots (phone + tablets) ---
for num, raw, title, sub in SHOTS:
    html = SHOT_HTML.format(font_css=FONT_CSS, title=title, sub=sub, img=f"{ROOT}/raw/{raw}")
    hp = f"{WORK}/shot-{num}.html"
    open(hp, "w").write(html)
    render(hp, f"{WORK}/p{num}.png", 1080, 1920, 1)
    to_jpeg(f"{WORK}/p{num}.png", f"{ROOT}/phone/{num}.jpg")
    if num in TABLET_SHOTS:
        render(hp, f"{WORK}/t7-{num}.png", 1080, 1920, 4/3)
        to_jpeg(f"{WORK}/t7-{num}.png", f"{ROOT}/tablet-7/{num}.jpg")
        render(hp, f"{WORK}/t10-{num}.png", 1080, 1920, 2)
        to_jpeg(f"{WORK}/t10-{num}.png", f"{ROOT}/tablet-10/{num}.jpg")
    print(f"shot {num} done")

# --- feature graphic ---
fh = FEATURE_HTML.format(font_css=FONT_CSS, icon="/Users/umean/Documents/dev/agent/miri-alarm/assets/icon.png")
open(f"{WORK}/feature.html", "w").write(fh)
render(f"{WORK}/feature.html", f"{WORK}/feature.png", 1024, 500, 1)
to_jpeg(f"{WORK}/feature.png", f"{ROOT}/feature-graphic.jpg")
print("feature graphic done")
