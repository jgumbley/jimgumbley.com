#!/usr/bin/env python3
"""Export the reviewed wedding SVG masters to their required PNG formats."""

from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image


ASSETS = Path(__file__).parent / "static" / "assets"


def render(source: str, width: int, height: int) -> bytes:
    return cairosvg.svg2png(
        url=str(ASSETS / source),
        output_width=width,
        output_height=height,
    )


def save_png(name: str, image: Image.Image) -> None:
    image.save(ASSETS / name, format="PNG", optimize=True)


favicon = Image.open(BytesIO(render("flower-favicon.svg", 32, 32))).convert("RGBA")
save_png("favicon-32.png", favicon)

touch_flower = Image.open(BytesIO(render("flower-favicon.svg", 180, 180))).convert("RGBA")
touch_icon = Image.new("RGB", (180, 180), "#f8f4e8")
touch_icon.paste(touch_flower, mask=touch_flower.getchannel("A"))
save_png("apple-touch-icon.png", touch_icon)

social = Image.open(BytesIO(render("social-preview.svg", 1200, 630))).convert("RGB")
save_png("social-preview.png", social)
