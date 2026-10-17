#!/usr/bin/env python3
"""Check TORSH source pages, local links, image attributes and SVG syntax.

Python standard library only. This is a source check, not a browser or
accessibility certification. Run from any directory: python tools/check_site.py
"""
from __future__ import annotations
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import json
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]

class Page(HTMLParser):
    def __init__(self, source: str):
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.refs: list[str] = []
        self.icons: list[str] = []
        self.h1 = 0
        self.title = 0
        self.lang = False
        self.missing_alt = 0
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a: self.ids.append(a['id'])
        for key in ('href', 'src'):
            if a.get(key): self.refs.append(a[key])
        if a.get('data-torsh-icon'): self.icons.append(a['data-torsh-icon'])
        if tag == 'h1': self.h1 += 1
        if tag == 'title': self.title += 1
        if tag == 'html' and a.get('lang') == 'en': self.lang = True
        if tag == 'img' and 'alt' not in a: self.missing_alt += 1

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)


def main() -> int:
    try:
        files = sorted(
            list(ROOT.glob('*.html'))
            + list((ROOT / 'products').glob('*.html'))
            + list((ROOT / 'solutions').glob('*.html'))
            + list((ROOT / 'insights').glob('*.html'))
        )
        pages = {f.resolve(): Page(f.read_text(encoding='utf-8')) for f in files}
        entries = json.loads((ROOT / 'assets/icons/manifest.json').read_text(encoding='utf-8'))
        icon_ids = {item['id'] for item in entries}
        problems: list[str] = []
        refs = 0
        for path, page in pages.items():
            name = path.relative_to(ROOT).as_posix()
            if page.h1 != 1: problems.append(f'{name}: expected exactly one h1')
            if page.title != 1: problems.append(f'{name}: expected exactly one title')
            if not page.lang: problems.append(f'{name}: missing document language')
            if page.missing_alt: problems.append(f'{name}: image missing alt attribute')
            for item, count in Counter(page.ids).items():
                if count > 1: problems.append(f'{name}: duplicate ID {item}')
            for icon in page.icons:
                if icon not in icon_ids: problems.append(f'{name}: unknown icon {icon}')
            for ref in page.refs:
                parts = urlsplit(ref)
                if parts.scheme or parts.netloc: continue
                refs += 1
                target = (path.parent / unquote(parts.path)).resolve() if parts.path else path
                if not target.is_file():
                    problems.append(f'{name}: missing target {ref}')
                    continue
                if parts.fragment and target in pages and unquote(parts.fragment) not in pages[target].ids:
                    problems.append(f'{name}: missing fragment {ref}')
        svgs = list((ROOT / 'assets').rglob('*.svg'))
        for svg in svgs:
            try: ET.parse(svg)
            except ET.ParseError as error: problems.append(f'{svg.relative_to(ROOT)}: invalid SVG XML: {error}')
        for path in ROOT.rglob('*'):
            if path.suffix.lower() in {'.ttf', '.otf', '.woff', '.woff2'}:
                problems.append(f'Unexpected font file: {path.relative_to(ROOT)}')
        if problems:
            print('\n'.join(problems), file=sys.stderr)
            return 1
        print(f'PASS: {len(files)} pages; {refs} local references; {len(icon_ids)} icon definitions; {len(svgs)} SVG files.')
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f'Site check failed: {error}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
