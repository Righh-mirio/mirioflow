"""Generates the Mirioflow app icon and tray icons. See README.md.

Artwork: a white tiger roaring, with dark stripes and amber eyes, on orange.
The tiger is drawn in a 200x200 box; the same paths are used by
src/components/MirioflowWordmark.tsx.
"""
import math
import os
import shutil
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ICONS = os.path.normpath(os.path.join(HERE, "..", "..", "src-tauri", "icons"))

ORANGE_TOP = "#fb7c1f"
ORANGE = "#e2550a"
WHITE = "#ffffff"
INK = "#2b0f05"  # stripes, eyes, nose and mouth
EYE = "#fbbf24"  # amber iris
TONGUE = "#f0743a"

# Head tilt, shared by every render (matches the wordmark).
TILT = "translate(100 104) rotate(-12) scale(0.86) translate(-100 -104)"

# Head silhouette: rounded ears, tufted cheek ruff, chin.
HEAD = (
    "M100 30 C120 28 130 32 136 36 Q144 16 160 18 Q170 24 162 46 Q174 54 178 66 "
    "Q170 68 166 70 Q182 80 186 98 Q176 96 170 98 Q186 112 182 130 Q172 126 166 128 "
    "Q174 144 160 158 Q150 152 144 152 Q136 166 120 174 Q100 184 80 174 Q64 166 56 152 "
    "Q50 152 40 158 Q26 144 34 128 Q28 126 18 130 Q14 112 30 98 Q24 96 14 98 "
    "Q18 80 34 70 Q30 68 22 66 Q26 54 38 46 Q30 24 40 18 Q56 16 64 36 "
    "C70 32 80 28 100 30 Z"
)
# Inner ears, stripes, angry eyes, nose and the open roaring mouth.
INK_SHAPES = (
    "M144 34 Q150 24 158 24 Q162 30 158 40 Z M56 34 Q50 24 42 24 Q38 30 42 40 Z "
    "M94 36 L106 36 L100 52 Z M84 40 L90 38 L88 50 Z M116 40 L110 38 L112 50 Z "
    "M70 44 L80 46 L72 56 Z M130 44 L120 46 L128 56 Z "
    "M148 60 L170 66 L150 70 Z M152 82 L178 92 L154 92 Z M150 104 L178 114 L152 114 Z "
    "M146 124 L168 134 L148 134 Z M52 60 L30 66 L50 70 Z M48 82 L22 92 L46 92 Z "
    "M50 104 L22 114 L48 114 Z M54 124 L32 134 L52 134 Z "
    "M90 70 L98 72 L92 74 Z M110 70 L102 72 L108 74 Z "
    "M62 68 L86 76 L70 80 Z M138 68 L114 76 L130 80 Z "
    "M86 84 Q100 80 114 84 L104 96 Q100 99 96 96 Z "
    "M60 108 Q80 100 96 104 Q100 106 104 104 Q120 100 140 108 Q148 132 132 150 "
    "Q100 166 68 150 Q52 132 60 108 Z"
)
TONGUE_SHAPE = "M70 149 Q100 126 130 149 Q100 168 70 149 Z"
FANGS = (
    "M66 108 L78 106 L72 132 Z M134 108 L122 106 L128 132 Z "
    "M84 104 L90 104.5 L87 112 Z M116 104 L110 104.5 L113 112 Z "
    "M80 155 L88 157.5 L86 138 Z M120 155 L112 157.5 L114 138 Z"
)


def tiger(size, cx, cy, head=WHITE, ink=INK, detail=True):
    """The tiger fitted in a `size` square centred on (cx, cy)."""
    s = size / 200
    t = f"translate({cx - 100 * s:.2f} {cy - 100 * s:.2f}) scale({s:.4f})"
    body = f'<path fill="{head}" d="{HEAD}"/>'
    if detail:
        body += (
            f'<path fill="{ink}" d="{INK_SHAPES}"/>'
            f'<circle cx="74" cy="75" r="2.6" fill="{EYE}"/>'
            f'<circle cx="126" cy="75" r="2.6" fill="{EYE}"/>'
            f'<path fill="{TONGUE}" d="{TONGUE_SHAPE}"/>'
            f'<path fill="{head}" d="{FANGS}"/>'
        )
    return f'<g transform="{t}"><g transform="{TILT}">{body}</g></g>'


def svg(size, body):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 {size} {size}">{body}</svg>'
    )


def tauri_icon(source, out_dir, png_size=None):
    """Renders `source` with the Tauri CLI (no extra tools needed)."""
    npx = shutil.which("npx") or "npx"
    cmd = [npx, "--no-install", "tauri", "icon", source, "-o", out_dir]
    if png_size:
        cmd += ["-p", str(png_size)]
    subprocess.run(cmd, check=True, cwd=HERE, capture_output=True)


def write(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


GRADIENT = (
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
    f'<stop offset="0" stop-color="{ORANGE_TOP}"/><stop offset="1" stop-color="{ORANGE}"/>'
    "</linearGradient></defs>"
)

# App icon, Apple grid: 824px rounded square inside a 1024 canvas.
APP_ICON = svg(
    1024,
    GRADIENT
    + '<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)"/>'
    + tiger(824, 512, 512),
)


def tray_svg(bg, glyph):
    return svg(32, f'<rect x="0" y="0" width="32" height="32" rx="7" fill="{bg}"/>{glyph}')


TRAY = {
    # Idle: the app icon in small.
    "tray-idle.png": tray_svg(ORANGE, tiger(35, 16, 16)),
    # Dictating: dark tile with orange stripes, clearly different from idle.
    "tray-microphone.png": tray_svg(INK, tiger(35, 16, 16, ink=ORANGE)),
}
for i in range(12):
    a0 = math.radians(i * 30 - 90)
    a1 = a0 + math.radians(270)
    r = 11
    p0 = (16 + r * math.cos(a0), 16 + r * math.sin(a0))
    p1 = (16 + r * math.cos(a1), 16 + r * math.sin(a1))
    arc = (
        f'<path d="M{p0[0]:.2f} {p0[1]:.2f} A{r} {r} 0 1 1 {p1[0]:.2f} {p1[1]:.2f}" '
        f'fill="none" stroke="{WHITE}" stroke-width="2.2" stroke-linecap="round"/>'
    )
    TRAY[f"tray-spinner/frame_{i:02d}.png"] = tray_svg(
        ORANGE, arc + tiger(18, 16, 16, detail=False)
    )


def main():
    app_svg = os.path.join(HERE, "app-icon.svg")
    write(app_svg, APP_ICON)

    with tempfile.TemporaryDirectory() as tmp:
        # Every platform size, but only overwrite files the repo already ships.
        tauri_icon(app_svg, os.path.join(tmp, "app"))
        for root, _, files in os.walk(ICONS):
            for name in files:
                rel = os.path.relpath(os.path.join(root, name), ICONS)
                generated = os.path.join(tmp, "app", rel)
                if os.path.exists(generated):
                    shutil.copyfile(generated, os.path.join(ICONS, rel))
                    print("app  ", rel)

        for rel, text in TRAY.items():
            src = os.path.join(tmp, "tray.svg")
            write(src, text)
            out = os.path.join(tmp, "tray")
            tauri_icon(src, out, png_size=32)
            shutil.copyfile(os.path.join(out, "32x32.png"), os.path.join(ICONS, rel))
            print("tray ", rel)


if __name__ == "__main__":
    main()
