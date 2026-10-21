#!/usr/bin/env python3
"""Synchronise inline and standalone TORSH SVG icons from manifest.json.

Run from any directory: python path/to/tools/sync_icons.py
Python standard library only. Non-icon page content is preserved.
"""
from __future__ import annotations
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SVG_RE = re.compile(r'(<svg\b[^>]*\bdata-torsh-icon="([^"]+)"[^>]*>)(.*?)(</svg>)', re.S)

def main() -> int:
    try:
        folder = ROOT / 'assets/icons'
        entries = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
        manifest = {entry['id']: entry for entry in entries}
        if len(manifest) != len(entries):
            raise ValueError('Icon IDs must be unique.')
        css = (ROOT / 'assets/css/master.css').read_text(encoding='utf-8')
        def token(name: str) -> str:
            match = re.search(r'--color-' + name + r'\s*:\s*(#[0-9a-fA-F]{6})\s*;', css)
            if not match:
                raise ValueError(f'Missing hex colour token --color-{name}.')
            return match.group(1)
        graphite, blue = token('graphite'), token('electric')
        style = f'<style>svg{{color:{graphite}}}[data-tone="accent"]{{stroke:{blue}}}[data-tone="fill"]{{fill:{blue};stroke:none}}</style>'
        symbols = []
        for entry in entries:
            name = entry['id']
            if not re.fullmatch(r'[a-z0-9-]+', name):
                raise ValueError(f'Invalid icon ID: {name}')
            common = f'viewBox="{entry["viewBox"]}" fill="none" stroke="currentColor" stroke-width="{entry["strokeWidth"]}" stroke-linecap="round" stroke-linejoin="round"'
            label = html.escape(entry['label'], quote=True)
            (folder / (name + '.svg')).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" {common} role="img" aria-label="{label}">{style}{entry["paths"]}</svg>\n', encoding='utf-8')
            symbols.append(f'<symbol id="torsh-{name}" {common}>{entry["paths"]}</symbol>')
        (folder / 'sprite.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg">' + style + ''.join(symbols) + '</svg>\n', encoding='utf-8')
        count = 0
        def replace(match: re.Match[str]) -> str:
            nonlocal count
            name = match.group(2)
            if name not in manifest:
                raise ValueError(f'Unknown inline icon: {name}')
            entry = manifest[name]
            opening = re.sub(r'\bviewBox="[^"]*"', f'viewBox="{entry["viewBox"]}"', match.group(1))
            opening = re.sub(r'\bstroke-width="[^"]*"', f'stroke-width="{entry["strokeWidth"]}"', opening)
            count += 1
            return opening + entry['paths'] + match.group(4)
        pages = (list(ROOT.glob('*.html')) + list((ROOT / 'products').glob('*.html'))
                 + list((ROOT / 'solutions').glob('*.html')) + list((ROOT / 'insights').glob('*.html')))
        for page in pages:
            text = page.read_text(encoding='utf-8')
            updated = SVG_RE.sub(replace, text)
            if text != updated:
                page.write_text(updated, encoding='utf-8')
        print(f'Synchronised {len(entries)} icons and {count} inline instances across {len(pages)} pages.')
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f'Icon sync failed: {error}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
