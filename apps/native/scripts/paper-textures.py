"""Seamless paper textures for the redesign's ticket and punch card.

Each texture is an alpha mask: the app tints it by mode (warm brown on light
paper, a pale tint on graphite), so one file serves both. Paper is three
layers: soft cloudy variation in the pulp's density, scattered fibres, and a
faint surface tooth. Noise is shaped in the frequency domain, so every layer
wraps at the tile's edges; fibres are drawn with wraparound.

Run: python3 apps/native/scripts/paper-textures.py
Writes apps/native/assets/paper-<name>@2x.png and @3x.png (256pt tiles).
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

TILE_PT = 256
SIZE = TILE_PT * 3
OUT = Path(__file__).resolve().parent.parent / "assets"


def band_noise(rng, size, low, high):
    """Tileable noise with wavelengths between `low` and `high` pixels."""
    white = rng.standard_normal((size, size))
    fy = np.fft.fftfreq(size)[:, None]
    fx = np.fft.fftfreq(size)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    keep = (f >= 1 / high) & (f <= 1 / low)
    # A 1/f falloff inside the band: clouds, not static.
    shaped = np.fft.ifft2(np.fft.fft2(white) * keep / np.maximum(f, 1e-6)).real
    shaped -= shaped.mean()
    return shaped / (np.abs(shaped).max() + 1e-9)


def fibres(rng, size, count, length, width, alpha, horizontal_bias):
    """Short curved strands, a little more along the machine direction."""
    layer = Image.new("L", (size * 3, size * 3), 0)
    draw = ImageDraw.Draw(layer)
    for _ in range(count):
        x, y = rng.uniform(0, size, 2) + size
        angle = rng.normal(0, np.pi * (1 - horizontal_bias)) if rng.random() < 0.7 else rng.uniform(0, np.pi)
        steps = int(rng.uniform(*length) / 3)
        curl = rng.normal(0, 0.03)
        w = rng.uniform(*width)
        a = int(255 * rng.uniform(*alpha))
        points = []
        for _ in range(steps):
            points.append((x, y))
            angle += curl + rng.normal(0, 0.02)
            x += 3 * np.cos(angle)
            y += 3 * np.sin(angle)
        # Drawn once in each neighbouring tile, so strands cross the edges cleanly.
        for dx in (-size, 0, size):
            for dy in (-size, 0, size):
                draw.line([(px + dx, py + dy) for px, py in points], fill=a, width=max(1, round(w)))
    layer = layer.filter(ImageFilter.GaussianBlur(0.6))
    return np.asarray(layer, dtype=np.float32)[size:2 * size, size:2 * size] / 255


def specks(rng, size, count, radius, alpha):
    layer = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(layer)
    for _ in range(count):
        x, y = rng.uniform(0, size, 2)
        r = rng.uniform(*radius)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=int(255 * rng.uniform(*alpha)))
    return np.asarray(layer.filter(ImageFilter.GaussianBlur(0.5)), dtype=np.float32) / 255


def compose(name, seed, mottle, cloud, fibre, tooth, speck=None):
    rng = np.random.default_rng(seed)
    # Pulp density: broad clouds plus smaller flecks of the same noise.
    pulp = 0.65 * band_noise(rng, SIZE, 60, 500) + 0.35 * band_noise(rng, SIZE, 12, 60)
    a = mottle * np.clip(pulp * 0.5 + 0.5, 0, 1) ** 1.6
    a += cloud * np.clip(band_noise(rng, SIZE, 150, 900), 0, 1)
    a += fibres(rng, SIZE, **fibre)
    a += tooth * np.clip(band_noise(rng, SIZE, 2, 6) * 0.5 + 0.5, 0, 1)
    if speck:
        a += specks(rng, SIZE, **speck)
    a = np.clip(a, 0, 1)
    rgba = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (a * 255).round().astype(np.uint8)
    image = Image.fromarray(rgba, "RGBA")
    image.save(OUT / f"paper-{name}@3x.png", optimize=True)
    image.resize((TILE_PT * 2, TILE_PT * 2), Image.LANCZOS).save(OUT / f"paper-{name}@2x.png", optimize=True)
    print(name, f"mean alpha {a.mean():.3f}")


# Cotton: soft clouds, long fine fibres, almost no tooth.
compose("cotton", 11, mottle=0.2, cloud=0.08,
        fibre=dict(count=700, length=(14, 48), width=(1, 1.2), alpha=(0.08, 0.2), horizontal_bias=0.35),
        tooth=0.05)
# Recycled: denser shorter fibres and a few inclusions, like a tag or a stub.
compose("recycled", 23, mottle=0.2, cloud=0.06,
        fibre=dict(count=1400, length=(6, 24), width=(1, 1.2), alpha=(0.1, 0.24), horizontal_bias=0.2),
        tooth=0.07, speck=dict(count=24, radius=(0.7, 1.6), alpha=(0.2, 0.45)))
# Card stock: smooth and quiet, only the pulp's clouds and a faint tooth.
compose("stock", 37, mottle=0.22, cloud=0.1,
        fibre=dict(count=220, length=(12, 40), width=(1, 1.2), alpha=(0.06, 0.16), horizontal_bias=0.5),
        tooth=0.06)
