#!/usr/bin/env python3
"""Freeze the curated investigation diff cards into the bundle.

Reads data/processed/experiments.csv through backend.services.diff,
validates that every curated pair exists, and writes
data/bundle/investigation_diffs.json — the "what changed vs what held"
cards the dashboard and /api/diffs serve.

Usage: python data/pipelines/build_investigation_diffs.py
Run after normalize_experiments.py.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.services import diff  # noqa: E402

OUT = ROOT / "data" / "bundle" / "investigation_diffs.json"


def main() -> int:
    cards = diff.build_cards()
    missing = [s["id"] for s in diff.CURATED
               if not any(c["id"] == s["id"] for c in cards)]
    if missing:
        print(f"[FAIL] curated pairs with unknown run ids: {missing} — "
              "check data/processed/experiments.csv", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({
            "generated": "build_investigation_diffs.py",
            "source": "data/processed/experiments.csv",
            "cards": cards,
        }, indent=1, ensure_ascii=False) + "\n",
        encoding="utf-8")
    print(f"[OK] {len(cards)} diff cards -> {OUT.relative_to(ROOT)}")
    for c in cards:
        print(f"     {c['id']}: {len(c['changed'])} changed / "
              f"{len(c['held'])} held")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
