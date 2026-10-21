#!/usr/bin/env python3
"""Compatibility wrapper for the current Playwright/Node browser QA."""
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    node = shutil.which("node")
    if not node:
        print("Node.js is required. Run: node tools/browser_qa.cjs", file=sys.stderr)
        return 1
    return subprocess.run([node, str(ROOT / "tools/browser_qa.cjs")], cwd=ROOT, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
