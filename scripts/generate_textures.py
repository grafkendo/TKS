#!/usr/bin/env python3
"""Generate procedural albedo textures for buildings and spider drones."""

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT_BUILDINGS = ROOT / "public" / "assets" / "buildings"
OUT_MECHS = ROOT / "public" / "assets" / "mechs"
SIZE = 512


def noise_layer(w: int, h: int, base: tuple[int, int, int], spread: int = 18) -> Image.Image:
    img = Image.new("RGB", (w, h), base)
    px = img.load()
    rng = random.Random(42)
    for y in range(h):
        for x in range(w):
            n = rng.randint(-spread, spread)
            r = max(0, min(255, base[0] + n))
            g = max(0, min(255, base[1] + n))
            b = max(0, min(255, base[2] + n))
            px[x, y] = (r, g, b)
    return img.filter(ImageFilter.GaussianBlur(radius=0.6))


def concrete_facade() -> Image.Image:
    img = noise_layer(SIZE, SIZE, (130, 135, 142))
    draw = ImageDraw.Draw(img)
    panel = SIZE // 4
    for x in range(0, SIZE, panel):
        draw.line([(x, 0), (x, SIZE)], fill=(95, 98, 104), width=2)
    for y in range(0, SIZE, panel):
        draw.line([(0, y), (SIZE, y)], fill=(95, 98, 104), width=2)
    rng = random.Random(7)
    for _ in range(120):
        x, y = rng.randint(0, SIZE), rng.randint(0, SIZE)
        draw.ellipse([x, y, x + rng.randint(4, 18), y + rng.randint(4, 18)], fill=(110, 112, 118))
    return img


def glass_facade() -> Image.Image:
    img = noise_layer(SIZE, SIZE, (58, 92, 118), spread=12)
    draw = ImageDraw.Draw(img)
    cols, rows = 6, 8
    cw, rh = SIZE // cols, SIZE // rows
    for row in range(rows):
        for col in range(cols):
            x0, y0 = col * cw + 3, row * rh + 3
            x1, y1 = (col + 1) * cw - 3, (row + 1) * rh - 3
            tint = (90 + row * 4, 140 + col * 3, 175 + row * 2)
            draw.rectangle([x0, y0, x1, y1], fill=tint)
            if (row + col) % 3 == 0:
                draw.rectangle([x0 + 4, y0 + 4, x1 - 4, y1 - 8], fill=(170, 210, 235))
    for x in range(0, SIZE, cw):
        draw.line([(x, 0), (x, SIZE)], fill=(30, 45, 58), width=3)
    for y in range(0, SIZE, rh):
        draw.line([(0, y), (SIZE, y)], fill=(30, 45, 58), width=3)
    return img


def brick_facade() -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE), (72, 42, 34))
    draw = ImageDraw.Draw(img)
    brick_w, brick_h = 64, 28
    mortar = (58, 38, 30)
    rng = random.Random(19)
    row = 0
    for y in range(0, SIZE, brick_h + 4):
        offset = (brick_w // 2) if row % 2 else 0
        for x in range(-brick_w, SIZE + brick_w, brick_w + 4):
            shade = rng.randint(-16, 16)
            color = (135 + shade, 68 + shade // 2, 52 + shade // 3)
            draw.rectangle([x + offset, y, x + offset + brick_w, y + brick_h], fill=color)
        draw.line([(0, y + brick_h + 2), (SIZE, y + brick_h + 2)], fill=mortar, width=3)
        row += 1
    return img.filter(ImageFilter.GaussianBlur(radius=0.4))


def spider_drone() -> Image.Image:
    img = noise_layer(SIZE, SIZE, (38, 42, 48), spread=22)
    draw = ImageDraw.Draw(img)
    cx, cy = SIZE // 2, SIZE // 2
    for ring in range(5, 0, -1):
        r = 80 + ring * 28
        shade = 30 + ring * 8
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(shade, shade + 4, shade + 8))
    for i in range(12):
        ang = i * math.pi / 6
        x0 = cx + math.cos(ang) * 60
        y0 = cy + math.sin(ang) * 40
        x1 = cx + math.cos(ang) * 200
        y1 = cy + math.sin(ang) * 140
        draw.line([(x0, y0), (x1, y1)], fill=(55, 58, 62), width=6)
    draw.ellipse([cx - 28, cy - 38, cx + 28, cy + 10], fill=(22, 24, 28))
    draw.ellipse([cx - 18, cy - 22, cx - 6, cy - 10], fill=(220, 40, 35))
    draw.ellipse([cx + 6, cy - 22, cx + 18, cy - 10], fill=(220, 40, 35))
    draw.rectangle([cx - 8, cy + 20, cx + 8, cy + 70], fill=(70, 74, 80))
    return img


def main() -> None:
    OUT_BUILDINGS.mkdir(parents=True, exist_ok=True)
    OUT_MECHS.mkdir(parents=True, exist_ok=True)

    textures = {
        OUT_BUILDINGS / "concrete_facade.png": concrete_facade,
        OUT_BUILDINGS / "glass_facade.png": glass_facade,
        OUT_BUILDINGS / "brick_facade.png": brick_facade,
        OUT_MECHS / "spider_drone_albedo.png": spider_drone,
    }

    for path, fn in textures.items():
        img = fn()
        img.save(path, optimize=True)
        print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
