#!/usr/bin/env python3
"""Assemble the public GitHub Pages artifact from generated source files."""
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
DIST = (ROOT / "dist").resolve()
PAGES = ["index.html", "about.html", "contact.html", "admin.html", "mail.html", "privacy.html", "404.html"]
PAGE_DIRS = ["products", "solutions", "insights"]
IMAGE_FILES = [
    "favicon.svg",
    "hero-endoscopy-concept.webp",
    "torsh-wordmark.svg",
    "torsh-wordmark-light.svg",
    "torsh-wordmark-mono.svg",
]


def main() -> int:
    if DIST.parent != ROOT.resolve() or DIST.name != "dist":
        print("Refusing to build outside the repository dist directory.", file=sys.stderr)
        return 1
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    for name in PAGES:
        shutil.copy2(ROOT / name, DIST / name)
    for folder in PAGE_DIRS:
        shutil.copytree(ROOT / folder, DIST / folder)
    for folder in ["css", "js", "icons"]:
        shutil.copytree(ROOT / "assets" / folder, DIST / "assets" / folder)
    images = DIST / "assets" / "images"
    images.mkdir(parents=True)
    for name in IMAGE_FILES:
        shutil.copy2(ROOT / "assets" / "images" / name, images / name)
    print(f"Built public dist with {len(PAGES) + sum(1 for folder in PAGE_DIRS for _ in (ROOT / folder).glob('*.html'))} pages.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
