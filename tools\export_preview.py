#!/usr/bin/env python3
"""Export the TORSH static website as one offline review HTML file.

Uses the Python standard library only. Production files are never modified.
"""
from __future__ import annotations
import argparse
import base64
import html
import json
import mimetypes
import posixpath
import re
import sys
from pathlib import Path
from urllib.parse import quote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
ROUTER = '\n(() => {\n  "use strict";\n  const pages = JSON.parse(document.getElementById("preview-pages").textContent);\n  const root = document.getElementById("preview-root");\n  let activeRoute = "index.html";\n  let firstRender = true;\n  function render() {\n    let raw = window.location.hash.startsWith("#/") ? window.location.hash.slice(2) : "index.html";\n    const cut = raw.indexOf("?");\n    const routePart = cut === -1 ? raw : raw.slice(0, cut);\n    const params = new URLSearchParams(cut === -1 ? "" : raw.slice(cut + 1));\n    let route;\n    try { route = decodeURIComponent(routePart); } catch { route = "404.html"; }\n    if (!Object.prototype.hasOwnProperty.call(pages, route)) route = "404.html";\n    const changed = activeRoute !== route || firstRender;\n    if (changed) {\n      root.innerHTML = pages[route].body;\n      document.title = pages[route].title;\n      activeRoute = route;\n      window.TorshSite?.refresh();\n    }\n    const section = params.get("section");\n    requestAnimationFrame(() => {\n      const target = section ? document.getElementById(section) : null;\n      if (target) {\n        target.scrollIntoView({ behavior: "instant", block: "start" });\n        if (section === "main") target.focus({ preventScroll: true });\n      } else if (changed) {\n        window.scrollTo({ top: 0, left: 0, behavior: "instant" });\n        if (!firstRender) document.getElementById("main")?.focus({ preventScroll: true });\n      }\n      firstRender = false;\n    });\n  }\n  window.addEventListener("hashchange", render);\n  document.addEventListener("click", event => {\n    const a = event.target instanceof Element ? event.target.closest(\'a[href^="#/"]\') : null;\n    if (a && a.getAttribute("href") === window.location.hash) {\n      event.preventDefault();\n      render();\n    }\n  });\n  render();\n})();\n'


def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    return "data:" + mime + ";base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def make_page(path: Path) -> tuple[str, dict[str, str]]:
    source = path.read_text(encoding="utf-8")
    route = path.relative_to(ROOT).as_posix()
    body_match = re.search(r"<body\b[^>]*>(.*?)</body>", source, re.S | re.I)
    title_match = re.search(r"<title>(.*?)</title>", source, re.S | re.I)
    if not body_match or not title_match:
        raise ValueError(f"Missing body/title in {path}")
    body = body_match.group(1)

    def image(match: re.Match[str]) -> str:
        src = html.unescape(match.group(2))
        if urlsplit(src).scheme:
            return match.group(0)
        target = (path.parent / src).resolve()
        return match.group(1) + data_uri(target) + match.group(3)

    body = re.sub(r'(<img\b[^>]*\bsrc=")(.*?)(")', image, body, flags=re.I)

    def link(match: re.Match[str]) -> str:
        href = html.unescape(match.group(2))
        parsed = urlsplit(href)
        if parsed.scheme or parsed.netloc:
            return match.group(0)
        destination = posixpath.normpath(posixpath.join(posixpath.dirname(route), parsed.path)) if parsed.path else route
        new_href = "#/" + destination
        if parsed.fragment:
            new_href += "?section=" + quote(parsed.fragment, safe="")
        return match.group(1) + html.escape(new_href, quote=True) + match.group(3)

    body = re.sub(r'(<a\b[^>]*\bhref=")(.*?)(")', link, body, flags=re.I)
    return route, {"title": html.unescape(title_match.group(1)), "body": body}


def export(output: Path) -> None:
    files = list(ROOT.glob("*.html")) + list((ROOT / "products").glob("*.html"))
    files = [p for p in files if p.resolve() != output.resolve()]
    pages = dict(make_page(p) for p in sorted(files))
    if "index.html" not in pages:
        raise ValueError("index.html not found")
    css = (ROOT / "assets/css/master.css").read_text(encoding="utf-8")
    config = (ROOT / "assets/js/site-config.js").read_text(encoding="utf-8")
    main = (ROOT / "assets/js/main.js").read_text(encoding="utf-8")
    payload = json.dumps(pages, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    favicon = data_uri(ROOT / "assets/images/favicon.svg")
    result = (
        '<!doctype html><html lang="en" class="no-js"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta name="theme-color" content="#252B35"><meta name="robots" content="noindex, nofollow">'
        '<title>TORSH Medical Technologies | Interactive preview</title>'
        f'<link rel="icon" type="image/svg+xml" href="{favicon}"><style>{css}</style></head><body>'
        '<noscript><p class="notice">This all-pages preview needs JavaScript for navigation. '
        'The website package includes standard HTML pages.</p></noscript>'
        f'<div id="preview-root">{pages["index.html"]["body"]}</div>'
        f'<script id="preview-pages" type="application/json">{payload}</script>'
        f'<script>{config}</script><script>{main}</script><script>{ROUTER}</script></body></html>'
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(result, encoding="utf-8")
    print(f"Exported {len(pages)} pages to {output}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT.parent / "TORSH-Website-Content-Refresh-Preview.html")
    args = parser.parse_args()
    try:
        export(args.output.resolve())
    except (OSError, ValueError) as error:
        print(f"Preview export failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
