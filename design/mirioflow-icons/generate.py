"""Generates the Mirioflow app icon and tray icons. See README.md.

Artwork: a white roaring tiger face on orange. The tiger is drawn in a 64x64
box; the same paths are used by src/components/MirioflowWordmark.tsx.
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

# Head silhouette: pointed ears, spiky cheek ruff, chin.
HEAD = (
    "M14 7L25 15Q32 12.5 39 15L50 7L51 21L58 27L53 31L59 38L52 41L54 48L43 51"
    "L32 58L21 51L10 48L12 41L5 38L11 31L6 27L13 21Z"
)
# Shapes cut out of the head in the background colour: inner ears, forehead and
# cheek stripes, angry eyes, nose and the open roaring mouth.
CUTS = (
    "M16.5 11L23 15.5L17.5 18Z M47.5 11L41 15.5L46.5 18Z"
    "M29.5 15L34.5 15L32 23Z M21 19.5L27.5 21L22.5 24.5Z M43 19.5L36.5 21L41.5 24.5Z"
    "M18 28.5L28 31.5L20 33Z M46 28.5L36 31.5L44 33Z"
    "M8.5 32.5L17 34.5L10 36Z M55.5 32.5L47 34.5L54 36Z"
    "M11 42.5L18 41.5L13 44.5Z M53 42.5L46 41.5L51 44.5Z"
    "M28.5 35.5L35.5 35.5L32 39Z"
    "M22.5 41.5Q32 37.5 41.5 41.5L38.5 51Q32 54.5 25.5 51Z"
)
# Fangs, drawn back on top of the mouth in the head colour.
FANGS = (
    "M25 41.6L28.6 40.5L26.6 47Z M39 41.6L35.4 40.5L37.4 47Z"
    "M28.5 52.3L30.5 52.9L29.2 49.5Z M35.5 52.3L33.5 52.9L34.8 49.5Z"
)


def tiger(scale, cx, cy, fg, cut, detail=True):
    t = f"translate({cx - 32 * scale:.2f} {cy - 32 * scale:.2f}) scale({scale})"
    s = f'<g transform="{t}"><path d="{HEAD}" fill="{fg}"/>'
    if detail:
        s += f'<path d="{CUTS}" fill="{cut}"/><path d="{FANGS}" fill="{fg}"/>'
    return s + "</g>"


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


# App icon, Apple grid: 824px rounded square inside a 1024 canvas.
APP_ICON = svg(
    1024,
    f"""
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{ORANGE_TOP}"/><stop offset="1" stop-color="{ORANGE}"/>
  </linearGradient>
</defs>
<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)"/>
{tiger(10, 512, 524, WHITE, ORANGE)}
""",
)


def tray_svg(bg, glyph):
    return svg(32, f'<rect x="0" y="0" width="32" height="32" rx="7" fill="{bg}"/>{glyph}')


TRAY = {
    "tray-idle.png": tray_svg(ORANGE, tiger(0.46, 16, 16.4, WHITE, ORANGE)),
    "tray-microphone.png": tray_svg(WHITE, tiger(0.46, 16, 16.4, ORANGE, WHITE)),
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
        ORANGE, arc + tiger(0.2, 16, 16.3, WHITE, ORANGE, detail=False)
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
