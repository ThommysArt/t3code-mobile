#!/usr/bin/env python3
"""Regenerate Android launcher/splash density assets + web favicons from assets/icon.png.

Run after replacing assets/icon.png (and optionally assets/splash-icon.png):

  python3 scripts/sync-app-icons.py

Native Android icons live under android/app/src/main/res and are NOT refreshed by
Metro/JS-only reloads — rebuild/reinstall the app after running this.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "icon.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

LAUNCHER_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}
FOREGROUND_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}
SPLASH_SIZES = {
    "mdpi": 288,
    "hdpi": 432,
    "xhdpi": 576,
    "xxhdpi": 864,
    "xxxhdpi": 1152,
}


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)} {img.size[0]}x{img.size[1]}")


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    if src.size != (1024, 1024):
        raise SystemExit(f"Expected 1024x1024 icon at {SRC}, got {src.size}")

    def resize(size: int) -> Image.Image:
        return src.resize((size, size), Image.Resampling.LANCZOS)

    for density, size in LAUNCHER_SIZES.items():
        icon = resize(size)
        save_png(icon, RES / f"mipmap-{density}" / "ic_launcher.webp")
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        round_icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        round_icon.paste(icon, (0, 0), mask=mask)
        save_png(round_icon, RES / f"mipmap-{density}" / "ic_launcher_round.webp")

    for density, size in FOREGROUND_SIZES.items():
        save_png(resize(size), RES / f"mipmap-{density}" / "ic_launcher_foreground.webp")

    for density, size in SPLASH_SIZES.items():
        splash = resize(size)
        save_png(splash, RES / f"drawable-{density}" / "splashscreen_logo.png")
        save_png(splash, RES / f"drawable-night-{density}" / "splashscreen_logo.png")

    images = ROOT / "assets" / "images"
    save_png(resize(48), images / "favicon.png")
    save_png(resize(192), images / "icon-192.png")
    save_png(resize(512), images / "icon-512.png")
    save_png(src, ROOT / "assets" / "icon.png")
    save_png(src, ROOT / "assets" / "splash-icon.png")
    save_png(src, images / "icon.png")
    save_png(src, images / "adaptive-icon.png")
    save_png(src, images / "splash-icon.png")
    print("done")


if __name__ == "__main__":
    main()
